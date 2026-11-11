import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {StudioBuilder, type BuildResult} from './builder.js';
import type {StudioPreview} from './preview.js';
import {materializeSource, type SourceManifest} from './source.js';

describe('comment screenshot after runtime changes', () => {
  let root: string;
  beforeEach(async () => {root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-capture-'));});
  afterEach(async () => {vi.restoreAllMocks(); await fs.rm(root, {recursive: true, force: true});});

  async function fixture(kind: 'development' | null = 'development') {
    const repoRoot = path.join(root, 'repo');
    const workerFile = path.join(repoRoot, 'apps/worker/runtime/fixture.mjs');
    const lockFile = path.join(repoRoot, 'pnpm-lock.yaml');
    await fs.mkdir(path.dirname(workerFile), {recursive: true});
    await fs.writeFile(workerFile, 'original trusted runtime');
    await fs.writeFile(lockFile, 'original dependencies');
    const projectDir = path.join(root, 'project');
    await fs.mkdir(projectDir);
    const shots = [{id: 'one', durationFrames: 90, intent: 'First shot', visualDirection: 'Heading'}];
    const source = await materializeSource(projectDir, {baseRevisionId: null, summary: 'Sealed shot', shots,
      changedFiles: [{path: 'src/shots/one.tsx', content: "export default function Shot(){return <div>First shot</div>}"}], deletedFiles: []});
    const manifest = JSON.parse(await fs.readFile(path.join(projectDir, 'source', source.sourceId, 'manifest.json'), 'utf8')) as SourceManifest;
    const builder = new StudioBuilder({repoRoot});
    const internal = builder as unknown as {dependenciesHash: () => Promise<string>; runtimeHash: () => Promise<string>; development: StudioPreview};
    const record: BuildResult = {id: 'accepted-build', sourceId: source.sourceId, status: 'ready', ...(kind ? {kind} : {}), shots: manifest.shots,
      durationFrames: 90, fps: 30, width: 720, height: 1280, sourceHash: manifest.sourceHash,
      dependencyHash: await internal.dependenciesHash(), runtimeHash: await internal.runtimeHash(),
      previewDir: 'immutable-preview', image: 'local-node', createdAt: '2026-11-11T00:00:00.000Z', smokeFrames: [0, 89], isolationChecks: {}};
    const buildFile = path.join(projectDir, 'builds', record.id, 'build.json');
    await fs.mkdir(path.dirname(buildFile), {recursive: true});
    const originalBuild = JSON.stringify(record);
    await fs.writeFile(buildFile, originalBuild);
    const outputPath = path.join(projectDir, 'comments', 'comment.png');
    const capture = vi.spyOn(internal.development, 'screenshot').mockImplementation(async (_project, _record, _frame, destination) => {await fs.writeFile(destination, 'validated PNG fixture');});
    const production = vi.spyOn(builder, 'build').mockRejectedValue(new Error('No production build during revision'));
    const input = {projectDir, buildId: record.id, frame: 42, outputPath};
    return {builder, internal, capture, production, input, record, workerFile, lockFile, buildFile, originalBuild,
      sourceFile: path.join(projectDir, 'source', record.sourceId, 'src/shots/one.tsx')};
  }

  it.each([
    {kind: 'development' as const, change: 'runtime'}, {kind: undefined, change: 'runtime'},
    {kind: 'development' as const, change: 'dependencies'}, {kind: undefined, change: 'dependencies'},
  ])('revalidates sealed source under a distinct capture session after $change changes ($kind)', async ({kind, change}) => {
    const f = await fixture(kind ?? null);
    await fs.writeFile(change === 'runtime' ? f.workerFile : f.lockFile, 'updated');
    await f.builder.screenshot(f.input);
    expect(f.capture).toHaveBeenCalledWith(f.input.projectDir, f.record, 42, expect.stringContaining('.capture-'), undefined, expect.stringMatching(/^capture-/));
    expect(await fs.readFile(f.input.outputPath, 'utf8')).toBe('validated PNG fixture');
    const evidence = JSON.parse(await fs.readFile(path.join(path.dirname(f.input.outputPath), '.comment.capture.json'), 'utf8'));
    expect(evidence).toMatchObject({buildId: f.record.id, sourceId: f.record.sourceId, sourceHash: f.record.sourceHash, frame: 42,
      revalidated: true, originalRuntimeHash: f.record.runtimeHash, originalDependencyHash: f.record.dependencyHash});
    expect(await fs.readFile(f.buildFile, 'utf8')).toBe(f.originalBuild);
    expect(f.production).not.toHaveBeenCalled();
  });

  it('keeps the original session when a development runtime still matches', async () => {
    const f = await fixture();
    await f.builder.screenshot(f.input);
    expect(f.capture.mock.calls[0][5]).toBe(f.record.id);
    expect(JSON.parse(await fs.readFile(path.join(path.dirname(f.input.outputPath), '.comment.capture.json'), 'utf8')).revalidated).toBe(false);
  });

  it('rejects changed source before allowing a fresh browser capture', async () => {
    const f = await fixture();
    await fs.writeFile(f.workerFile, 'updated');
    await fs.appendFile(f.sourceFile, '\n// source changed after acceptance');
    await expect(f.builder.screenshot(f.input)).rejects.toMatchObject({code: 'SOURCE_CHANGED'});
    expect(f.capture).not.toHaveBeenCalled();
  });

  it('rejects a valid source manifest that does not match the revision provenance', async () => {
    const f = await fixture();
    await fs.writeFile(f.buildFile, JSON.stringify({...f.record, sourceHash: '0'.repeat(64)}));
    await expect(f.builder.screenshot(f.input)).rejects.toMatchObject({code: 'SOURCE_CHANGED'});
    expect(f.capture).not.toHaveBeenCalled();
  });

  it('preserves a previous image when revalidation fails', async () => {
    const f = await fixture();
    await fs.mkdir(path.dirname(f.input.outputPath));
    await fs.writeFile(f.input.outputPath, 'previous valid capture');
    await fs.writeFile(f.workerFile, 'updated');
    f.capture.mockRejectedValue(new Error('Frame 42 runtime failed'));
    await expect(f.builder.screenshot(f.input)).rejects.toThrow('Frame 42 runtime failed');
    expect(await fs.readFile(f.input.outputPath, 'utf8')).toBe('previous valid capture');
    expect(await fs.readdir(path.dirname(f.input.outputPath))).toEqual(['comment.png']);
  });

  it('does not publish evidence when the runtime changes during capture', async () => {
    const f = await fixture();
    f.capture.mockImplementation(async (_p, _r, _f, destination) => {await fs.writeFile(destination, 'PNG fixture'); await fs.writeFile(f.workerFile, 'changed during capture');});
    await expect(f.builder.screenshot(f.input)).rejects.toMatchObject({code: 'BUILD_CHANGED'});
    expect(await fs.readdir(path.dirname(f.input.outputPath))).toEqual([]);
  });

  it('does not publish evidence after cancellation', async () => {
    const f = await fixture();
    const controller = new AbortController();
    f.capture.mockImplementation(async (_p, _r, _f, destination) => {await fs.writeFile(destination, 'PNG fixture'); controller.abort();});
    await expect(f.builder.screenshot({...f.input, signal: controller.signal})).rejects.toMatchObject({code: 'CANCELLED'});
    expect(await fs.readdir(path.dirname(f.input.outputPath))).toEqual([]);
  });
});
