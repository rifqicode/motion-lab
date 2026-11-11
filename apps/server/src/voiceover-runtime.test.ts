import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {LocalVoiceoverRuntime} from './voiceover-runtime.js';

describe('local voice-over process boundaries', () => {
  let root: string;
  let runtime: LocalVoiceoverRuntime;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-voice-runtime-'));
    runtime = new LocalVoiceoverRuntime({repoRoot: root});
  });
  afterEach(async () => { vi.restoreAllMocks(); await fs.rm(root, {recursive: true, force: true}); });

  async function processFixture(script: string) {
    const pythonDir = path.join(root, '.cache/chatterbox/.venv/bin');
    await fs.mkdir(pythonDir, {recursive: true});
    await fs.writeFile(path.join(pythonDir, 'python'), `#!/usr/bin/env node\n${script}`, {mode: 0o700});
    vi.spyOn(runtime, 'status').mockResolvedValue({available: true, device: 'cpu'});
  }

  it('reports missing setup without starting a downloader', async () => {
    expect(await runtime.status()).toMatchObject({available: false});
    const outputPath = path.join(root, 'voice.wav');
    await expect(runtime.synthesize({text: 'Selamat pagi.', outputPath, signal: new AbortController().signal})).rejects.toThrow('belum siap');
    expect(await fs.stat(outputPath).then(() => true, () => false)).toBe(false);
  });

  it('kills a running model process and removes incomplete audio on cancel', async () => {
    const entered = path.join(root, 'entered');
    await processFixture(`let raw='';process.stdin.on('data',c=>raw+=c);process.stdin.on('end',()=>{const p=JSON.parse(raw);require('fs').writeFileSync(p.outputPath,'partial');require('fs').writeFileSync(${JSON.stringify(entered)},'ready');setInterval(()=>{},1000);});`);
    const controller = new AbortController();
    const outputPath = path.join(root, 'voice.wav');
    const result = runtime.synthesize({text: 'Selamat pagi.', outputPath, signal: controller.signal}).catch(error => error);
    await vi.waitFor(async () => expect(await fs.stat(entered).then(() => true, () => false)).toBe(true));
    controller.abort();
    expect((await result).message).toContain('dibatalkan');
    expect(await fs.stat(outputPath).then(() => true, () => false)).toBe(false);
  });

  it('cancels a queued request promptly without letting later requests overtake the active process', async () => {
    const entered = path.join(root, 'entered');
    await processFixture(`let raw='';process.stdin.on('data',c=>raw+=c);process.stdin.on('end',()=>{require('fs').appendFileSync(${JSON.stringify(entered)},JSON.parse(raw).text+'\\n');setInterval(()=>{},1000);});`);
    const first = new AbortController();
    const waiting = new AbortController();
    const third = new AbortController();
    const run = (text: string, controller: AbortController) => runtime.synthesize({text, outputPath: path.join(root, text + '.wav'), signal: controller.signal}).catch(error => error);
    const p1 = run('first', first);
    await vi.waitFor(async () => expect(await fs.readFile(entered, 'utf8')).toBe('first\n'));
    const p2 = run('waiting', waiting);
    waiting.abort();
    expect((await p2).message).toContain('dibatalkan');
    const p3 = run('third', third);
    expect(await fs.readFile(entered, 'utf8')).toBe('first\n');
    first.abort();
    await p1;
    await vi.waitFor(async () => expect(await fs.readFile(entered, 'utf8')).toBe('first\nthird\n'));
    third.abort();
    await p3;
  });

  it('rejects a successful process that returned a malformed audio file', async () => {
    await processFixture(`let raw='';process.stdin.on('data',c=>raw+=c);process.stdin.on('end',()=>require('fs').writeFileSync(JSON.parse(raw).outputPath,'invalid'));`);
    await expect(runtime.synthesize({text: 'Selamat pagi.', outputPath: path.join(root, 'voice.wav'), signal: new AbortController().signal})).rejects.toThrow('invalid');
  });

  it('independently probes a valid WAV rather than trusting model stdout', async () => {
    await processFixture(`let raw='';process.stdin.on('data',c=>raw+=c);process.stdin.on('end',()=>{const b=Buffer.alloc(2444);b.write('RIFF');b.writeUInt32LE(2436,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(24000,24);b.writeUInt32LE(48000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(2400,40);require('fs').writeFileSync(JSON.parse(raw).outputPath,b);console.log(JSON.stringify({durationMs:999999,sampleRate:1}));});`);
    const result = await runtime.synthesize({text: 'Selamat pagi.', outputPath: path.join(root, 'voice.wav'), signal: new AbortController().signal});
    expect(result).toEqual({durationMs: 50, sampleRate: 24_000});
  });
});
