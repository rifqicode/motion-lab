import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {type Job, type SourceProposal, type Storyboard, type Project} from '@studio/studio-core';
import {readSourceFiles, type BuildResult, type StudioPreview} from '@studio/codegen';
import {board as fixtureBoard} from '../../../packages/studio-core/test/storyboard-fixture.js';
import {StudioService, type GenerationRun} from './service.js';

// Real atomic writes and fsyncs are part of these orchestration tests.
vi.setConfig({testTimeout: 60_000, hookTimeout: 30_000});

const storyboard: Storyboard = {...fixtureBoard, sharedComponents: [], shots: fixtureBoard.shots.map(shot => ({...shot, sharedComponents: []}))};
const assigned = (prompt: string) => JSON.parse(prompt.match(/Assigned shot:\n([^\n]+)/)![1]) as Storyboard['shots'][number];
const proposal = (prompt: string, baseRevisionId: string | null = null): SourceProposal => {
  const shot = assigned(prompt);
  return {baseRevisionId, summary: `Rendered ${shot.id}`, shots: [{id: shot.id, durationFrames: shot.durationFrames, intent: shot.intent, visualDirection: shot.visualDirection, narrationText: ''}],
    changedFiles: [{path: `src/shots/${shot.id}.tsx`, content: `import React from 'react';export default function Shot({frame}:{frame:number}){return <div>Rendered ${shot.id} {frame}</div>;}`}], deletedFiles: []};
};
const response = (value: unknown) => ({threadId: 'fixture', turnId: randomUUID(), status: 'completed' as const, text: JSON.stringify(value)});
const revisionPlan = (ids: string[], extra = {}) => ({summary: 'Perlambat existing video', sharedInstructions: '', designSystem: null,
  updates: storyboard.shots.filter(shot => ids.includes(shot.id)).map(shot => ({shotId: shot.id, instructions: 'Preserve the existing visuals and retime the current animation.', durationFrames: shot.durationFrames + 30})), ...extra});
const revisionPatch = (prompt: string, baseRevisionId: string) => {
  const shot = assigned(prompt);
  return {baseRevisionId, shotId: shot.id, summary: `Retimed ${shot.id}`, edits: [{path: `src/shots/${shot.id}.tsx`, oldText: `Rendered ${shot.id} {frame}`, newText: `Rendered ${shot.id} {Math.floor(frame * 0.75)}`} ]};
};

describe('incremental shot orchestration (fixture provider and preview)', () => {
  let root: string;
  let service: StudioService;
  let project: Project;
  let hash: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-generation-'));
    service = new StudioService({repoRoot: process.cwd(), projectRoot: root});
    await service.start();
    project = await service.store.createProject('Parallel fixture', 'Explain cache routing');
    const state = await service.store.saveStoryboard(project.id, storyboard, null);
    hash = state.hash!;
    await service.store.approveStoryboard(project.id, hash);
    vi.spyOn(service.codex, 'createThread').mockImplementation(async () => randomUUID());
    vi.spyOn(service.codex, 'resumeThread').mockImplementation(async id => id);
    vi.spyOn(service.builder, 'status').mockResolvedValue({available: true, image: 'fixture'});
    vi.spyOn(service.builder, 'build').mockRejectedValue(new Error('Production build called during editing'));
    vi.spyOn(service.builder, 'preview').mockImplementation(async input => {
      const manifest = await service.store.readJson<{sourceHash: string}>(project.id, `source/${input.sourceId}/manifest.json`);
      let offset = 0;
      const frames = input.shots.flatMap(shot => {const result = [offset, offset + shot.durationFrames - 1]; offset += shot.durationFrames; return result;});
      const record: BuildResult = {id: input.buildId, sourceId: input.sourceId, status: 'ready', kind: 'development', previewSessionId: 'live', shots: input.shots,
        sourceHash: manifest.sourceHash, dependencyHash: 'fixture', runtimeHash: 'fixture', previewDir: 'fixture', durationFrames: offset,
        fps: 30, width: 720, height: 1280, createdAt: new Date().toISOString(), smokeFrames: frames, image: 'fixture', isolationChecks: {}};
      await service.store.writeJson(project.id, `builds/${record.id}/build.json`, record);
      return record;
    });
    vi.spyOn(service.builder, 'screenshot').mockImplementation(async input => {
      await fs.mkdir(path.dirname(input.outputPath), {recursive: true}); await fs.writeFile(input.outputPath, 'Fixture screenshot; not visual evidence');
    });
  });
  afterEach(async () => {await service.close(); vi.restoreAllMocks(); await fs.rm(root, {recursive: true, force: true});});
  async function terminal(jobId: string): Promise<Job> {
    return vi.waitFor(async () => {
      const job = await service.store.getJob(project.id, jobId);
      if (!['succeeded', 'failed', 'cancelled'].includes(job.status)) throw new Error(`Still ${job.status}`);
      service.assertIdle(project.id);
      return job;
    }, {timeout: 30_000, interval: 25});
  }
  const run = (candidateId: string) => service.store.readJson<GenerationRun>(project.id, `generation-runs/${candidateId}.json`);
  async function acceptedVideo() {
    const turn = vi.spyOn(service.codex, 'runTurn').mockImplementation(async input => response(proposal(input.prompt)));
    const first = await terminal((await service.generate(project.id, randomUUID(), null, undefined, hash)).jobId);
    const revision = await service.store.applyCandidate(project.id, first.candidateId!, null);
    turn.mockClear();
    return {turn, revision, before: await readSourceFiles(service.store.projectPath(project.id), revision.sourceId)};
  }

  it('patches a selected shot from the same Director thread, applies duration changes and preserves history and later comments', async () => {
    const {turn, revision, before} = await acceptedVideo();
    turn.mockResolvedValueOnce({...response(null), text: 'Kita pertahankan visual, perlambat hook.'});
    expect((await terminal((await service.chat(project.id, randomUUID(), 'Bahas pacing hook.')).jobId)).status).toBe('succeeded');
    const thread = await service.store.getThread(project.id, 'brainstorm-style-v1');
    turn.mockClear();
    turn.mockImplementation(async input => input.prompt.includes('EXPLICIT VIDEO REVISION REQUEST') ? response(revisionPlan(['hook'])) : response(revisionPatch(input.prompt, revision.id)));
    const revised = await terminal((await service.reviseFromDirector(project.id, randomUUID(), 'Pelankan shot pertama saja.', revision.id, {position: 1, draft: false, shot: storyboard.shots[0]})).jobId);
    expect(revised.status, revised.error).toBe('succeeded');
    expect(turn).toHaveBeenCalledTimes(2);
    expect(turn.mock.calls[0][0].threadId).toBe(thread);
    expect(assigned(turn.mock.calls[1][0].prompt).id).toBe('hook');
    const after = await readSourceFiles(service.store.projectPath(project.id), (await run(revised.candidateId!)).sourceId);
    for (const file of before.filter(file => file.path !== 'src/shots/hook.tsx')) expect(after.find(item => item.path === file.path)?.content).toBe(file.content);
    expect(after.find(file => file.path === 'src/shots/hook.tsx')?.content).toBe(before.find(file => file.path === 'src/shots/hook.tsx')!.content.replace('Rendered hook {frame}', 'Rendered hook {Math.floor(frame * 0.75)}'));
    expect((await service.store.getProject(project.id)).currentRevisionId).toBe(revision.id);
    const applied = await service.store.applyCandidate(project.id, revised.candidateId!, revision.id);
    const board = await service.store.getStoryboard(project.id);
    expect(board.draft!.shots[0].durationFrames).toBe(120);
    expect(board.approvedHash).toBe(board.hash);
    expect(applied.shots[0].durationFrames).toBe(120);
    expect(await readSourceFiles(service.store.projectPath(project.id), revision.sourceId)).toEqual(before);
    const comment = await service.store.addComment(project.id, {revisionId: applied.id, shotId: 'explain', localFrame: 12, fps: 30}, 'Perbesar judul');
    turn.mockImplementation(async input => response(proposal(input.prompt, applied.id)));
    const commentJob = await terminal((await service.generate(project.id, randomUUID(), applied.id, comment.id)).jobId);
    expect(commentJob.status, commentJob.error).toBe('succeeded');
    expect(service.builder.screenshot).toHaveBeenLastCalledWith(expect.objectContaining({buildId: applied.buildId, frame: 132}));
    await service.store.discardCandidate(project.id, commentJob.candidateId!);
    const restored = await service.store.restoreRevision(project.id, revision.id, applied.id);
    expect(await readSourceFiles(service.store.projectPath(project.id), restored.sourceId)).toEqual(before);
    expect((await service.store.getStoryboard(project.id)).draft!.shots.map(shot => shot.durationFrames)).toEqual([90, 180]);
    expect(service.builder.build).not.toHaveBeenCalled();
  });

  it('revises the whole video by patches, with an explicit shared edit and without coordinator placeholders', async () => {
    const {turn, revision, before} = await acceptedVideo();
    turn.mockImplementation(async input => {
      if (input.prompt.includes('EXPLICIT VIDEO REVISION REQUEST')) return response(revisionPlan(['hook', 'explain'], {sharedInstructions: 'Change the existing background token only.', designSystem: {...storyboard.designSystem, colors: ['#eeeeee', '#241a48']}}));
      if (input.prompt.includes('Shared-source patch explicitly requested')) return response({baseRevisionId: revision.id, shotId: 'shared', summary: 'Adjusted background token', edits: [{path: 'src/shared/design.ts', oldText: '#faf7ef', newText: '#eeeeee'}]});
      expect(input.prompt).not.toContain('Coordinator-owned initial shared files');
      expect(input.prompt).not.toContain('Shot sedang disiapkan');
      return response(revisionPatch(input.prompt, revision.id));
    });
    const job = await terminal((await service.reviseFromDirector(project.id, randomUUID(), 'Pelankan seluruh video dan ubah background menjadi abu muda.', revision.id)).jobId);
    expect(job.status, job.error).toBe('succeeded');
    expect(turn).toHaveBeenCalledTimes(4);
    const candidate = await service.store.getCandidate(project.id, job.candidateId!);
    expect(candidate.shots.map(shot => shot.durationFrames)).toEqual([120, 210]);
    const files = await readSourceFiles(service.store.projectPath(project.id), candidate.sourceId!);
    expect(files.find(file => file.path === 'src/shared/design.ts')?.content).toBe(before.find(file => file.path === 'src/shared/design.ts')!.content.replace('#faf7ef', '#eeeeee'));
    expect(files.find(file => file.path === 'src/shared/components.tsx')?.content).toBe(before.find(file => file.path === 'src/shared/components.tsx')!.content);
    expect(await readSourceFiles(service.store.projectPath(project.id), revision.sourceId)).toEqual(before);
    await service.store.discardCandidate(project.id, candidate.id);
    expect((await service.store.getProject(project.id)).currentRevisionId).toBe(revision.id);
    expect((await service.store.getStoryboard(project.id)).hash).toBe(hash);
    expect(service.builder.build).not.toHaveBeenCalled();
  });

  it('can change duration without forcing any existing source file to be rewritten', async () => {
    const {turn, revision, before} = await acceptedVideo();
    turn.mockImplementation(async input => input.prompt.includes('EXPLICIT VIDEO REVISION REQUEST') ? response(revisionPlan(['hook'])) : response({baseRevisionId: revision.id, shotId: 'hook', summary: 'Duration-only revision', edits: []}));
    const job = await terminal((await service.reviseFromDirector(project.id, randomUUID(), 'Tambah durasi hook saja.', revision.id, {position: 1, draft: false, shot: storyboard.shots[0]})).jobId);
    expect(job.status, job.error).toBe('succeeded');
    const candidate = await service.store.getCandidate(project.id, job.candidateId!);
    expect(candidate.shots.map(shot => shot.durationFrames)).toEqual([120, 180]);
    expect(await readSourceFiles(service.store.projectPath(project.id), candidate.sourceId!)).toEqual(before);
    expect(turn).toHaveBeenCalledTimes(2);
  });

  it('revalidates shared-only changes without invoking any shot worker', async () => {
    const {turn, revision, before} = await acceptedVideo();
    turn.mockImplementation(async input => input.prompt.includes('EXPLICIT VIDEO REVISION REQUEST')
      ? response(revisionPlan([], {sharedInstructions: 'Adjust only existing background token.', designSystem: {...storyboard.designSystem, colors: ['#dddddd', '#241a48']}}))
      : response({baseRevisionId: revision.id, shotId: 'shared', summary: 'Shared token update', edits: [{path: 'src/shared/design.ts', oldText: '#faf7ef', newText: '#dddddd'}]}));
    const job = await terminal((await service.reviseFromDirector(project.id, randomUUID(), 'Ubah background saja.', revision.id)).jobId);
    expect(job.status, job.error).toBe('succeeded');
    expect(turn).toHaveBeenCalledTimes(2);
    const candidate = await service.store.getCandidate(project.id, job.candidateId!);
    const after = await readSourceFiles(service.store.projectPath(project.id), candidate.sourceId!);
    for (const file of before.filter(file => file.path.startsWith('src/shots/'))) expect(after.find(item => item.path === file.path)?.content).toBe(file.content);
    expect(candidate.shots).toEqual(revision.shots);
  });

  it('rejects a Director plan escaping selected-shot scope before patch workers run', async () => {
    const {turn, revision} = await acceptedVideo();
    turn.mockResolvedValue(response(revisionPlan(['explain'])));
    const job = await terminal((await service.reviseFromDirector(project.id, randomUUID(), 'Revisi hook', revision.id, {position: 1, draft: false, shot: storyboard.shots[0]})).jobId);
    expect(job.status).toBe('failed');
    expect(job.error).toContain('hanya boleh mengubah shot');
    expect(turn).toHaveBeenCalledTimes(3);
    expect((await service.store.getProject(project.id)).currentRevisionId).toBe(revision.id);
    expect((await service.store.getProject(project.id)).openCandidateId).toBeNull();
  });

  it('blocks cross-shot patch writes and retries only the failed revision shot', async () => {
    const {turn, revision, before} = await acceptedVideo();
    let invalid = true;
    turn.mockImplementation(async input => {
      if (input.prompt.includes('EXPLICIT VIDEO REVISION REQUEST')) return response(revisionPlan(['hook']));
      const patch = revisionPatch(input.prompt, revision.id);
      if (invalid) patch.edits[0].path = 'src/shots/explain.tsx';
      return response(patch);
    });
    const first = await terminal((await service.reviseFromDirector(project.id, randomUUID(), 'Pelankan hook', revision.id, {position: 1, draft: false, shot: storyboard.shots[0]})).jobId);
    expect(first.status).toBe('failed');
    expect((await service.store.getProject(project.id)).currentRevisionId).toBe(revision.id);
    invalid = false;
    turn.mockClear();
    const retried = await terminal((await service.retryShot(project.id, randomUUID(), first.candidateId!, 'hook')).jobId);
    expect(retried.status, retried.error).toBe('succeeded');
    expect(turn).toHaveBeenCalledTimes(1);
    const files = await readSourceFiles(service.store.projectPath(project.id), (await run(retried.candidateId!)).sourceId);
    expect(files.find(file => file.path === 'src/shots/explain.tsx')?.content).toBe(before.find(file => file.path === 'src/shots/explain.tsx')!.content);
  });

  it('cancels Director planning without changing the accepted video', async () => {
    const {turn, revision, before} = await acceptedVideo();
    let started!: () => void;
    const waiting = new Promise<void>(resolve => {started = resolve;});
    turn.mockImplementation(async input => {
      started();
      await new Promise<void>(resolve => {if (input.signal?.aborted) resolve(); else input.signal?.addEventListener('abort', () => resolve(), {once: true});});
      return response(revisionPlan(['hook']));
    });
    const job = await service.reviseFromDirector(project.id, randomUUID(), 'Revisi hook', revision.id);
    await waiting;
    await service.cancel(job.jobId);
    expect((await terminal(job.jobId)).status).toBe('cancelled');
    expect((await service.store.getProject(project.id)).currentRevisionId).toBe(revision.id);
    expect(await readSourceFiles(service.store.projectPath(project.id), revision.sourceId)).toEqual(before);
  });

  it('does not overwrite unrelated saved storyboard work when applying a Director revision', async () => {
    const {turn, revision} = await acceptedVideo();
    const saved = await service.store.saveStoryboard(project.id, {...storyboard, concept: 'Future unrelated concept'}, hash);
    turn.mockImplementation(async input => input.prompt.includes('EXPLICIT VIDEO REVISION REQUEST') ? response(revisionPlan(['hook'])) : response(revisionPatch(input.prompt, revision.id)));
    const job = await terminal((await service.reviseFromDirector(project.id, randomUUID(), 'Pelankan hook', revision.id, {position: 1, draft: false, shot: storyboard.shots[0]})).jobId);
    expect(job.status, job.error).toBe('succeeded');
    await service.store.applyCandidate(project.id, job.candidateId!, revision.id);
    const after = await service.store.getStoryboard(project.id);
    expect(after.draft?.concept).toBe(saved.draft?.concept);
    expect(after.draft?.shots[0].durationFrames).toBe(120);
    expect(after.approvedHash).toBeNull();
  });

  it('overlaps two independent worker turns and publishes placeholders then completed shots without production build', async () => {
    let active = 0; let max = 0;
    let release!: () => void;
    const barrier = new Promise<void>(resolve => {release = resolve;});
    const turn = vi.spyOn(service.codex, 'runTurn').mockImplementation(async input => {
      max = Math.max(max, ++active);
      if (active === 2) release();
      await barrier; active--;
      return response(proposal(input.prompt));
    });
    const events = vi.spyOn(service.events, 'publish');
    const job = await terminal((await service.generate(project.id, randomUUID(), null, undefined, hash)).jobId);
    expect(job.status, job.error).toBe('succeeded');
    expect(max).toBe(2);
    expect(turn).toHaveBeenCalledTimes(2);
    expect(new Set(turn.mock.calls.map(([input]) => input.threadId)).size).toBe(2);
    expect(service.builder.preview).toHaveBeenCalledTimes(3);
    expect(service.builder.build).not.toHaveBeenCalled();
    const record = await run(job.candidateId!);
    expect(record.shots.every(shot => shot.status === 'preview_ready')).toBe(true);
    expect(await service.store.readJson(project.id, `builds/${record.buildId}/director.json`)).toEqual({storyboard, storyboardHash: hash});
    const sources = await readSourceFiles(service.store.projectPath(project.id), record.sourceId);
    expect(sources.find(file => file.path === 'src/shots/hook.tsx')?.content).toContain('Rendered hook');
    expect(sources.find(file => file.path === 'src/shots/explain.tsx')?.content).toContain('Rendered explain');
    const kinds = events.mock.calls.map(call => call[1]);
    expect(kinds.indexOf('candidate.preview_ready')).toBeLessThan(kinds.indexOf('shot.generating'));
    expect(kinds.filter(kind => kind === 'shot.preview_ready')).toHaveLength(2);
    expect((await service.store.getProject(project.id)).currentRevisionId).toBeNull();
  });

  it('keeps a successful sibling after provider failure and retries only the failed shot into a new candidate', async () => {
    let failing = true;
    const turn = vi.spyOn(service.codex, 'runTurn').mockImplementation(async input => {
      if (assigned(input.prompt).id === 'hook' && failing) throw new Error('Provider quota exhausted');
      return response(proposal(input.prompt));
    });
    const first = await terminal((await service.generate(project.id, randomUUID(), null, undefined, hash)).jobId);
    expect(first.status).toBe('failed');
    const initial = await run(first.candidateId!);
    expect(initial.shots.map(shot => shot.status)).toEqual(['failed', 'preview_ready']);
    const initialFiles = await readSourceFiles(service.store.projectPath(project.id), initial.sourceId);
    const sibling = initialFiles.find(file => file.path === 'src/shots/explain.tsx')!.content;
    expect(turn).toHaveBeenCalledTimes(2);
    failing = false;
    const second = await terminal((await service.retryShot(project.id, randomUUID(), first.candidateId!, 'hook')).jobId);
    expect(second.status, second.error).toBe('succeeded');
    expect(second.candidateId).not.toBe(first.candidateId);
    expect((await service.store.getCandidate(project.id, first.candidateId!)).status).toBe('failed');
    expect(turn).toHaveBeenCalledTimes(3);
    expect(assigned(turn.mock.calls[2][0].prompt).id).toBe('hook');
    const after = await run(second.candidateId!);
    expect(after.shots.every(shot => shot.status === 'preview_ready')).toBe(true);
    expect(after.shots.find(shot => shot.shotId === 'hook')?.attempt).toBe(2);
    expect((await readSourceFiles(service.store.projectPath(project.id), after.sourceId)).find(file => file.path === 'src/shots/explain.tsx')!.content).toBe(sibling);
    expect(service.builder.build).not.toHaveBeenCalled();
  });

  it('cancels one worker while its sibling completes, and discards the cancelled late output', async () => {
    let hookStarted!: () => void;
    const started = new Promise<void>(resolve => {hookStarted = resolve;});
    vi.spyOn(service.codex, 'runTurn').mockImplementation(async input => {
      if (assigned(input.prompt).id === 'hook') {
        hookStarted();
        await new Promise<void>(resolve => {
          if (input.signal?.aborted) resolve(); else input.signal?.addEventListener('abort', () => resolve(), {once: true});
        });
      }
      return response(proposal(input.prompt));
    });
    const {jobId} = await service.generate(project.id, randomUUID(), null, undefined, hash);
    await started;
    const job = await service.store.getJob(project.id, jobId);
    await service.cancelShot(project.id, job.candidateId!, 'hook');
    expect((await terminal(jobId)).status).toBe('failed');
    const record = await run(job.candidateId!);
    expect(record.shots.map(shot => shot.status)).toEqual(['cancelled', 'preview_ready']);
    const files = await readSourceFiles(service.store.projectPath(project.id), record.sourceId);
    expect(files.find(file => file.path === 'src/shots/hook.tsx')!.content).toContain('Shot sedang disiapkan');
    expect(files.find(file => file.path === 'src/shots/explain.tsx')!.content).toContain('Rendered explain');
  });

  it('rejects cross-shot file writes with bounded repairs and preserves the other worker output', async () => {
    const turn = vi.spyOn(service.codex, 'runTurn').mockImplementation(async input => {
      const value = proposal(input.prompt);
      if (assigned(input.prompt).id === 'hook') value.changedFiles[0].path = 'src/shared/design.ts';
      return response(value);
    });
    const job = await terminal((await service.generate(project.id, randomUUID(), null, undefined, hash)).jobId);
    expect(job.status).toBe('failed');
    expect(turn).toHaveBeenCalledTimes(4);
    const record = await run(job.candidateId!);
    expect(record.shots.find(shot => shot.shotId === 'hook')?.error).toContain('hanya boleh');
    expect(record.shots.find(shot => shot.shotId === 'explain')?.status).toBe('preview_ready');
    expect((await readSourceFiles(service.store.projectPath(project.id), record.sourceId)).find(file => file.path === 'src/shared/design.ts')!.content).toContain('designSystem');
  });

  it('feeds runtime diagnostics back to only the failing worker before publishing a repaired shot', async () => {
    let broken = true;
    const preview = vi.mocked(service.builder.preview);
    const publish = preview.getMockImplementation()!;
    preview.mockImplementation(async input => {
      const files = await readSourceFiles(input.projectDir, input.sourceId);
      if (files.some(file => file.content.includes('RUNTIME_FIXTURE_FAILURE'))) throw new Error('Frame 0: RUNTIME_FIXTURE_FAILURE');
      return publish(input);
    });
    const turn = vi.spyOn(service.codex, 'runTurn').mockImplementation(async input => {
      const value = proposal(input.prompt);
      if (assigned(input.prompt).id === 'hook' && broken) {
        broken = false;
        value.changedFiles[0].content = "export default function Shot(){throw new Error('RUNTIME_FIXTURE_FAILURE');}";
      } else if (assigned(input.prompt).id === 'hook') expect(input.prompt).toContain('Frame 0: RUNTIME_FIXTURE_FAILURE');
      return response(value);
    });
    const events = vi.spyOn(service.events, 'publish');
    const job = await terminal((await service.generate(project.id, randomUUID(), null, undefined, hash)).jobId);
    expect(job.status, job.error).toBe('succeeded');
    expect(turn).toHaveBeenCalledTimes(3);
    expect(turn.mock.calls.filter(([input]) => assigned(input.prompt).id === 'explain')).toHaveLength(1);
    expect((await run(job.candidateId!)).shots.find(shot => shot.shotId === 'hook')?.attempt).toBe(2);
    expect(events.mock.calls.some(call => call[1] === 'shot.retrying')).toBe(true);
    expect(service.builder.build).not.toHaveBeenCalled();
  });

  it('revises only the commented shot and keeps real capture metadata separate from comment records', async () => {
    const turn = vi.spyOn(service.codex, 'runTurn').mockImplementation(async input => response(proposal(input.prompt)));
    const first = await terminal((await service.generate(project.id, randomUUID(), null, undefined, hash)).jobId);
    const revision = await service.store.applyCandidate(project.id, first.candidateId!, null);
    const before = await readSourceFiles(service.store.projectPath(project.id), revision.sourceId);
    const comment = await service.store.addComment(project.id, {revisionId: revision.id, shotId: 'explain', localFrame: 72, fps: 30}, 'Make heading larger');
    vi.mocked(service.builder.screenshot).mockRestore();
    const capture = (service.builder as unknown as {development: StudioPreview}).development;
    vi.spyOn(capture, 'screenshot').mockImplementation(async (_projectDir, _record, _frame, outputPath) => {
      await fs.writeFile(outputPath, 'Browser PNG fixture; not visual evidence');
    });
    vi.spyOn(service.builder, 'screenshot');
    turn.mockImplementationOnce(async input => {
      expect(input.prompt).not.toContain('src/shots/hook.tsx');
      const value = proposal(input.prompt, revision.id);
      value.changedFiles[0].content = value.changedFiles[0].content.replace('Rendered explain', 'Revised explain');
      return response(value);
    });
    const revised = await terminal((await service.generate(project.id, randomUUID(), revision.id, comment.id)).jobId);
    expect(revised.status, revised.error).toBe('succeeded');
    expect(turn).toHaveBeenCalledTimes(3);
    expect(service.builder.screenshot).toHaveBeenCalledWith(expect.objectContaining({frame: 162}));
    expect(service.builder.preview).toHaveBeenLastCalledWith(expect.objectContaining({frames: [162]}));
    const snapshot = await service.store.getSnapshot(project.id);
    expect(snapshot.comments.map(item => item.id)).toEqual([comment.id]);
    expect(snapshot.comments[0].screenshot).toBe(`comments/${comment.id}.png`);
    const metadata = JSON.parse(await fs.readFile(path.join(service.store.projectPath(project.id), 'comments', `.${comment.id}.capture.json`), 'utf8'));
    expect(metadata).toMatchObject({buildId: revision.buildId, sourceId: revision.sourceId, frame: 162, revalidated: true});
    const after = await readSourceFiles(service.store.projectPath(project.id), (await run(revised.candidateId!)).sourceId);
    for (const file of before.filter(file => file.path !== 'src/shots/explain.tsx')) expect(after.find(item => item.path === file.path)?.content).toBe(file.content);
    expect(after.find(file => file.path === 'src/shots/explain.tsx')!.content).toContain('Revised explain');
    expect(service.builder.build).not.toHaveBeenCalled();
  });

  it('revises the accepted shot after cancelling a new generation without using its partial source', async () => {
    const turn = vi.spyOn(service.codex, 'runTurn').mockImplementation(async input => response(proposal(input.prompt)));
    const first = await terminal((await service.generate(project.id, randomUUID(), null, undefined, hash)).jobId);
    const revision = await service.store.applyCandidate(project.id, first.candidateId!, null);
    const before = await readSourceFiles(service.store.projectPath(project.id), revision.sourceId);
    let started!: () => void;
    const startedTurn = new Promise<void>(resolve => {started = resolve;});
    turn.mockImplementation(async input => {
      started();
      await new Promise<void>(resolve => {
        if (input.signal?.aborted) resolve(); else input.signal?.addEventListener('abort', () => resolve(), {once: true});
      });
      return response(proposal(input.prompt, revision.id));
    });
    const cancelled = await service.generate(project.id, randomUUID(), revision.id, undefined, hash);
    await startedTurn;
    await service.cancel(cancelled.jobId);
    expect((await terminal(cancelled.jobId)).status).toBe('cancelled');
    expect((await service.store.getProject(project.id)).currentRevisionId).toBe(revision.id);
    const comment = await service.store.addComment(project.id, {revisionId: revision.id, shotId: 'hook', localFrame: 12, fps: 30}, 'Perbesar judul shot pertama.');
    turn.mockClear();
    turn.mockImplementation(async input => {
      expect(assigned(input.prompt).id).toBe('hook');
      const value = proposal(input.prompt, revision.id);
      value.changedFiles[0].content = value.changedFiles[0].content.replace('Rendered hook', 'Revised hook');
      return response(value);
    });
    const revised = await terminal((await service.generate(project.id, randomUUID(), revision.id, comment.id)).jobId);
    expect(revised.status, revised.error).toBe('succeeded');
    expect(turn).toHaveBeenCalledTimes(1);
    expect(service.builder.screenshot).toHaveBeenCalledWith(expect.objectContaining({buildId: revision.buildId, frame: 12}));
    const after = await readSourceFiles(service.store.projectPath(project.id), (await run(revised.candidateId!)).sourceId);
    for (const file of before.filter(file => file.path !== 'src/shots/hook.tsx')) expect(after.find(item => item.path === file.path)?.content).toBe(file.content);
    expect(service.builder.build).not.toHaveBeenCalled();
  });

  it('establishes real shared component source through the coordinator before dispatching workers', async () => {
    const state = await service.store.saveStoryboard(project.id, fixtureBoard, hash);
    await service.store.approveStoryboard(project.id, state.hash!);
    const order: string[] = [];
    vi.spyOn(service.codex, 'runTurn').mockImplementation(async input => {
      if (input.prompt.includes('Coordinator-owned initial shared files:')) {
        order.push('coordinator');
        return response({baseRevisionId: null, summary: 'Shared heading', shots: fixtureBoard.shots.map(shot => ({id: shot.id, durationFrames: shot.durationFrames, intent: shot.intent, visualDirection: shot.visualDirection})),
          changedFiles: [{path: 'src/shared/components.tsx', content: "import React from 'react';const Heading=({children}:{children?:React.ReactNode})=><h1>{children}</h1>;export const sharedComponents={'heading':Heading};"}], deletedFiles: []});
      }
      order.push(assigned(input.prompt).id);
      expect(input.prompt).toContain("export const sharedComponents={'heading':Heading}");
      return response(proposal(input.prompt));
    });
    const job = await terminal((await service.generate(project.id, randomUUID(), null, undefined, state.hash!)).jobId);
    expect(job.status, job.error).toBe('succeeded');
    expect(order[0]).toBe('coordinator');
    expect(order.slice(1).sort()).toEqual(['explain', 'hook']);
  });

  it('exports only an applied current revision on explicit request', async () => {
    vi.spyOn(service.codex, 'runTurn').mockImplementation(async input => response(proposal(input.prompt)));
    const exporter = vi.spyOn(service.builder, 'export').mockImplementation(async input => ({id: input.exportId, file: 'fixture.mp4', durationFrames: 270, fps: 30, width: 720, height: 1280}));
    const generated = await terminal((await service.generate(project.id, randomUUID(), null, undefined, hash)).jobId);
    expect(exporter).not.toHaveBeenCalled();
    const revision = await service.store.applyCandidate(project.id, generated.candidateId!, null);
    const exported = await terminal((await service.exportRevision(project.id, randomUUID(), revision.id)).jobId);
    expect(exported.status, exported.error).toBe('succeeded');
    expect(exporter).toHaveBeenCalledOnce();
    expect(await service.store.readJson(project.id, `exports/${exported.id}.json`)).toMatchObject({revisionId: revision.id, status: 'ready', file: 'fixture.mp4'});
    expect((await terminal((await service.exportRevision(project.id, randomUUID(), 'stale-revision')).jobId)).status).toBe('failed');
    expect(exporter).toHaveBeenCalledOnce();
  });
});
