import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {sha256, type Candidate} from '@studio/studio-core';
import {StudioStore} from './index.js';

const timestamp = '2026-11-11T00:00:00.000Z';
const shot = {id: 'hook', durationFrames: 60, intent: 'Introduce concept', visualDirection: 'Editorial heading'};

describe('development provenance and interrupted shot recovery', () => {
  let root: string;
  let store: StudioStore;
  let projectId: string;
  const stores: StudioStore[] = [];
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-integrity-'));
    store = new StudioStore(root); stores.push(store);
    await store.acquireLock();
    projectId = (await store.createProject('Integrity fixture')).id;
  });
  afterEach(async () => {await Promise.all(stores.splice(0).map(item => item.releaseLock())); await fs.rm(root, {recursive: true, force: true});});

  async function development(): Promise<Candidate> {
    const files = [{path: 'src/shots/hook.tsx', content: 'export default function Hook(){return <div>Ready</div>;}'}];
    const sourceHash = sha256(JSON.stringify({files, shots: [shot]}));
    const manifest = {schemaVersion: 1, sourceId: 'source-dev', sourceHash, shots: [shot], files: files.map(file => ({path: file.path, hash: sha256(file.content)}))};
    await store.writeJson(projectId, 'source/source-dev/manifest.json', manifest);
    const sourcePath = path.join(store.projectPath(projectId), 'source/source-dev/src/shots');
    await fs.mkdir(sourcePath, {recursive: true});
    await fs.writeFile(path.join(sourcePath, 'hook.tsx'), files[0].content);
    await store.writeJson(projectId, 'builds/build-dev/build.json', {id: 'build-dev', kind: 'development', status: 'ready', sourceId: 'source-dev', sourceHash,
      shots: [shot], durationFrames: 60, fps: 30, width: 720, height: 1280, dependencyHash: 'fixture-dependencies', runtimeHash: 'fixture-runtime', image: 'fixture-image', smokeFrames: [0, 30, 59]});
    return store.saveCandidate(projectId, {id: 'candidate-dev', baseRevisionId: null, sourceId: 'source-dev', buildId: 'build-dev',
      status: 'ready', summary: 'Validated development preview', shots: [shot], createdAt: timestamp});
  }

  it('applies and restores a development snapshot after verifying sealed file and timeline hashes', async () => {
    const candidate = await development();
    const applied = await store.applyCandidate(projectId, candidate.id, null);
    const restored = await store.restoreRevision(projectId, applied.id, applied.id);
    expect(restored.id).not.toBe(applied.id);
    expect(restored.sourceId).toBe(applied.sourceId);
    expect(restored.buildId).toBe(applied.buildId);
    expect(await store.getRevision(projectId, applied.id)).toEqual(applied);
  });

  it('refuses apply if a validated source file changes, keeping the candidate and head intact', async () => {
    const candidate = await development();
    await fs.writeFile(path.join(store.projectPath(projectId), 'source/source-dev/src/shots/hook.tsx'), 'export default function Changed(){return null;}');
    await expect(store.applyCandidate(projectId, candidate.id, null)).rejects.toMatchObject({code: 'SOURCE_CHANGED'});
    expect((await store.getProject(projectId)).currentRevisionId).toBeNull();
    expect((await store.getCandidate(projectId, candidate.id)).status).toBe('ready');
  });

  it('accepts complete legacy evidence without a runtime kind while still verifying its hashes', async () => {
    const candidate = await development();
    const record = await store.readJson<Record<string, unknown>>(projectId, 'builds/build-dev/build.json');
    delete record.kind;
    await store.writeJson(projectId, 'builds/build-dev/build.json', record);
    expect((await store.applyCandidate(projectId, candidate.id, null)).sourceId).toBe(candidate.sourceId);
  });

  it('refuses restore when source evidence changed after the revision was accepted', async () => {
    const candidate = await development();
    const revision = await store.applyCandidate(projectId, candidate.id, null);
    const record = await store.readJson<Record<string, unknown>>(projectId, 'builds/build-dev/build.json');
    await store.writeJson(projectId, 'builds/build-dev/build.json', {...record, sourceHash: '0'.repeat(64)});
    await expect(store.restoreRevision(projectId, revision.id, revision.id)).rejects.toMatchObject({code: 'SOURCE_CHANGED'});
    expect((await store.getProject(projectId)).currentRevisionId).toBe(revision.id);
    expect((await store.getSnapshot(projectId)).revisions).toHaveLength(1);
  });

  it.each([
    {kind: 'future-runtime'},
    {sourceHash: undefined},
    {kind: undefined, sourceHash: undefined},
    {kind: undefined, sourceHash: '0'.repeat(64)},
    {shots: [{...shot, durationFrames: 61}]},
    {durationFrames: 61},
    {smokeFrames: [60]},
  ])('refuses incomplete or mismatched development provenance: %j', async patch => {
    const candidate = await development();
    const record = await store.readJson<Record<string, unknown>>(projectId, 'builds/build-dev/build.json');
    await store.writeJson(projectId, 'builds/build-dev/build.json', {...record, ...patch});
    await expect(store.applyCandidate(projectId, candidate.id, null)).rejects.toThrow();
    expect((await store.getProject(projectId)).currentRevisionId).toBeNull();
  });

  async function interruptedRun() {
    const shots = ['queued', 'generating', 'validating', 'preview_ready'].map((status, index) => ({shotId: `shot-${index}`, status, attempt: 1}));
    const candidate = {id: 'interrupted', baseRevisionId: null, sourceId: 'last-valid-source', buildId: 'last-valid-build', status: 'building' as const,
      summary: 'Partial shot output', shots: shots.map(task => ({...shot, id: task.shotId})), createdAt: timestamp};
    await store.saveCandidate(projectId, candidate);
    await store.saveJob(projectId, {id: 'job-interrupted', projectId, kind: 'generate', status: 'running', candidateId: candidate.id,
      message: 'Generating', createdAt: timestamp, updatedAt: timestamp});
    const run = {candidateId: candidate.id, jobId: 'job-interrupted', storyboardHash: 'a'.repeat(64), baseRevisionId: null,
      sourceId: candidate.sourceId, buildId: candidate.buildId, shots, createdAt: timestamp, updatedAt: timestamp};
    await store.writeJson(projectId, `generation-runs/${candidate.id}.json`, run);
    return run;
  }

  it('cancels interrupted children while preserving completed siblings and last valid preview references', async () => {
    const original = await interruptedRun();
    await store.saveJob(projectId, {id: 'queued-job', projectId, kind: 'chat', status: 'queued', message: 'Queued', createdAt: timestamp, updatedAt: timestamp});
    await store.releaseLock();
    const reopened = new StudioStore(root); stores.push(reopened); await reopened.acquireLock();
    const recovered = await reopened.readJson<typeof original>(projectId, 'generation-runs/interrupted.json');
    expect(recovered.shots.map(task => task.status)).toEqual(['cancelled', 'cancelled', 'cancelled', 'preview_ready']);
    expect(recovered.shots[3]).toEqual(original.shots[3]);
    expect(recovered.sourceId).toBe(original.sourceId);
    expect(recovered.buildId).toBe(original.buildId);
    expect((await reopened.getCandidate(projectId, 'interrupted')).status).toBe('failed');
    expect((await reopened.getProject(projectId)).openCandidateId).toBeNull();
    expect((await reopened.getJob(projectId, 'queued-job')).status).toBe('failed');
  });

  it.each(['invalid-json', 'unknown-field', 'wrong-candidate-id', 'wrong-job-id'])('fails closed on corrupt generation run %s without silently resetting it', async corruption => {
    const original = await interruptedRun();
    const file = path.join(store.projectPath(projectId), 'generation-runs/interrupted.json');
    const content = corruption === 'invalid-json' ? '{invalid' : JSON.stringify({...original,
      ...(corruption === 'unknown-field' ? {unexpected: true} : {}),
      ...(corruption === 'wrong-candidate-id' ? {candidateId: 'another-candidate'} : {}),
      ...(corruption === 'wrong-job-id' ? {jobId: 'another-job'} : {}),
    });
    await fs.writeFile(file, content);
    await store.releaseLock();
    const reopened = new StudioStore(root); stores.push(reopened);
    await expect(reopened.acquireLock()).rejects.toThrow();
    expect(await fs.readFile(file, 'utf8')).toBe(content);
    expect((await reopened.getJob(projectId, 'job-interrupted')).status).toBe('running');
  });

  it('rejects generation-run path/identity mismatches at write time', async () => {
    const run = await interruptedRun();
    await expect(store.writeJson(projectId, 'generation-runs/another-candidate.json', run)).rejects.toMatchObject({code: 'INVALID_RECORD'});
    await expect(store.writeJson(projectId, 'generation-runs/interrupted/nested.json', run)).rejects.toMatchObject({code: 'INVALID_RECORD'});
  });
});
