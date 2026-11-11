import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {StudioPreview, previewFrames} from './preview.js';
import {materializeSource} from './source.js';

describe('development preview publication (runtime fixture)', () => {
  let root: string;
  const shots = [
    {id: 'one', durationFrames: 30, intent: 'First shot', visualDirection: 'Plain'},
    {id: 'two', durationFrames: 60, intent: 'Second shot', visualDirection: 'Plain'},
  ];
  beforeEach(async () => {root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-preview-test-'));});
  afterEach(async () => {vi.restoreAllMocks(); await fs.rm(root, {recursive: true, force: true});});

  async function fixture() {
    const projectDir = path.join(root, 'project');
    const workspace = path.join(projectDir, 'preview/live');
    const output = path.join(root, 'output');
    await fs.mkdir(workspace, {recursive: true});
    await fs.mkdir(output);
    const source = await materializeSource(projectDir, {baseRevisionId: null, summary: 'Fixture source', shots,
      changedFiles: shots.map(shot => ({path: `src/shots/${shot.id}.tsx`, content: "import React from 'react';export default () => <div>Shot</div>;"})), deletedFiles: []});
    const preview = new StudioPreview({repoRoot: process.cwd()}, async () => ({available: true, image: 'fixture'}),
      async () => ({dependencyHash: 'd'.repeat(64), runtimeHash: 'r'.repeat(64)}));
    const internal = preview as unknown as {
      ensure: (...args: unknown[]) => Promise<unknown>;
      request: (...args: unknown[]) => Promise<unknown>;
    };
    vi.spyOn(internal, 'ensure').mockResolvedValue({workspace, output, image: 'fixture', basePath: '/p/project/live/'});
    return {preview, internal, projectDir, workspace, output, source};
  }

  it('covers each shot boundary and midpoint rather than sampling only the whole composition', () => {
    expect(previewFrames(shots)).toEqual([0, 15, 29, 30, 60, 89]);
  });

  it('refreshes the trusted client on reopen without replacing the active composition or rewriting an unchanged client', async () => {
    const {preview, projectDir, workspace} = await fixture();
    const buildId = 'existing-version';
    const buildDir = path.join(projectDir, 'builds', buildId);
    await fs.mkdir(buildDir, {recursive: true});
    await fs.writeFile(path.join(buildDir, 'build.json'), JSON.stringify({status: 'ready', kind: 'development'}));
    await fs.writeFile(path.join(workspace, 'active.tsx'), 'last-good-composition');
    await fs.writeFile(path.join(workspace, 'entry.tsx'), 'old-client');
    await preview.target(projectDir, buildId);
    const template = await fs.readFile(path.join(process.cwd(), 'apps/worker/runtime/dev-client.template'), 'utf8');
    expect(await fs.readFile(path.join(workspace, 'entry.tsx'), 'utf8')).toBe(template);
    expect(await fs.readFile(path.join(workspace, 'active.tsx'), 'utf8')).toBe('last-good-composition');
    const originalTime = new Date('2026-01-01T00:00:00Z');
    await fs.utimes(path.join(workspace, 'entry.tsx'), originalTime, originalTime);
    await preview.target(projectDir, buildId);
    expect((await fs.stat(path.join(workspace, 'entry.tsx'))).mtime.toISOString()).toBe(originalTime.toISOString());
  });

  it('keeps the active version untouched when browser validation fails', async () => {
    const {preview, internal, workspace, projectDir, source} = await fixture();
    const original = "export const lastGood = 'accepted';\n";
    await fs.writeFile(path.join(workspace, 'active.tsx'), original);
    vi.spyOn(internal, 'request').mockRejectedValue(new Error('Runtime crash on frame 60'));
    await expect(preview.publish({projectDir, sourceId: source.sourceId, buildId: 'failed-version', shots})).rejects.toThrow('Runtime crash');
    expect(await fs.readFile(path.join(workspace, 'active.tsx'), 'utf8')).toBe(original);
    expect(await fs.access(path.join(projectDir, 'builds/failed-version/build.json')).then(() => true, () => false)).toBe(false);
  });

  it('publishes immutable evidence and source identity before activating the HMR module', async () => {
    const {preview, internal, workspace, output, projectDir, source} = await fixture();
    const buildId = 'valid-version';
    const frames = previewFrames(shots);
    vi.spyOn(internal, 'request').mockImplementation(async () => {
      const evidence = path.join(output, 'evidence', buildId);
      await fs.mkdir(evidence, {recursive: true});
      for (const frame of frames) await fs.writeFile(path.join(evidence, `${frame}.png`), `fixture-frame-${frame}`);
      return {captures: frames.map(frame => ({frame})), isolationChecks: {externalNetworkBlocked: true}};
    });
    const stages: string[] = [];
    const result = await preview.publish({projectDir, sourceId: source.sourceId, buildId, shots, onProgress: stage => {stages.push(stage);}});
    expect(result).toMatchObject({kind: 'development', sourceId: source.sourceId, previewSessionId: 'live', durationFrames: 90});
    expect(stages).toEqual(['typecheck', 'ready']);
    expect(await fs.readFile(path.join(workspace, 'active.tsx'), 'utf8')).toContain(`./versions/${buildId}/active.tsx`);
    expect(JSON.parse(await fs.readFile(path.join(projectDir, 'builds', buildId, 'build.json'), 'utf8')).sourceHash).toBe(result.sourceHash);
    expect(await fs.readFile(path.join(workspace, 'versions', buildId, 'src/shots/one.tsx'), 'utf8')).toContain('Shot');
    expect(await fs.access(path.join(projectDir, 'builds', buildId, 'render')).then(() => true, () => false)).toBe(false);
  });

  it('does not publish a candidate cancelled while its probe is running', async () => {
    const {preview, internal, projectDir, source, workspace} = await fixture();
    const controller = new AbortController();
    await fs.writeFile(path.join(workspace, 'active.tsx'), 'last-good');
    vi.spyOn(internal, 'request').mockImplementation(async () => {controller.abort(); return {captures: [], isolationChecks: {}};});
    await expect(preview.publish({projectDir, sourceId: source.sourceId, buildId: 'cancelled-version', shots, signal: controller.signal})).rejects.toMatchObject({code: 'CANCELLED'});
    expect(await fs.readFile(path.join(workspace, 'active.tsx'), 'utf8')).toBe('last-good');
  });

  it('includes an exact feedback frame and rejects frames outside the referenced timeline', async () => {
    const {preview, internal, projectDir, source} = await fixture();
    const request = vi.spyOn(internal, 'request').mockRejectedValue(new Error('Stop after frame selection'));
    await expect(preview.publish({projectDir, sourceId: source.sourceId, buildId: 'target-frame', shots, frames: [42]})).rejects.toThrow();
    expect(request.mock.calls[0][2]).toMatchObject({frames: [0, 15, 29, 30, 60, 89, 42]});
    request.mockClear();
    await expect(preview.publish({projectDir, sourceId: source.sourceId, buildId: 'bad-frame', shots, frames: [90]})).rejects.toMatchObject({code: 'INVALID_FRAME'});
    expect(request).not.toHaveBeenCalled();
  });

  it('keeps the live entry and HTML unchanged across publishes so only the HMR boundary changes', async () => {
    const {preview, internal, projectDir, source, workspace, output} = await fixture();
    vi.spyOn(internal, 'request').mockImplementation(async (_target, _route, body) => {
      const request = body as {buildId: string; frames: number[]};
      const evidence = path.join(output, 'evidence', request.buildId);
      await fs.mkdir(evidence, {recursive: true});
      for (const frame of request.frames) await fs.writeFile(path.join(evidence, `${frame}.png`), 'fixture');
      return {captures: request.frames.map(frame => ({frame})), isolationChecks: {}};
    });
    await preview.publish({projectDir, sourceId: source.sourceId, buildId: 'first-publish', shots});
    const entry = path.join(workspace, 'entry.tsx');
    const index = path.join(workspace, 'index.html');
    const time = new Date('2025-01-01T00:00:00Z');
    await fs.utimes(entry, time, time); await fs.utimes(index, time, time);
    await preview.publish({projectDir, sourceId: source.sourceId, buildId: 'second-publish', shots});
    expect((await fs.stat(entry)).mtime.toISOString()).toBe(time.toISOString());
    expect((await fs.stat(index)).mtime.toISOString()).toBe(time.toISOString());
    expect(await fs.readFile(path.join(workspace, 'active.tsx'), 'utf8')).toContain('second-publish');
    expect(JSON.parse(await fs.readFile(path.join(projectDir, 'builds/second-publish/build.json'), 'utf8')).previousBuildId).toBe('first-publish');
    expect(await fs.readFile(path.join(workspace, 'versions/first-publish/src/shots/one.tsx'), 'utf8')).toContain('Shot');
  });

  it('ignores late recovery requests after another version has become current', async () => {
    const {preview, internal, projectDir} = await fixture();
    await fs.writeFile(path.join(projectDir, 'preview/current.json'), JSON.stringify({buildId: 'newer'}));
    const ensure = vi.spyOn(internal, 'ensure'); ensure.mockClear();
    expect(await preview.recover(projectDir, 'old-failed', 'old-good')).toBe(false);
    expect(ensure).not.toHaveBeenCalled();
    expect(JSON.parse(await fs.readFile(path.join(projectDir, 'preview/current.json'), 'utf8')).buildId).toBe('newer');
  });

  it('rejects a fallback that is not the previous validated version for the failed publication', async () => {
    const {preview, internal, projectDir} = await fixture();
    await fs.mkdir(path.join(projectDir, 'builds/failed'), {recursive: true});
    await fs.writeFile(path.join(projectDir, 'preview/current.json'), JSON.stringify({buildId: 'failed'}));
    await fs.writeFile(path.join(projectDir, 'builds/failed/build.json'), JSON.stringify({id: 'failed', kind: 'development', previousBuildId: 'real-previous'}));
    const ensure = vi.spyOn(internal, 'ensure'); ensure.mockClear();
    await expect(preview.recover(projectDir, 'failed', 'unrelated')).rejects.toMatchObject({code: 'INVALID_FALLBACK'});
    expect(ensure).not.toHaveBeenCalled();
  });
});
