import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {StudioError, type Job} from '@studio/studio-core';
import type {BuildProgressCallback, BuildResult} from '@studio/codegen';
import {StudioService} from './service.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return {promise, resolve};
}

describe('job progress persistence (Codex/build fixtures)', () => {
  let root: string;
  let service: StudioService;
  let releaseStage: ReturnType<typeof deferred>;
  let enteredStage: ReturnType<typeof deferred>;
  let lateProgress: BuildProgressCallback | undefined;
  const stages = ['typecheck', 'browser-build', 'render-build', 'smoke-checking', 'ready'];
  const messages = ['Memeriksa tipe TypeScript', 'Membangun preview', 'Membangun render', 'Memeriksa frame', 'Menyiapkan kandidat preview'];

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-progress-test-'));
    service = new StudioService({repoRoot: process.cwd(), projectRoot: root});
    await service.start();
    releaseStage = deferred();
    enteredStage = deferred();
    lateProgress = undefined;
    vi.spyOn(service.codex, 'createThread').mockResolvedValue('progress-fixture-thread');
    vi.spyOn(service.codex, 'runTurn').mockResolvedValue({threadId: 'progress-fixture-thread', turnId: 'progress-turn', status: 'completed', text: JSON.stringify({
      baseRevisionId: null, summary: 'Fixture custom shot', shots: [{id: 'cache', durationFrames: 450, intent: 'Explain a cache key', visualDirection: 'Dark SVG'}],
      changedFiles: [{path: 'src/shots/cache.tsx', content: "import React from 'react'; export default ({frame}:{frame:number})=><svg width={720} height={1280}><circle cx={frame+20} cy={100} r={10}/></svg>;"}], deletedFiles: [],
    })});
    vi.spyOn(service.builder, 'status').mockResolvedValue({available: true, image: 'fixture-image'});
    const saveJob = service.store.saveJob.bind(service.store);
    vi.spyOn(service.store, 'saveJob').mockImplementation(async (projectId, job) => {
      if (job.message === messages[0]) { enteredStage.resolve(); await releaseStage.promise; }
      return saveJob(projectId, job);
    });
  });

  afterEach(async () => {
    releaseStage.resolve();
    await service.close();
    vi.restoreAllMocks();
    await fs.rm(root, {recursive: true, force: true});
  });

  async function begin(): Promise<{projectId: string; jobId: string}> {
    const project = await service.store.createProject('Progress fixture', 'Show one moving cache key.');
    await service.store.approveBrief(project.id);
    const {jobId} = await service.generate(project.id, randomUUID(), null);
    return {projectId: project.id, jobId};
  }

  async function terminal(projectId: string, jobId: string): Promise<Job> {
    return vi.waitFor(async () => {
      const job = await service.store.getJob(projectId, jobId);
      if (!['succeeded', 'failed', 'cancelled'].includes(job.status)) throw new Error('Job not terminal yet');
      service.assertIdle(projectId);
      return job;
    }, {timeout: 10_000, interval: 10});
  }

  it('persists rapid worker stages in order and drains them before a ready candidate or successful job', async () => {
    const events = vi.spyOn(service.events, 'publish');
    vi.spyOn(service.builder, 'build').mockImplementation(async input => {
      lateProgress = input.onProgress;
      for (const stage of stages.slice(0, -1)) void input.onProgress?.(stage);
      const record: BuildResult = {id: input.buildId, sourceId: input.sourceId, status: 'ready', shots: input.shots,
        durationFrames: 450, fps: 30, width: 720, height: 1280, sourceHash: 'fixture-source', dependencyHash: 'fixture-dependencies', runtimeHash: 'fixture-runtime',
        previewDir: 'fixture-preview', createdAt: new Date().toISOString(), smokeFrames: [0, 449], image: 'fixture-image', isolationChecks: {}};
      await service.store.writeJson(path.basename(input.projectDir), `builds/${input.buildId}/build.json`, record);
      void input.onProgress?.('ready');
      return record;
    });
    const {projectId, jobId} = await begin();
    await enteredStage.promise;
    expect((await service.store.getJob(projectId, jobId)).status).toBe('running');
    expect((await service.store.getSnapshot(projectId)).candidates[0].status).toBe('building');
    expect(events.mock.calls.some(call => call[1] === 'candidate.ready')).toBe(false);
    releaseStage.resolve();
    const job = await terminal(projectId, jobId);
    expect(job).toMatchObject({status: 'succeeded', message: 'Selesai'});
    const persisted = events.mock.calls.filter(call => call[1] === 'job.progress' && call[3] === jobId)
      .map(call => (call[2] as {message?: string}).message).filter(message => messages.includes(message ?? ''));
    expect(persisted).toEqual(messages);
    const lastStageIndex = events.mock.calls.findIndex(call => call[1] === 'job.progress' && (call[2] as {message?: string}).message === messages.at(-1));
    const readyIndex = events.mock.calls.findIndex(call => call[1] === 'candidate.ready');
    const completedIndex = events.mock.calls.findIndex(call => call[1] === 'job.completed');
    expect(readyIndex).toBeGreaterThan(lastStageIndex);
    expect(completedIndex).toBeGreaterThan(readyIndex);
    await lateProgress?.('browser-build');
    expect(await service.store.getJob(projectId, jobId)).toEqual(job);
  }, 15_000);

  it.each(['RUNTIME_UNAVAILABLE', 'BROWSER_START_TIMEOUT'])('drains progress before recording %s without another AI turn and ignores late updates', async failureCode => {
    const events = vi.spyOn(service.events, 'publish');
    vi.spyOn(service.builder, 'build').mockImplementation(async input => {
      lateProgress = input.onProgress;
      void input.onProgress?.('typecheck');
      void input.onProgress?.('render-build');
      throw new StudioError(failureCode, 'Fixture worker failure', 503);
    });
    const {projectId, jobId} = await begin();
    await enteredStage.promise;
    expect((await service.store.getJob(projectId, jobId)).status).toBe('running');
    expect(events.mock.calls.some(call => call[1] === 'job.failed')).toBe(false);
    releaseStage.resolve();
    const failed = await terminal(projectId, jobId);
    expect(failed).toMatchObject({status: 'failed', message: 'Proses gagal', error: 'Fixture worker failure'});
    expect(service.codex.runTurn).toHaveBeenCalledTimes(1);
    const stageIndex = events.mock.calls.findIndex(call => call[1] === 'job.progress' && (call[2] as {message?: string}).message === 'Membangun render');
    const failedIndex = events.mock.calls.findIndex(call => call[1] === 'job.failed');
    expect(failedIndex).toBeGreaterThan(stageIndex);
    await lateProgress?.('ready');
    expect(await service.store.getJob(projectId, jobId)).toEqual(failed);
    expect(events.mock.calls.some(call => call[1] === 'candidate.ready')).toBe(false);
  }, 15_000);
});
