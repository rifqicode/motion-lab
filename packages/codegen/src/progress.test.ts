import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {StudioBuilder} from './builder.js';
import {materializeSource} from './source.js';

const processMocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  execFile: vi.fn((...args: unknown[]) => { const callback = args.at(-1); if (typeof callback === 'function') callback(null, '', ''); }),
}));
vi.mock('node:child_process', () => processMocks);

describe('per-build progress callbacks (worker process fixture)', () => {
  let root: string;
  beforeEach(async () => {
    processMocks.execFile.mockImplementation((...args: unknown[]) => { const callback = args.at(-1); if (typeof callback === 'function') callback(null, {stdout: '', stderr: ''}); });
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-builder-progress-'));
    await fs.mkdir(path.join(root, 'repo/apps/worker/runtime'), {recursive: true});
    await fs.writeFile(path.join(root, 'repo/apps/worker/runtime/fixture.mjs'), '// Trusted runner fixture');
    await fs.writeFile(path.join(root, 'repo/pnpm-lock.yaml'), 'fixture-lock');
  });
  afterEach(async () => { vi.restoreAllMocks(); processMocks.spawn.mockReset(); await fs.rm(root, {recursive: true, force: true}); });

  it('forwards job-specific and legacy observers in order, deferring ready until build.json exists', async () => {
    const projectDir = path.join(root, 'project');
    await fs.mkdir(projectDir);
    const shots = [{id: 'cache', durationFrames: 450, intent: 'Show a cache key', visualDirection: 'Dark SVG'}];
    const source = await materializeSource(projectDir, {baseRevisionId: null, summary: 'Fixture source', shots,
      changedFiles: [{path: 'src/shots/cache.tsx', content: "import React from 'react'; export default () => <svg width={720} height={1280}/>;"}], deletedFiles: []});
    const buildId = 'progress-build';
    const buildDir = path.join(projectDir, 'builds', buildId);
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const legacy: string[] = [];
    const perBuild: string[] = [];
    const builder = new StudioBuilder({repoRoot: path.join(root, 'repo'), onProgress: stage => { legacy.push(stage); }});
    vi.spyOn(builder, 'status').mockResolvedValue({available: true, image: 'fixture-image'});
    processMocks.spawn.mockImplementation(() => {
      const child = Object.assign(new EventEmitter(), {stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn()});
      queueMicrotask(() => {
        for (const stage of ['typecheck', 'browser-build', 'render-build', 'smoke-checking', 'ready']) child.stdout.write(JSON.stringify({type: 'progress', stage}) + '\n');
        void fs.writeFile(path.join(buildDir, 'result.json'), JSON.stringify({durationFrames: 450, smokeFrames: [0, 449], isolationChecks: {}}))
          .then(() => { child.stdout.end(); child.stderr.end(); child.emit('close', 0); });
      });
      return child;
    });
    const operation = builder.build({projectDir, sourceId: source.sourceId, shots, buildId,
      onProgress: async stage => {
        if (stage === 'typecheck') { entered(); await gate; }
        if (stage === 'ready') expect(JSON.parse(await fs.readFile(path.join(buildDir, 'build.json'), 'utf8')).status).toBe('ready');
        perBuild.push(stage);
      }});
    await started;
    expect(perBuild).toEqual([]);
    expect(legacy).toEqual(['typecheck']);
    expect(await fs.access(path.join(buildDir, 'build.json')).then(() => true, () => false)).toBe(false);
    release();
    const result = await operation;
    expect(result.status).toBe('ready');
    expect(perBuild).toEqual(['typecheck', 'browser-build', 'render-build', 'smoke-checking', 'ready']);
    expect(legacy).toEqual(perBuild);
    expect(processMocks.spawn).toHaveBeenCalledTimes(1);
  }, 15_000);

  it('reports local node runtime availability directly without querying docker', async () => {
    const builder = new StudioBuilder({repoRoot: path.join(root, 'repo')});
    expect(await builder.status()).toEqual({available: true, image: 'local-node'});
    expect(processMocks.execFile).not.toHaveBeenCalled();
  });

  it.each([
    {diagnostic: 'TimeoutError: Timed out after 25000 ms while trying to connect to the browser! Chrome logged the following: dbus fixture', code: 'BROWSER_START_TIMEOUT'},
    {diagnostic: 'TimeoutError: delayRender() timed out after 20000 ms in a generated component', code: 'BUILD_FAILED'},
  ])('classifies worker failure precisely as $code', async ({diagnostic, code}) => {
    const builder = new StudioBuilder({repoRoot: path.join(root, 'repo')});
    processMocks.spawn.mockImplementation(() => {
      const child = Object.assign(new EventEmitter(), {stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn()});
      queueMicrotask(() => {child.stderr.write(diagnostic); child.stdout.end(); child.stderr.end(); child.emit('close', 1);});
      return child;
    });
    const runner = builder as unknown as {runContainer: (image: string, mounts: [], args: string[], options: {name: string; timeoutMs: number}) => Promise<void>};
    await expect(runner.runContainer('fixture-image', [], [], {name: 'fixture-worker', timeoutMs: 1000})).rejects.toMatchObject({code});
  });
});
