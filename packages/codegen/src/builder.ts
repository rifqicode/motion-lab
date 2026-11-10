import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile, spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {IdSchema, StudioError, sha256, type ShotSpec} from '@studio/studio-core';
import {readSourceFiles, validateSourceFiles, type SourceManifest} from './source.js';

const execute = promisify(execFile);
const bounded = (value: string): string => value.slice(-16_000);

export interface BuildResult {
  id: string;
  sourceId: string;
  status: 'ready';
  shots: ShotSpec[];
  durationFrames: number;
  fps: 30;
  width: 720;
  height: 1280;
  sourceHash: string;
  dependencyHash: string;
  runtimeHash: string;
  previewDir: string;
  createdAt: string;
  smokeFrames: number[];
  image: string;
  isolationChecks: Record<string, boolean>;
}

export type BuildProgressCallback = (stage: string) => void | Promise<void>;
export interface BuilderOptions {repoRoot: string; runtimeImage?: string; onProgress?: BuildProgressCallback}
interface Mount {source: string; target: string; readonly?: boolean}

export class StudioBuilder {
  private readonly repoRoot: string;
  private readonly image: string;
  private readonly workerDir: string;
  private readonly onProgress?: BuildProgressCallback;

  constructor(options: BuilderOptions) {
    this.repoRoot = path.resolve(options.repoRoot);
    this.image = options.runtimeImage ?? process.env.STUDIO_RUNTIME_IMAGE ?? 'devlikeapro/waha:latest';
    this.workerDir = path.join(this.repoRoot, 'apps/worker/runtime');
    this.onProgress = options.onProgress;
  }

  async status(): Promise<{available: boolean; image: string; reason?: string}> {
    const deadline = Date.now() + 20_000;
    const run = (args: string[]) => execute('docker', args, {timeout: Math.max(1, deadline - Date.now()), maxBuffer: 32_768});
    try {
      const version = await run(['version', '--format', '{{.Server.Version}}']);
      if (!version.stdout.trim()) throw new Error('Docker daemon tidak mengembalikan versi server.');
      const {stdout} = await run(['image', 'inspect', this.image, '--format', '{{.Id}}']);
      const image = stdout.trim();
      if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw new Error('Container image identity was not available.');
      return {available: true, image};
    } catch (error) {
      const detail = error as {code?: string; killed?: boolean; stderr?: string; message?: string};
      const diagnostic = bounded(detail.stderr || detail.message || String(error)).trim().slice(-1200);
      const reason = detail.killed
        ? 'Pemeriksaan Docker melewati batas 20 detik. Runtime mungkin sedang sibuk; coba periksa lagi.'
        : detail.code === 'ENOENT'
          ? 'Docker CLI belum tersedia di mesin ini.'
          : /no such image|image.*not found/i.test(diagnostic)
            ? `Image runtime belum tersedia lokal. Pilih image yang sudah terpasang. ${diagnostic}`
            : `Docker belum dapat digunakan. Pastikan daemon aktif lalu periksa runtime lagi. ${diagnostic}`;
      return {available: false, image: this.image, reason};
    }
  }

  private async dependenciesHash(): Promise<string> {
    return sha256(await fs.readFile(path.join(this.repoRoot, 'pnpm-lock.yaml')));
  }

  private async runtimeHash(image: string): Promise<string> {
    const names = (await fs.readdir(this.workerDir)).filter((name) => /\.(mjs|tsx|ts)$/.test(name)).sort();
    const files = await Promise.all(names.map(async (name) => [name, await fs.readFile(path.join(this.workerDir, name), 'utf8')]));
    return sha256(JSON.stringify({image, files}));
  }

  private dependencyMounts(): Mount[] {
    return [
      {source: path.join(this.repoRoot, 'node_modules'), target: path.join(this.repoRoot, 'node_modules'), readonly: true},
      ...['apps/cli', 'packages/renderer'].flatMap((part) => [
        {source: path.join(this.repoRoot, part, 'node_modules'), target: path.join(this.repoRoot, part, 'node_modules'), readonly: true},
        {source: path.join(this.repoRoot, part, 'package.json'), target: path.join(this.repoRoot, part, 'package.json'), readonly: true},
      ]),
      {source: this.workerDir, target: '/opt/studio-worker', readonly: true},
    ];
  }

  private async reportProgress(stage: string, onProgress?: BuildProgressCallback): Promise<void> {
    for (const callback of new Set([this.onProgress, onProgress])) if (callback) await callback(stage);
  }

  private async runContainer(image: string, mounts: Mount[], args: string[], options: {name: string; timeoutMs: number; signal?: AbortSignal; onProgress?: BuildProgressCallback}): Promise<void> {
    if (options.signal?.aborted) throw new StudioError('CANCELLED', 'Build cancelled.', 409);
    const uid = process.getuid?.() ?? 1000;
    const gid = process.getgid?.() ?? 1000;
    const command = ['run', '--rm', '--pull', 'never', '--name', options.name, '--network', 'none', '--read-only',
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '256', '--memory', '3g', '--cpus', '4',
      '--user', `${uid}:${gid}`, '--env', 'HOME=/tmp/studio-home', '--env', 'NODE_ENV=production', '--env', 'TMPDIR=/tmp',
      '--env', 'DBUS_SESSION_BUS_ADDRESS=/dev/null', '--env', 'NO_AT_BRIDGE=1',
      '--tmpfs', '/tmp:rw,nosuid,nodev,size=512m', '--tmpfs', '/dev/shm:rw,nosuid,nodev,size=256m'];
    for (const mount of [...this.dependencyMounts(), ...mounts]) {
      if (mount.source.includes(',') || mount.target.includes(',')) throw new StudioError('INVALID_PATH', 'Container mount paths may not contain commas.');
      command.push('--mount', `type=bind,src=${mount.source},dst=${mount.target}${mount.readonly ? ',readonly' : ''}`);
    }
    command.push('--entrypoint', 'node', image, ...args);
    let diagnostic = '';
    let lineBuffer = '';
    let stopped: StudioError | null = null;
    let progressWork = Promise.resolve();
    let progressError: unknown;
    const child = spawn('docker', command, {shell: false, stdio: ['ignore', 'pipe', 'pipe']});
    const cleanup = async () => { await execute('docker', ['rm', '-f', options.name], {timeout: 10_000, maxBuffer: 16_384}).catch(() => undefined); };
    const stop = (reason: StudioError) => {
      if (stopped) return;
      stopped = reason;
      void cleanup().finally(() => child.kill('SIGTERM'));
    };
    const abort = () => stop(new StudioError('CANCELLED', 'Build cancelled.', 409));
    options.signal?.addEventListener('abort', abort, {once: true});
    const timer = setTimeout(() => stop(new StudioError('BUILD_TIMEOUT', 'Restricted build exceeded its time budget.', 408)), options.timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      diagnostic = bounded(diagnostic + text);
      lineBuffer = bounded(lineBuffer + text);
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() ?? '';
      for (const line of lines) {
        try {
          const event = JSON.parse(line) as {type?: string; stage?: string};
          if (event.type === 'progress' && typeof event.stage === 'string'
              && ['typecheck', 'browser-build', 'render-build', 'smoke-checking'].includes(event.stage)) {
            const stage = event.stage;
            progressWork = progressWork.then(() => this.reportProgress(stage, options.onProgress)).catch(error => { progressError ??= error; });
          }
        }
        catch { /* Non-event output remains in the bounded build diagnostic. */ }
      }
    });
    child.stderr.on('data', (chunk: Buffer) => { diagnostic = bounded(diagnostic + chunk.toString()); });
    try {
      const code = await new Promise<number | null>((resolve, reject) => {
        child.once('error', reject);
        child.once('close', resolve);
      });
      await progressWork;
      if (stopped) throw stopped;
      if (code !== 0) {
        if (/Timed out after \d+ ms while trying to connect to the browser\b/i.test(diagnostic)) {
          throw new StudioError('BROWSER_START_TIMEOUT', `Chromium belum berhasil mulai dalam batas waktu startup. Source tersimpan; periksa runtime lalu coba ulang build.\n${diagnostic}`, 503);
        }
        throw new StudioError('BUILD_FAILED', `Restricted worker exited with code ${code}.\n${diagnostic}`, 422);
      }
      if (progressError) throw new StudioError('PROGRESS_FAILED', `Build progress could not be saved: ${progressError instanceof Error ? progressError.message : String(progressError)}`, 500);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      await cleanup();
      await progressWork;
    }
  }

  async build(input: {projectDir: string; sourceId: string; shots: ShotSpec[]; buildId: string; signal?: AbortSignal; onProgress?: BuildProgressCallback}): Promise<BuildResult> {
    const {projectDir, sourceId, buildId, shots, signal} = input;
    IdSchema.parse(sourceId); IdSchema.parse(buildId);
    const runtime = await this.status();
    if (!runtime.available) throw new StudioError('RUNTIME_UNAVAILABLE', runtime.reason ?? 'Restricted runtime is unavailable.', 503);
    const files = await readSourceFiles(projectDir, sourceId);
    validateSourceFiles({baseRevisionId: null, summary: 'Validate the sealed build input.', shots, changedFiles: files, deletedFiles: []});
    const sourceDir = path.join(projectDir, 'source', sourceId);
    const manifest = JSON.parse(await fs.readFile(path.join(sourceDir, 'manifest.json'), 'utf8')) as SourceManifest;
    if (JSON.stringify(shots) !== JSON.stringify(manifest.shots)) throw new StudioError('INVALID_SOURCE', 'Build shots do not match the source snapshot.');
    const buildsDir = path.join(projectDir, 'builds');
    await fs.mkdir(buildsDir, {recursive: true});
    if ((await fs.lstat(buildsDir)).isSymbolicLink()) throw new StudioError('INVALID_PATH', 'Build directory may not be a symbolic link.');
    const buildDir = path.join(buildsDir, buildId);
    await fs.mkdir(buildDir, {mode: 0o700});
    const dependencyHash = await this.dependenciesHash();
    const runtimeHash = await this.runtimeHash(runtime.image);
    const hostSentinelPath = path.join(projectDir, `.isolation-${buildId}`);
    await fs.writeFile(hostSentinelPath, 'Local runtime isolation fixture; no secret material.\n', {flag: 'wx', mode: 0o600});
    const request = {repoRoot: this.repoRoot, sourceId, buildId, shots, hostSentinelPath, files: files.map((file) => ({path: file.path}))};
    await fs.writeFile(path.join(buildDir, 'input.json'), JSON.stringify(request), {flag: 'wx', mode: 0o600});
    try {
      await this.runContainer(runtime.image, [
        {source: sourceDir, target: '/work/source', readonly: true},
        {source: buildDir, target: '/work/output'},
      ], ['/opt/studio-worker/build.mjs', '/work/output/input.json'], {name: `studio-build-${buildId}`, timeoutMs: 240_000, signal, onProgress: input.onProgress});
      if (signal?.aborted) throw new StudioError('CANCELLED', 'Build cancelled.', 409);
      const checkedFiles = await readSourceFiles(projectDir, sourceId);
      if (sha256(JSON.stringify({files: checkedFiles, shots})) !== manifest.sourceHash) throw new StudioError('SOURCE_CHANGED', 'Source changed while its build was running.', 409);
      const result = JSON.parse(await fs.readFile(path.join(buildDir, 'result.json'), 'utf8')) as {durationFrames: number; smokeFrames: number[]; isolationChecks: Record<string, boolean>};
      const record: BuildResult = {id: buildId, sourceId, status: 'ready', shots, durationFrames: result.durationFrames,
        fps: 30, width: 720, height: 1280, sourceHash: manifest.sourceHash, dependencyHash, runtimeHash,
        previewDir: path.join(buildDir, 'preview'), createdAt: new Date().toISOString(), smokeFrames: result.smokeFrames, image: runtime.image, isolationChecks: result.isolationChecks};
      const temporary = path.join(buildDir, '.build.json.tmp');
      await fs.writeFile(temporary, JSON.stringify(record, null, 2) + '\n', {flag: 'wx', mode: 0o600});
      await fs.rename(temporary, path.join(buildDir, 'build.json'));
      await this.reportProgress('ready', input.onProgress);
      return record;
    } catch (error) {
      await fs.writeFile(path.join(buildDir, 'failure.json'), JSON.stringify({status: signal?.aborted ? 'cancelled' : 'failed',
        message: error instanceof Error ? error.message : String(error), createdAt: new Date().toISOString()}, null, 2)).catch(() => undefined);
      throw error;
    } finally { await fs.unlink(hostSentinelPath).catch(() => undefined); }
  }

  async screenshot(input: {projectDir: string; buildId: string; frame: number; outputPath: string; signal?: AbortSignal}): Promise<void> {
    IdSchema.parse(input.buildId);
    const buildDir = path.join(input.projectDir, 'builds', input.buildId);
    const record = JSON.parse(await fs.readFile(path.join(buildDir, 'build.json'), 'utf8')) as BuildResult;
    if (record.status !== 'ready' || record.id !== input.buildId) throw new StudioError('BUILD_NOT_READY', 'Comment screenshot requires a ready build.', 409);
    if (!Number.isInteger(input.frame) || input.frame < 0 || input.frame >= record.durationFrames) throw new StudioError('INVALID_FRAME', 'Screenshot frame is outside the composition.');
    const relativeOutput = path.relative(path.resolve(input.projectDir), path.resolve(input.outputPath));
    if (!relativeOutput || relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput) || !relativeOutput.endsWith('.png')) throw new StudioError('INVALID_PATH', 'Screenshot output must be a PNG inside its project.');
    let outputParent = path.resolve(input.projectDir);
    for (const part of relativeOutput.split(path.sep).slice(0, -1)) {
      outputParent = path.join(outputParent, part);
      await fs.mkdir(outputParent, {recursive: true});
      if ((await fs.lstat(outputParent)).isSymbolicLink()) throw new StudioError('INVALID_PATH', 'Screenshot output directory may not be a symbolic link.');
    }
    const outputExists = await fs.lstat(input.outputPath).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
    if (outputExists?.isSymbolicLink() || outputExists && !outputExists.isFile()) throw new StudioError('INVALID_PATH', 'Screenshot output must be a regular file.');
    if (await this.dependenciesHash() !== record.dependencyHash || await this.runtimeHash(record.image) !== record.runtimeHash) throw new StudioError('BUILD_CHANGED', 'Runtime or dependency versions changed; rebuild this revision before capturing it.', 409);
    const temporaryDir = await fs.mkdtemp(path.join(buildDir, '.screenshot-'));
    try {
      const inputPath = path.join(temporaryDir, 'input.json');
      await fs.writeFile(inputPath, JSON.stringify({repoRoot: this.repoRoot, frame: input.frame}), {flag: 'wx', mode: 0o600});
      await this.runContainer(record.image, [
        {source: buildDir, target: '/work/build', readonly: true},
        {source: inputPath, target: '/work/input.json', readonly: true},
        {source: temporaryDir, target: '/work/screenshot'},
      ], ['/opt/studio-worker/screenshot.mjs'], {name: `studio-shot-${input.buildId}-${input.frame}`, timeoutMs: 90_000, signal: input.signal});
      await fs.mkdir(path.dirname(input.outputPath), {recursive: true});
      await fs.copyFile(path.join(temporaryDir, 'frame.png'), input.outputPath);
    } finally { await fs.rm(temporaryDir, {recursive: true, force: true}); }
  }
}
