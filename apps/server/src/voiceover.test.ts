import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import http from 'node:http';
import {storyboardShots, type Job, type Project, type Revision} from '@studio/studio-core';
import {materializeSource, readSourceFiles, readSourceVoiceovers, type BuildResult} from '@studio/codegen';
import {board} from '../../../packages/studio-core/test/storyboard-fixture.js';
import {StudioService} from './service.js';
import {createStudioHttp} from './http.js';

vi.setConfig({testTimeout: 60_000, hookTimeout: 30_000});
const shots = storyboardShots(board);
const text = 'Selamat datang di video ini.';
function wav(): Buffer {
  const bytes = Buffer.alloc(44 + 24_000 * 2);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(24_000, 24); bytes.writeUInt32LE(48_000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  return bytes;
}

describe('local voice-over candidate orchestration', () => {
  let root: string;
  let service: StudioService;
  let project: Project;
  let original: Revision;
  let app: Awaited<ReturnType<typeof createStudioHttp>> | undefined;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-voiceover-'));
    service = new StudioService({repoRoot: process.cwd(), projectRoot: root});
    await service.start();
    project = await service.store.createProject('Voice-over fixture', 'Keep current visuals');
    const state = await service.store.saveStoryboard(project.id, board, null);
    await service.store.approveStoryboard(project.id, state.hash!);
    vi.spyOn(service.codex, 'runTurn').mockRejectedValue(new Error('Voice-over must not call an AI code agent'));
    vi.spyOn(service.builder, 'build').mockRejectedValue(new Error('Editing must not invoke production rendering'));
    vi.spyOn(service.voiceover, 'status').mockResolvedValue({available: true, device: 'fixture'});
    vi.spyOn(service.voiceover, 'synthesize').mockImplementation(async input => {
      await fs.writeFile(input.outputPath, wav());
      return {durationMs: 1000, sampleRate: 24_000};
    });
    vi.spyOn(service.builder, 'preview').mockImplementation(async input => {
      const manifest = await service.store.readJson<{sourceHash: string}>(project.id, `source/${input.sourceId}/manifest.json`);
      const durationFrames = input.shots.reduce((sum, shot) => sum + shot.durationFrames, 0);
      const record: BuildResult = {id: input.buildId, sourceId: input.sourceId, status: 'ready', kind: 'development', previewSessionId: 'live', shots: input.shots,
        sourceHash: manifest.sourceHash, dependencyHash: 'fixture', runtimeHash: 'fixture', previewDir: 'fixture', durationFrames,
        fps: 30, width: 720, height: 1280, createdAt: new Date().toISOString(), smokeFrames: [0, durationFrames - 1], image: 'fixture', isolationChecks: {}};
      await service.store.writeJson(project.id, `builds/${record.id}/build.json`, record);
      return record;
    });
    const source = await materializeSource(service.store.projectPath(project.id), {baseRevisionId: null, summary: 'Original video', shots,
      changedFiles: shots.map(shot => ({path: `src/shots/${shot.id}.tsx`, content: `export default () => <div>Original ${shot.id}</div>;`})), deletedFiles: []});
    const buildId = randomUUID();
    await service.builder.preview({projectDir: service.store.projectPath(project.id), sourceId: source.sourceId, shots, buildId});
    await service.store.writeJson(project.id, `builds/${buildId}/director.json`, {storyboard: board, storyboardHash: state.hash});
    const candidate = await service.store.saveCandidate(project.id, {id: randomUUID(), baseRevisionId: null, sourceId: source.sourceId, buildId, status: 'ready', summary: 'Original video', shots, createdAt: new Date().toISOString()});
    original = await service.store.applyCandidate(project.id, candidate.id, null);
    vi.mocked(service.builder.preview).mockClear();
  });
  afterEach(async () => {await app?.close(); app = undefined; await service.close(); vi.restoreAllMocks(); await fs.rm(root, {recursive: true, force: true});});
  async function terminal(jobId: string): Promise<Job> {
    return vi.waitFor(async () => {
      const job = await service.store.getJob(project.id, jobId);
      if (!['succeeded', 'failed', 'cancelled'].includes(job.status)) throw new Error(`Still ${job.status}`);
      service.assertIdle(project.id);
      return job;
    }, {timeout: 30_000, interval: 25});
  }
  const input = (extra = {}) => ({expectedRevisionId: original.id, shotId: 'hook', text, volume: 0.75, fitDuration: true, ...extra});
  async function httpFixture() {
    const probes = [http.createServer(), http.createServer()];
    let ports: number[];
    try {
      await Promise.all(probes.map(server => new Promise<void>((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve());})));
      ports = probes.map(server => (server.address() as {port: number}).port);
    } finally {await Promise.all(probes.map(server => new Promise<void>(resolve => server.close(() => resolve()))));}
    const editor = path.join(root, 'editor');
    await fs.mkdir(editor);
    await fs.writeFile(path.join(editor, 'index.html'), '<!doctype html><html lang="id"><head><!-- STUDIO_BOOTSTRAP --></head><body>Audio API fixture</body></html>');
    app = await createStudioHttp({service, editorDir: editor, port: ports[0], previewPort: ports[1]});
    const origin = `http://127.0.0.1:${ports[0]}`;
    const bootstrap = await fetch(origin);
    const markup = await bootstrap.text();
    const token = markup.match(/name="studio-session" content="([a-f0-9]+)"/)?.[1] ?? '';
    expect(token).toHaveLength(64);
    const route = `/api/projects/${project.id}/voiceovers`;
    return {origin, route, bootstrap,
      request: (suffix = '', method = 'GET', value?: unknown) => fetch(origin + route + suffix, {method,
        headers: {'x-studio-session': token, origin, ...(value === undefined ? {} : {'content-type': 'application/json'})},
        ...(value === undefined ? {} : {body: JSON.stringify(value)})})};
  }

  it('creates a reviewable audio candidate without changing visuals, then preserves sibling audio through apply and restore', async () => {
    const before = await readSourceFiles(service.store.projectPath(project.id), original.sourceId);
    const first = await terminal((await service.generateVoiceover(project.id, randomUUID(), input())).jobId);
    expect(first.status, first.error).toBe('succeeded');
    const candidate = await service.store.getCandidate(project.id, first.candidateId!);
    expect(candidate.status).toBe('ready');
    expect((await service.store.getProject(project.id)).currentRevisionId).toBe(original.id);
    expect(await readSourceFiles(service.store.projectPath(project.id), candidate.sourceId!)).toEqual(before);
    expect(await readSourceVoiceovers(service.store.projectPath(project.id), original.sourceId)).toEqual([]);
    const applied = await service.store.applyCandidate(project.id, candidate.id, original.id);
    const hookTrack = (await service.voiceovers(project.id)).tracks[0];
    expect(hookTrack).toMatchObject({shotId: 'hook', text, volume: 0.75});
    expect(await fs.readFile(await service.voiceoverFile(project.id, applied.sourceId, hookTrack.assetId))).toEqual(wav());
    const second = await terminal((await service.generateVoiceover(project.id, randomUUID(), input({expectedRevisionId: applied.id, shotId: 'explain', text: 'Penjelasan kedua.'}))).jobId);
    expect(second.status, second.error).toBe('succeeded');
    const secondCandidate = await service.store.getCandidate(project.id, second.candidateId!);
    expect((await service.voiceovers(project.id, secondCandidate.sourceId!)).tracks).toEqual(expect.arrayContaining([hookTrack]));
    const secondApplied = await service.store.applyCandidate(project.id, secondCandidate.id, applied.id);
    expect((await service.voiceovers(project.id)).tracks).toHaveLength(2);
    const restored = await service.store.restoreRevision(project.id, original.id, secondApplied.id);
    expect(restored.sourceId).toBe(original.sourceId);
    expect((await service.voiceovers(project.id)).tracks).toEqual([]);
    expect(await readSourceFiles(service.store.projectPath(project.id), original.sourceId)).toEqual(before);
    expect(service.codex.runTurn).not.toHaveBeenCalled();
    expect(service.builder.build).not.toHaveBeenCalled();
  });

  it('extends only the requested shot to fit narration and synchronizes storyboard timing on apply and restore', async () => {
    vi.mocked(service.voiceover.synthesize).mockImplementation(async input => {await fs.writeFile(input.outputPath, wav()); return {durationMs: 4500, sampleRate: 24_000};});
    const job = await terminal((await service.generateVoiceover(project.id, randomUUID(), input())).jobId);
    expect(job.status, job.error).toBe('succeeded');
    const candidate = await service.store.getCandidate(project.id, job.candidateId!);
    expect(candidate.shots.map(shot => shot.durationFrames)).toEqual([144, 180]);
    expect((await service.store.getStoryboard(project.id)).draft!.shots.map(shot => shot.durationFrames)).toEqual([90, 180]);
    const applied = await service.store.applyCandidate(project.id, candidate.id, original.id);
    expect((await service.store.getStoryboard(project.id)).draft!.shots.map(shot => shot.durationFrames)).toEqual([144, 180]);
    await service.store.restoreRevision(project.id, original.id, applied.id);
    expect((await service.store.getStoryboard(project.id)).draft!.shots.map(shot => shot.durationFrames)).toEqual([90, 180]);
  });

  it('fails rather than clipping narration when duration extension is disabled', async () => {
    vi.mocked(service.voiceover.synthesize).mockImplementation(async input => {await fs.writeFile(input.outputPath, wav()); return {durationMs: 4500, sampleRate: 24_000};});
    const job = await terminal((await service.generateVoiceover(project.id, randomUUID(), input({fitDuration: false}))).jobId);
    expect(job.status).toBe('failed');
    expect(job.error).toContain('Narasi melebihi durasi');
    expect(service.builder.preview).not.toHaveBeenCalled();
    expect((await service.store.getProject(project.id)).currentRevisionId).toBe(original.id);
    expect((await service.store.getProject(project.id)).openCandidateId).toBeNull();
    expect(await fs.readdir(path.join(service.store.projectPath(project.id), 'audio-work'))).toEqual([]);
  });

  it('rejects stale versions and nonexistent shots before starting local synthesis', async () => {
    const stale = await terminal((await service.generateVoiceover(project.id, randomUUID(), input({expectedRevisionId: randomUUID()}))).jobId);
    expect(stale.status).toBe('failed');
    const unknown = await terminal((await service.generateVoiceover(project.id, randomUUID(), input({shotId: 'unknown'}))).jobId);
    expect(unknown.status).toBe('failed');
    expect(service.voiceover.synthesize).not.toHaveBeenCalled();
    expect((await service.store.getSnapshot(project.id)).revisions).toHaveLength(1);
  });

  it('cancels pending synthesis, clears its candidate and never publishes late audio', async () => {
    let started!: () => void;
    const running = new Promise<void>(resolve => {started = resolve;});
    vi.mocked(service.voiceover.synthesize).mockImplementation(input => new Promise((_resolve, reject) => {
      input.signal.addEventListener('abort', () => reject(new Error('Audio generation cancelled')), {once: true});
      started();
    }));
    const result = await service.generateVoiceover(project.id, randomUUID(), input());
    await running; await service.cancel(result.jobId);
    const job = await terminal(result.jobId);
    expect(job.status).toBe('cancelled');
    expect(service.builder.preview).not.toHaveBeenCalled();
    expect((await service.store.getProject(project.id)).openCandidateId).toBeNull();
    expect((await service.store.getProject(project.id)).currentRevisionId).toBe(original.id);
    expect(await readSourceVoiceovers(service.store.projectPath(project.id), original.sourceId)).toEqual([]);
  });

  it('does not expose audio from an unreferenced source or nonexistent asset', async () => {
    const unreferenced = await materializeSource(service.store.projectPath(project.id), {baseRevisionId: original.id, summary: 'Unpublished source', shots, changedFiles: [], deletedFiles: []}, original.sourceId);
    await expect(service.voiceovers(project.id, unreferenced.sourceId)).rejects.toMatchObject({code: 'NOT_FOUND'});
    await expect(service.voiceoverFile(project.id, original.sourceId, randomUUID())).rejects.toMatchObject({code: 'NOT_FOUND'});
  });

  it('keeps the accepted version when the local runtime is unavailable and never creates a candidate', async () => {
    vi.mocked(service.voiceover.status).mockResolvedValue({available: false, reason: 'Install Chatterbox model first.'});
    const job = await terminal((await service.generateVoiceover(project.id, randomUUID(), input())).jobId);
    expect(job.status).toBe('failed');
    expect(job.error).toContain('Install Chatterbox model first.');
    expect(service.voiceover.synthesize).not.toHaveBeenCalled();
    const snapshot = await service.store.getSnapshot(project.id);
    expect(snapshot.project.currentRevisionId).toBe(original.id);
    expect(snapshot.project.openCandidateId).toBeNull();
    expect(snapshot.candidates).toHaveLength(1);
  });

  it('deduplicates retried requests and blocks a new generation while its candidate is awaiting review', async () => {
    const requestId = randomUUID();
    const first = await service.generateVoiceover(project.id, requestId, input());
    expect((await terminal(first.jobId)).status).toBe('succeeded');
    const retried = await service.generateVoiceover(project.id, requestId, input());
    expect(retried.jobId).toBe(first.jobId);
    expect(service.voiceover.synthesize).toHaveBeenCalledTimes(1);
    const blocked = await terminal((await service.generateVoiceover(project.id, randomUUID(), input())).jobId);
    expect(blocked.status).toBe('failed');
    expect(blocked.error).toContain('Terapkan atau buang kandidat');
    expect(service.voiceover.synthesize).toHaveBeenCalledTimes(1);
  });

  it('rejects audio tampered after candidate validation when applying it', async () => {
    const job = await terminal((await service.generateVoiceover(project.id, randomUUID(), input())).jobId);
    expect(job.status, job.error).toBe('succeeded');
    const candidate = await service.store.getCandidate(project.id, job.candidateId!);
    const [track] = (await service.voiceovers(project.id, candidate.sourceId!)).tracks;
    await fs.writeFile(path.join(service.store.projectPath(project.id), 'source', candidate.sourceId!, 'audio', `${track.assetId}.wav`), 'tampered');
    await expect(service.store.applyCandidate(project.id, candidate.id, original.id)).rejects.toMatchObject({code: 'SOURCE_CHANGED'});
    expect((await service.store.getProject(project.id)).currentRevisionId).toBe(original.id);
    expect((await service.store.getSnapshot(project.id)).revisions).toHaveLength(1);
  });

  it('serves authenticated audio state and WAV bytes only for a referenced source and asset', async () => {
    const api = await httpFixture();
    expect(api.bootstrap.headers.get('content-security-policy')).toContain("media-src 'self' blob:");
    const anonymous = await fetch(api.origin + api.route);
    expect(anonymous.status).toBe(401);
    const initial = await api.request();
    expect(initial.status).toBe(200);
    expect(await initial.json()).toMatchObject({runtime: {available: true}, tracks: []});
    const generated = await terminal((await service.generateVoiceover(project.id, randomUUID(), input())).jobId);
    expect(generated.status, generated.error).toBe('succeeded');
    const candidate = await service.store.getCandidate(project.id, generated.candidateId!);
    const state = await api.request(`?sourceId=${candidate.sourceId}`);
    expect(state.status).toBe(200);
    const {tracks} = await state.json();
    expect(tracks).toHaveLength(1);
    const suffix = `/${tracks[0].assetId}/audio?sourceId=${candidate.sourceId}`;
    expect((await fetch(api.origin + api.route + suffix)).status).toBe(401);
    const audio = await api.request(suffix);
    expect(audio.status).toBe(200);
    expect(audio.headers.get('content-type')).toBe('audio/wav');
    expect(Buffer.from(await audio.arrayBuffer())).toEqual(wav());
    expect((await api.request(`/${randomUUID()}/audio?sourceId=${candidate.sourceId}`)).status).toBe(404);
    expect((await api.request(`/${tracks[0].assetId}/audio?sourceId=${randomUUID()}`)).status).toBe(404);
    expect((await api.request(`/${tracks[0].assetId}/audio`)).status).toBe(400);
  });

  it('validates voice-over POST input before synthesis and dispatches defaults without requiring agent login', async () => {
    const api = await httpFixture();
    const valid = {requestId: randomUUID(), expectedRevisionId: original.id, shotId: 'hook', text};
    for (const malformed of [
      {...valid, text: ''}, {...valid, text: 'x'.repeat(3001)}, {...valid, volume: 2}, {...valid, fitDuration: 'yes'},
      {...valid, shotId: '../hook'}, {...valid, expectedRevisionId: null}, {...valid, requestId: 'bad'}, {...valid, extra: true},
    ]) expect((await api.request('', 'POST', malformed)).status).toBe(400);
    expect(service.voiceover.synthesize).not.toHaveBeenCalled();
    const unknown = await api.request('', 'POST', {...valid, shotId: 'unknown'});
    expect(unknown.status).toBe(202);
    expect((await terminal((await unknown.json()).jobId)).status).toBe('failed');
    const stale = await api.request('', 'POST', {...valid, requestId: randomUUID(), expectedRevisionId: randomUUID()});
    expect(stale.status).toBe(202);
    expect((await terminal((await stale.json()).jobId)).status).toBe('failed');
    expect(service.voiceover.synthesize).not.toHaveBeenCalled();
    const accepted = await api.request('', 'POST', {...valid, requestId: randomUUID()});
    expect(accepted.status).toBe(202);
    const job = await terminal((await accepted.json()).jobId);
    expect(job.status, job.error).toBe('succeeded');
    const candidate = await service.store.getCandidate(project.id, job.candidateId!);
    expect((await service.voiceovers(project.id, candidate.sourceId!)).tracks[0].volume).toBe(1);
    expect(service.codex.runTurn).not.toHaveBeenCalled();
  });
});
