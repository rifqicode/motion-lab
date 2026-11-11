import {spawn, execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';

const execute = promisify(execFile);
let queue: Promise<void> = Promise.resolve();

export class LocalVoiceoverRuntime {
  constructor(readonly options: {repoRoot: string}) {}

  async status(): Promise<{available: boolean; reason?: string; device?: string}> {
    const cache = path.join(this.options.repoRoot, '.cache/chatterbox');
    try {
      await fs.access(path.join(cache, '.venv/bin/python'), fs.constants.X_OK);
      const ready = JSON.parse(await fs.readFile(path.join(cache, 'ready.json'), 'utf8'));
      if (ready.version !== 1 || !['cpu', 'cuda'].includes(ready.device)) throw new Error('Invalid readiness record');
      for (const file of ['ve.safetensors', 't3_cfg.safetensors', 's3gen.safetensors', 'tokenizer.json', 'conds.pt']) {
        const stat = await fs.lstat(path.join(cache, 'model', file));
        if (!stat.isFile() || stat.isSymbolicLink() || !stat.size) throw new Error('Incomplete model');
      }
      return {available: true, device: ready.device};
    } catch {
      return {available: false, reason: 'Chatterbox lokal belum siap. Jalankan node scripts/chatterbox/setup.mjs.'};
    }
  }

  async synthesize(input: {text: string; outputPath: string; signal: AbortSignal}): Promise<{durationMs: number; sampleRate: number}> {
    if (!input.text.trim() || input.text.length > 3000) throw new Error('Narasi harus berisi 1–3000 karakter.');
    let release!: () => void;
    const previous = queue;
    const slot = new Promise<void>(resolve => { release = resolve; });
    queue = previous.then(() => slot);
    try {
      await new Promise<void>((resolve, reject) => {
        const abort = () => { cleanup(); reject(new Error('Voice-over dibatalkan.')); };
        const cleanup = () => input.signal.removeEventListener('abort', abort);
        input.signal.addEventListener('abort', abort, {once: true});
        previous.then(() => { cleanup(); resolve(); });
        if (input.signal.aborted) abort();
      });
      input.signal.throwIfAborted();
      const status = await this.status();
      if (!status.available) throw new Error(status.reason);
      const cache = path.join(this.options.repoRoot, '.cache/chatterbox');
      await fs.mkdir(path.dirname(input.outputPath), {recursive: true});
      await new Promise<void>((resolve, reject) => {
        const child = spawn(path.join(cache, '.venv/bin/python'), [path.join(this.options.repoRoot, 'scripts/chatterbox/synthesize.py')], {
          cwd: this.options.repoRoot,
          env: {...process.env, HF_HOME: path.join(cache, 'hf'), HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1', HF_HUB_DISABLE_TELEMETRY: '1'},
          stdio: ['pipe', 'ignore', 'pipe'],
        });
        let stderr = '';
        let timedOut = false;
        const stop = () => child.kill('SIGKILL');
        const timer = setTimeout(() => { timedOut = true; stop(); }, 600_000);
        input.signal.addEventListener('abort', stop, {once: true});
        child.stderr.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-6000); });
        child.stdin.on('error', () => {});
        child.once('error', error => { clearTimeout(timer); input.signal.removeEventListener('abort', stop); reject(error); });
        child.once('close', code => {
          clearTimeout(timer);
          input.signal.removeEventListener('abort', stop);
          if (input.signal.aborted) reject(new Error('Voice-over dibatalkan.'));
          else if (timedOut) reject(new Error('Voice-over melebihi batas waktu sepuluh menit.'));
          else if (code !== 0) reject(new Error(`Chatterbox gagal (${code}): ${stderr}`));
          else resolve();
        });
        if (input.signal.aborted) stop();
        else child.stdin.end(JSON.stringify({text: input.text, outputPath: input.outputPath}));
      });
      input.signal.throwIfAborted();
      const stat = await fs.lstat(input.outputPath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 44 || stat.size > 24_000_000) throw new Error('Chatterbox menghasilkan file audio invalid.');
      const {stdout} = await execute('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate,codec_name:format=duration', '-of', 'json', input.outputPath], {signal: input.signal, timeout: 10_000});
      const metadata = JSON.parse(stdout);
      const durationMs = Number(metadata.format?.duration) * 1000;
      const sampleRate = Number(metadata.streams?.[0]?.sample_rate);
      if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 120_000 || sampleRate !== 24_000 || metadata.streams?.[0]?.codec_name !== 'pcm_s16le') throw new Error('Metadata audio Chatterbox invalid.');
      return {durationMs, sampleRate};
    } catch (error) {
      await fs.rm(input.outputPath, {force: true}).catch(() => {});
      throw error;
    } finally { release(); }
  }
}
