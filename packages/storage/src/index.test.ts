import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {StudioStore} from './index.js';
import type {Candidate, Job, Revision} from '../../studio-core/src/index.js';

const timestamp = '2026-11-10T12:00:00.000Z';
const shot = {id: 'cache', durationFrames: 450, intent: 'Explain cache misses', visualDirection: 'Dark SVG'};

describe('local studio persistence', () => {
  let root: string;
  let store: StudioStore;
  const stores: StudioStore[] = [];

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-store-test-'));
    store = new StudioStore(path.join(root, 'projects'));
    stores.push(store);
    await store.acquireLock();
  });

  afterEach(async () => {
    await Promise.all(stores.splice(0).map((item) => item.releaseLock()));
    await fs.rm(root, {recursive: true, force: true});
  });

  async function ready(projectId: string, id: string, baseRevisionId: string | null): Promise<Candidate> {
    const candidate: Candidate = {
      id, baseRevisionId, sourceId: `source-${id}`, buildId: `build-${id}`,
      status: 'ready', summary: `Visual change ${id}`, shots: [{...shot}], createdAt: timestamp,
    };
    await store.writeJson(projectId, `builds/${candidate.buildId}/build.json`, {
      status: 'ready', sourceId: candidate.sourceId,
    });
    return store.saveCandidate(projectId, candidate);
  }

  async function initialRevision(projectId: string): Promise<Revision> {
    const candidate = await ready(projectId, 'initial', null);
    return store.applyCandidate(projectId, candidate.id, null);
  }

  it('serializes competing apply requests so only one can advance the head', async () => {
    const project = await store.createProject('Cache explainer', 'Show one cache miss.');
    const candidate = await ready(project.id, 'first', null);
    const results = await Promise.allSettled([
      store.applyCandidate(project.id, candidate.id, null),
      store.applyCandidate(project.id, candidate.id, null),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const snapshot = await store.getSnapshot(project.id);
    expect(snapshot.revisions).toHaveLength(1);
    expect(snapshot.project.currentRevisionId).toBe(snapshot.revisions[0].id);
    expect(snapshot.project.openCandidateId).toBeNull();
    expect(snapshot.candidates[0].status).toBe('applied');
  });

  it('restores a working source/build snapshot as a new revision without moving old frame comments', async () => {
    const project = await store.createProject('Cache explainer');
    const first = await initialRevision(project.id);
    const comment = await store.addComment(project.id, {
      revisionId: first.id, shotId: shot.id, localFrame: 72, fps: 30,
    }, 'Reveal the key after the explanation.');
    const secondCandidate = await ready(project.id, 'second', first.id);
    const second = await store.applyCandidate(project.id, secondCandidate.id, first.id);
    const restored = await store.restoreRevision(project.id, first.id, second.id);

    expect(restored.id).not.toBe(first.id);
    expect(restored.parentRevisionId).toBe(second.id);
    expect(restored.sourceId).toBe(first.sourceId);
    expect(restored.buildId).toBe(first.buildId);
    expect(await store.getRevision(project.id, first.id)).toEqual(first);
    const snapshot = await store.getSnapshot(project.id);
    expect(snapshot.revisions).toHaveLength(3);
    expect(snapshot.project.currentRevisionId).toBe(restored.id);
    expect(snapshot.comments).toEqual([comment]);
    expect(snapshot.comments[0].anchor).toEqual({revisionId: first.id, shotId: shot.id, localFrame: 72, fps: 30});
    expect(snapshot.comments[0].status).toBe('open');
    await expect(store.restoreRevision(project.id, first.id, second.id)).rejects.toMatchObject({code: 'STALE_REVISION'});
  });

  it('discards a candidate without replacing the head or closing its comments', async () => {
    const project = await store.createProject('Cache explainer');
    const first = await initialRevision(project.id);
    const candidate = await ready(project.id, 'discard-me', first.id);
    await store.discardCandidate(project.id, candidate.id);
    const snapshot = await store.getSnapshot(project.id);
    expect(snapshot.project.currentRevisionId).toBe(first.id);
    expect(snapshot.project.openCandidateId).toBeNull();
    expect(snapshot.revisions).toEqual([first]);
    expect((await store.getCandidate(project.id, candidate.id)).status).toBe('discarded');
    await expect(store.applyCandidate(project.id, candidate.id, first.id)).rejects.toMatchObject({code: 'CANDIDATE_NOT_READY'});
  });

  it.each([
    {status: 'ready'},
    {status: 'ready', sourceId: 'different-source'},
    {status: 'failed', sourceId: 'source-candidate'},
  ])('refuses apply when the build is not ready for that exact source: %j', async (build) => {
    const project = await store.createProject('Cache explainer');
    const candidate = await ready(project.id, 'candidate', null);
    await store.writeJson(project.id, `builds/${candidate.buildId}/build.json`, build);
    await expect(store.applyCandidate(project.id, candidate.id, null)).rejects.toMatchObject({code: 'BUILD_NOT_READY'});
    expect((await store.getProject(project.id)).currentRevisionId).toBeNull();
    expect((await store.getSnapshot(project.id)).revisions).toHaveLength(0);
  });

  it('keeps revision records immutable through typed and generic record APIs', async () => {
    const project = await store.createProject('Cache explainer');
    const first = await initialRevision(project.id);
    await expect(store.saveRevision(project.id, {...first, summary: 'Overwrite history'})).rejects.toMatchObject({code: 'IMMUTABLE_REVISION'});
    await expect(store.writeJson(project.id, `revisions/${first.id}.json`, {...first, summary: 'Overwrite history'})).rejects.toThrow();
    expect(await store.getRevision(project.id, first.id)).toEqual(first);
  });

  it('rejects missing shots and out-of-range frame anchors instead of silently clamping them', async () => {
    const project = await store.createProject('Cache explainer');
    const revision = await initialRevision(project.id);
    for (const anchor of [
      {revisionId: revision.id, shotId: 'missing', localFrame: 0, fps: 30 as const},
      {revisionId: revision.id, shotId: shot.id, localFrame: shot.durationFrames, fps: 30 as const},
      {revisionId: revision.id, shotId: shot.id, localFrame: -1, fps: 30 as const},
    ]) {
      await expect(store.addComment(project.id, anchor, 'Inspect this frame')).rejects.toThrow();
    }
    expect((await store.getSnapshot(project.id)).comments).toHaveLength(0);
    const lastFrame = await store.addComment(project.id, {
      revisionId: revision.id, shotId: shot.id, localFrame: shot.durationFrames - 1, fps: 30,
    }, 'Last valid frame');
    expect(lastFrame.anchor.localFrame).toBe(449);
  });

  it('rejects path traversal, absolute paths and symlink reads/writes', async () => {
    const project = await store.createProject('Cache explainer');
    for (const relative of ['../escape.json', '/tmp/escape.json', 'jobs/../../escape.json', 'jobs\\escape.json', 'jobs//escape.json']) {
      await expect(store.writeJson(project.id, relative, {})).rejects.toThrow();
      await expect(store.readJson(project.id, relative)).rejects.toThrow();
    }
    expect(() => store.projectPath('../escape')).toThrow();
    const outside = path.join(root, 'outside');
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, 'record.json'), '{"fixture":"outside"}');
    await fs.symlink(outside, path.join(store.projectPath(project.id), 'linked'));
    await expect(store.readJson(project.id, 'linked/record.json')).rejects.toMatchObject({code: 'INVALID_PATH'});
    await expect(store.writeJson(project.id, 'linked/record.json', {})).rejects.toMatchObject({code: 'INVALID_PATH'});
    expect(await fs.readFile(path.join(outside, 'record.json'), 'utf8')).toBe('{"fixture":"outside"}');
  });

  it('requires exclusive writer ownership and permits a clean handoff after shutdown', async () => {
    const project = await store.createProject('Cache explainer');
    const second = new StudioStore(store.root);
    stores.push(second);
    await expect(second.acquireLock()).rejects.toMatchObject({code: 'WORKSPACE_LOCKED'});
    await expect(second.updateBrief(project.id, 'A competing edit')).rejects.toMatchObject({code: 'WORKSPACE_NOT_LOCKED'});
    await store.releaseLock();
    await second.acquireLock();
    await second.updateBrief(project.id, 'An edit after clean shutdown');
    expect((await second.getProject(project.id)).brief).toBe('An edit after clean shutdown');
  });

  it('recovers interrupted jobs/candidates while preserving the last applied head', async () => {
    const project = await store.createProject('Cache explainer');
    const first = await initialRevision(project.id);
    await store.saveCandidate(project.id, {
      id: 'interrupted-candidate', baseRevisionId: first.id, sourceId: null, buildId: null,
      status: 'generating', summary: '', shots: [], createdAt: timestamp,
    });
    const job: Job = {
      id: 'interrupted-job', projectId: project.id, kind: 'revise', status: 'running',
      message: 'Generating', createdAt: timestamp, updatedAt: timestamp, candidateId: 'interrupted-candidate',
    };
    await store.saveJob(project.id, job);
    await fs.writeFile(path.join(store.projectPath(project.id), '.project.json.leftover.tmp'), '{"incomplete":');
    await store.releaseLock();
    const reopened = new StudioStore(store.root);
    stores.push(reopened);
    await reopened.acquireLock();
    const snapshot = await reopened.getSnapshot(project.id);
    expect(snapshot.project.currentRevisionId).toBe(first.id);
    expect(snapshot.project.openCandidateId).toBeNull();
    expect(snapshot.jobs[0]).toMatchObject({status: 'failed', error: 'INTERRUPTED'});
    expect(snapshot.candidates.find((item) => item.id === 'interrupted-candidate')?.status).toBe('failed');
    expect(await reopened.getRevision(project.id, first.id)).toEqual(first);
  });

  it('recovers a truncated final conversation line without dropping earlier messages or duplicating retries', async () => {
    const project = await store.createProject('Cache explainer');
    const first = {id: 'message-first', role: 'user' as const, content: 'Explain the cache.', createdAt: timestamp};
    const second = {id: 'message-second', role: 'assistant' as const, content: 'Use one key and two nodes.', createdAt: timestamp};
    await store.saveMessage(project.id, first);
    await fs.appendFile(path.join(store.projectPath(project.id), 'conversations/chat.jsonl'), '{"id":"interrupted');
    expect((await store.getSnapshot(project.id)).messages).toEqual([first]);
    await store.saveMessage(project.id, second);
    await store.saveMessage(project.id, second);
    expect((await store.getSnapshot(project.id)).messages).toEqual([first, second]);
  });

  it('invalidates brief approval when instructions change and does not silently reset corrupt project metadata', async () => {
    const project = await store.createProject('Cache explainer', 'Explain a cache miss.');
    const approved = await store.approveBrief(project.id);
    expect(approved.approvedBriefHash).toMatch(/^[a-f0-9]{64}$/);
    expect((await store.updateBrief(project.id, 'Explain consistent hashing.')).approvedBriefHash).toBeNull();
    const target = path.join(store.projectPath(project.id), 'project.json');
    await fs.writeFile(target, '{"incomplete":');
    await expect(store.getProject(project.id)).rejects.toMatchObject({code: 'INVALID_RECORD'});
    expect(await fs.readFile(target, 'utf8')).toBe('{"incomplete":');
  });

  it('updates project agent provider and persists the choice', async () => {
    const project = await store.createProject('Agent selection project');
    expect(project.agentProvider).toBe('codex');

    const updated = await store.updateAgent(project.id, 'antigravity');
    expect(updated.agentProvider).toBe('antigravity');

    const loaded = await store.getProject(project.id);
    expect(loaded.agentProvider).toBe('antigravity');

    const unchanged = await store.updateAgent(project.id, 'antigravity');
    expect(unchanged.agentProvider).toBe('antigravity');
  });
});
