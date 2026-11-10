import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {briefHash, StyleBriefSchema, type Candidate} from '@studio/studio-core';
import {StudioStore} from './index.js';

describe('persisted per-project creative style', () => {
  let root: string;
  let store: StudioStore;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-style-test-'));
    store = new StudioStore(root);
    await store.acquireLock();
  });
  afterEach(async () => { await store.releaseLock(); await fs.rm(root, {recursive: true, force: true}); });

  async function ready(projectId: string, id: string, baseRevisionId: string | null): Promise<Candidate> {
    const candidate: Candidate = {id, baseRevisionId, sourceId: `source-${id}`, buildId: `build-${id}`, status: 'ready',
      summary: 'Fixture source snapshot', shots: [{id: 'cache', durationFrames: 450, intent: 'One key', visualDirection: 'Fixture'}], createdAt: '2026-11-10T12:00:00.000Z'};
    await store.writeJson(projectId, `builds/${candidate.buildId}/build.json`, {status: 'ready', sourceId: candidate.sourceId});
    return store.saveCandidate(projectId, candidate);
  }

  it('reads legacy style defaults and preserves an existing empty-style approval without rewriting the file', async () => {
    const project = await store.createProject('Legacy style fixture', 'Explain a cache key.');
    const legacy = {...project, approvedBriefHash: briefHash(project.brief)} as Record<string, unknown>;
    delete legacy.style;
    const file = path.join(store.projectPath(project.id), 'project.json');
    const original = JSON.stringify(legacy, null, 2) + '\n';
    await fs.writeFile(file, original);
    const loaded = await store.getProject(project.id);
    expect(loaded.schemaVersion).toBe(1);
    expect(loaded.style).toEqual(StyleBriefSchema.parse({}));
    expect(loaded.approvedBriefHash).toBe(briefHash(loaded.brief, loaded.style));
    expect(await fs.readFile(file, 'utf8')).toBe(original);
    expect(await store.updateStyle(project.id, {})).toEqual(loaded);
    expect(await fs.readFile(file, 'utf8')).toBe(original);
  });

  it('saves normalized style, invalidates approval only for that project and reopens the same style after restart', async () => {
    const first = await store.createProject('Warm explainer', 'Explain the cache.');
    const second = await store.createProject('Editorial explainer', 'Explain the cache.');
    await store.approveBrief(first.id);
    const secondApproved = await store.approveBrief(second.id);
    const style = {mood: ' Warm ', colorPalette: ' cream and ink ', typography: ' editorial serif ', pacing: ' measured ', transitions: ' gentle cuts ',
      visualDirection: ' hand-drawn diagrams ', referenceNotes: ' User supplied keyframes; no URL fetched. ', avoid: ' neon glows '};
    const updated = await store.updateStyle(first.id, style);
    expect(updated.style).toEqual(Object.fromEntries(Object.entries(style).map(([key, value]) => [key, value.trim()])));
    expect(updated.approvedBriefHash).toBeNull();
    expect(await store.getProject(second.id)).toEqual(secondApproved);
    const approved = await store.approveBrief(first.id);
    expect(approved.approvedBriefHash).toBe(briefHash(first.brief, updated.style));
    expect(approved.approvedBriefHash).not.toBe(briefHash(first.brief));
    await store.releaseLock();
    store = new StudioStore(root);
    await store.acquireLock();
    expect(await store.getProject(first.id)).toEqual(approved);
    expect((await store.getProject(second.id)).style).toEqual(StyleBriefSchema.parse({}));
  });

  it('treats normalized no-op saves as unchanged, retaining approval and timestamps even with a ready candidate', async () => {
    const project = await store.createProject('No-op style fixture', 'Explain a key.');
    await store.updateStyle(project.id, {mood: 'Calm', colorPalette: 'cream'});
    await store.approveBrief(project.id);
    const candidate = await ready(project.id, 'review', null);
    const before = await store.getProject(project.id);
    const file = path.join(store.projectPath(project.id), 'project.json');
    const bytes = await fs.readFile(file, 'utf8');
    expect(await store.updateStyle(project.id, {colorPalette: ' cream ', mood: '\nCalm '})).toEqual(before);
    expect(await fs.readFile(file, 'utf8')).toBe(bytes);
    expect((await store.getCandidate(project.id, candidate.id)).status).toBe('ready');
    expect(before.approvedBriefHash).toBe(briefHash(before.brief, before.style));
  });

  it('refuses actual style changes with a ready or generating candidate and preserves their approval/context', async () => {
    const project = await store.createProject('Candidate style fixture', 'Explain a key.');
    await store.updateStyle(project.id, {mood: 'Calm'});
    await store.approveBrief(project.id);
    const candidate = await ready(project.id, 'review', null);
    const before = await store.getProject(project.id);
    await expect(store.updateStyle(project.id, {mood: 'Energetic'})).rejects.toMatchObject({code: 'CANDIDATE_BUSY', status: 409});
    expect(await store.getProject(project.id)).toEqual(before);
    expect(await store.getCandidate(project.id, candidate.id)).toEqual(candidate);
    await store.discardCandidate(project.id, candidate.id);
    await store.saveCandidate(project.id, {id: 'generating-style', baseRevisionId: null, sourceId: null, buildId: null,
      status: 'generating', summary: '', shots: [], createdAt: '2026-11-10T12:00:00.000Z'});
    const generatingContext = await store.getProject(project.id);
    await expect(store.updateStyle(project.id, {mood: 'Energetic'})).rejects.toMatchObject({code: 'CANDIDATE_BUSY'});
    expect(await store.getProject(project.id)).toEqual(generatingContext);
  });

  it('changes future direction without changing current revision, build, source identity or comments', async () => {
    const project = await store.createProject('Existing build style fixture', 'Explain a key.');
    await store.approveBrief(project.id);
    const candidate = await ready(project.id, 'initial', null);
    const revision = await store.applyCandidate(project.id, candidate.id, null);
    const comment = await store.addComment(project.id, {revisionId: revision.id, shotId: 'cache', localFrame: 72, fps: 30}, 'Move the key later.');
    const build = await store.readJson(project.id, `builds/${revision.buildId}/build.json`);
    const changed = await store.updateStyle(project.id, {visualDirection: 'Editorial cards on a light canvas'});
    expect(changed.currentRevisionId).toBe(revision.id);
    expect(changed.approvedBriefHash).toBeNull();
    expect(await store.getRevision(project.id, revision.id)).toEqual(revision);
    expect(await store.readJson(project.id, `builds/${revision.buildId}/build.json`)).toEqual(build);
    expect(await store.getComment(project.id, comment.id)).toEqual(comment);
  });

  it('validates before persistence and invalidates approval when clearing a previously nonempty style', async () => {
    const project = await store.createProject('Style validation fixture', 'Explain a key.');
    await store.updateStyle(project.id, {mood: 'Warm'});
    await store.approveBrief(project.id);
    const before = await store.getProject(project.id);
    await expect(store.updateStyle(project.id, {mood: 12} as never)).rejects.toThrow();
    await expect(store.updateStyle(project.id, {unknownField: 'other'} as never)).rejects.toThrow();
    await expect(store.updateStyle(project.id, {referenceNotes: 'a'.repeat(8001)})).rejects.toThrow();
    expect(await store.getProject(project.id)).toEqual(before);
    const cleared = await store.updateStyle(project.id, {});
    expect(cleared.style).toEqual(StyleBriefSchema.parse({}));
    expect(cleared.approvedBriefHash).toBeNull();
    expect((await store.approveBrief(project.id)).approvedBriefHash).toBe(briefHash(project.brief));
  });
});
