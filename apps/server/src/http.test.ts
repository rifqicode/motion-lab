import {afterEach, beforeEach, describe, expect, it, vi, type MockInstance} from 'vitest';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {briefHash, type Job, type Project, type ProjectSnapshot, type Revision, type SourceProposal} from '@studio/studio-core';
import {createStudioHttp} from './http.js';
import {StudioService} from './service.js';
import {board} from '../../../packages/studio-core/test/storyboard-fixture.js';

// These scenarios fsync real project records; budgets include contention from
// concurrent browser/render verification, while provider/renderer calls stay fake.
const scenarioTimeout = 60_000;
const jobTimeout = 30_000;
vi.setConfig({testTimeout: scenarioTimeout, hookTimeout: 30_000});

const shot = {id: 'cache', durationFrames: 450, intent: 'Explain one cache miss', visualDirection: 'Dark SVG'};
const source = "import React from 'react'; export default function Cache({frame}: {frame:number}) { return <svg width={720} height={1280}><text x={frame + 80} y={200}>Cache miss</text></svg>; }";
const proposal = (baseRevisionId: string | null, text = source): SourceProposal => ({baseRevisionId, summary: 'Explain the cache key', shots: [{...shot}], changedFiles: [{path: 'src/shots/cache.tsx', content: text}], deletedFiles: []});

async function freePorts(): Promise<number[]> {
  const servers = [http.createServer(), http.createServer()];
  try {
    await Promise.all(servers.map(server => new Promise<void>((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve());})));
    return servers.map(server => (server.address() as {port: number}).port);
  } finally { await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve())))); }
}

describe('local studio HTTP integration (fake Codex and renderer)', () => {
  let root: string;
  let editor: string;
  let service: StudioService;
  let app: Awaited<ReturnType<typeof createStudioHttp>> | undefined;
  let origin: string;
  let previewOrigin: string;
  let token: string;
  let turn: MockInstance<StudioService['codex']['runTurn']>;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-http-test-'));
    editor = path.join(root, 'editor');
    await fs.mkdir(editor);
    await fs.writeFile(path.join(editor, 'index.html'), '<!doctype html><html lang="id"><head><!-- STUDIO_BOOTSTRAP --></head><body>Studio test fixture</body></html>');
    await fs.writeFile(path.join(editor, 'app.js'), 'console.log("editor fixture");');
    service = new StudioService({repoRoot: process.cwd(), projectRoot: path.join(root, 'projects')});
    vi.spyOn(service.codex, 'status').mockResolvedValue({connected: true, authenticated: true, authMode: 'chatgpt', accountLabel: 'Fixture login', models: [{id: 'fixture', model: 'fixture-model', displayName: 'Fixture', isDefault: true}], toolsRestricted: true});
    vi.spyOn(service.codex, 'createThread').mockImplementation(async ({role}) => `fixture-${role}-${randomUUID()}`);
    vi.spyOn(service.codex, 'resumeThread').mockImplementation(async threadId => threadId);
    turn = vi.spyOn(service.codex, 'runTurn');
    turn.mockImplementation(async () => { throw new Error('Unexpected Codex call in HTTP fixture'); });
    vi.spyOn(service.builder, 'status').mockResolvedValue({available: true, image: 'fixture-image'});
    vi.spyOn(service.builder, 'build').mockRejectedValue(new Error('Production build must not run during editing'));
    vi.spyOn(service.builder, 'preview').mockImplementation(async input => {
      const manifest = JSON.parse(await fs.readFile(path.join(input.projectDir, 'source', input.sourceId, 'manifest.json'), 'utf8'));
      const build = {id: input.buildId, sourceId: input.sourceId, status: 'ready' as const, shots: input.shots,
        durationFrames: input.shots.reduce((total, item) => total + item.durationFrames, 0), fps: 30 as const, width: 720 as const, height: 1280 as const,
        sourceHash: manifest.sourceHash, dependencyHash: 'fixture-dependencies', runtimeHash: 'fixture-runtime',
        previewDir: path.join(input.projectDir, 'builds', input.buildId, 'preview'), createdAt: new Date().toISOString(), smokeFrames: [0, 449], image: 'fixture-image', isolationChecks: {},
      };
      const projectId = path.basename(input.projectDir);
      await service.store.writeJson(projectId, `builds/${input.buildId}/build.json`, build);
      await fs.mkdir(build.previewDir, {recursive: true});
      await fs.writeFile(path.join(build.previewDir, 'index.html'), '<!doctype html><p>Fixture preview only</p>');
      await fs.writeFile(path.join(build.previewDir, 'preview.js'), '/* Fixture bundle only */');
      return build;
    });
    vi.spyOn(service.builder, 'screenshot').mockImplementation(async input => {
      await fs.mkdir(path.dirname(input.outputPath), {recursive: true});
      await fs.writeFile(input.outputPath, Buffer.from('screenshot fixture; not an actual render'));
    });
    await service.start();
    const [port, previewPort] = await freePorts();
    origin = `http://127.0.0.1:${port}`;
    previewOrigin = `http://127.0.0.1:${previewPort}`;
    app = await createStudioHttp({service, editorDir: editor, port, previewPort});
    const bootstrap = await (await fetch(origin)).text();
    token = bootstrap.match(/name="studio-session" content="([a-f0-9]+)"/)?.[1] ?? '';
    expect(token).toHaveLength(64);
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    await service?.close();
    vi.restoreAllMocks();
    if (root) await fs.rm(root, {recursive: true, force: true});
  });

  function request(route: string, method = 'GET', input?: unknown, extra: Record<string, string> = {}) {
    return fetch(origin + route, {method, headers: {'x-studio-session': token, origin, ...(input === undefined ? {} : {'content-type': 'application/json'}), ...extra},
      ...(input === undefined ? {} : {body: JSON.stringify(input)})});
  }

  async function createProject(): Promise<Project> {
    const response = await request('/api/projects', 'POST', {name: 'HTTP cache fixture', brief: 'Explain why a cache key moves after adding a server.'});
    expect(response.status).toBe(201);
    return response.json() as Promise<Project>;
  }

  async function approve(project: Project): Promise<void> {
    const response = await request(`/api/projects/${project.id}/storyboard/approve`, 'POST', {briefHash: briefHash(project.brief, project.style)});
    expect(response.status).toBe(200);
  }

  async function waitForJob(projectId: string, jobId: string): Promise<Job> {
    const result = await vi.waitFor(async () => {
      const job = await service.store.getJob(projectId, jobId);
      if (!['succeeded', 'failed', 'cancelled'].includes(job.status)) throw new Error(`Job still ${job.status}`);
      service.assertIdle(projectId);
      return job;
    }, {timeout: jobTimeout, interval: 25});
    return result;
  }

  async function generate(project: Project, base: string | null): Promise<string> {
    turn.mockResolvedValueOnce({threadId: 'fixture-implementor', turnId: randomUUID(), status: 'completed', text: JSON.stringify(proposal(base))});
    const response = await request(`/api/projects/${project.id}/generations`, 'POST', {requestId: randomUUID(), expectedRevisionId: base});
    expect(response.status).toBe(202);
    const {jobId} = await response.json();
    const job = await waitForJob(project.id, jobId);
    expect(job, job.error).toMatchObject({status: 'succeeded'});
    expect(job.candidateId).toBeTruthy();
    return job.candidateId!;
  }

  it('protects API and event streams with a session; denies preview/null/cross-site origins and spoofed hosts', async () => {
    const project = await createProject();
    expect((await fetch(origin + '/health')).status).toBe(200);
    for (const route of ['/api/projects', '/api/status', `/api/projects/${project.id}/events`]) {
      const missing = await fetch(origin + route);
      expect(missing.status).toBe(401);
      expect((await missing.json()).code).toBe('UNAUTHORIZED');
    }
    expect((await request('/api/projects', 'GET', undefined, {'x-studio-session': 'incorrect'})).status).toBe(401);
    for (const invalidOrigin of [previewOrigin, 'null', 'https://other.invalid']) {
      const response = await request('/api/projects', 'GET', undefined, {origin: invalidOrigin});
      expect(response.status).toBe(403);
      expect((await response.json()).code).toBe('INVALID_ORIGIN');
    }
    expect((await request('/api/projects', 'GET', undefined, {'sec-fetch-site': 'cross-site'})).status).toBe(403);
    const invalidHost = await new Promise<number | undefined>((resolve, reject) => {
      const call = http.get(origin + '/api/projects', {headers: {host: 'attacker.invalid', 'x-studio-session': token}}, response => {
        response.resume(); response.once('end', () => resolve(response.statusCode));
      });
      call.once('error', reject);
    });
    expect(invalidHost).toBe(403);
    const protectedBootstrap = await fetch(origin, {headers: {origin: previewOrigin}});
    expect(protectedBootstrap.status).toBe(403);
    expect(await protectedBootstrap.text()).not.toContain('studio-session');
    expect((await request('/api/projects')).status).toBe(200);
  });

  it('rejects stale brief approval, invalid input and unsupported body types without changing saved data', async () => {
    const project = await createProject();
    const changed = 'Explain consistent hashing using one key.';
    expect((await request(`/api/projects/${project.id}/brief`, 'PUT', {brief: changed})).status).toBe(200);
    const stale = await request(`/api/projects/${project.id}/storyboard/approve`, 'POST', {briefHash: briefHash(project.brief)});
    expect(stale.status).toBe(409);
    expect((await stale.json()).code).toBe('STALE_BRIEF');
    expect((await service.store.getProject(project.id)).approvedBriefHash).toBeNull();
    const approved = await request(`/api/projects/${project.id}/storyboard/approve`, 'POST', {briefHash: briefHash(changed)});
    expect(approved.status).toBe(200);
    expect((await approved.json()).approvedBriefHash).toBe(briefHash(changed));
    expect((await request('/api/projects', 'POST', {name: 'Valid', arbitraryHostPath: '/tmp/escape'})).status).toBe(400);
    const textBody = await fetch(origin + '/api/projects', {method: 'POST', headers: {'x-studio-session': token, origin, 'content-type': 'text/plain'}, body: '{"name":"Invalid"}'});
    expect(textBody.status).toBe(415);
    const malformed = await fetch(origin + '/api/projects', {method: 'POST', headers: {'x-studio-session': token, origin, 'content-type': 'application/json'}, body: '{"name":'});
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).code).toBe('INVALID_JSON');
    expect(await service.store.listProjects()).toHaveLength(1);
  });

  it('persists validated style and rejects approval of an unchanged story with a stale style fingerprint', async () => {
    const project = await createProject();
    await approve(project);
    for (const style of [{unknown: 'unsupported'}, {mood: 42}, {referenceNotes: 'x'.repeat(8001)}]) {
      expect((await request(`/api/projects/${project.id}/style`, 'PUT', {style})).status).toBe(400);
    }
    const saved = await request(`/api/projects/${project.id}/style`, 'PUT', {style: {mood: '  Bright editorial  ', colorPalette: '#faf7ef, #241a48'}});
    expect(saved.status).toBe(200);
    const updated = await saved.json() as Project;
    expect(updated.style).toMatchObject({mood: 'Bright editorial', colorPalette: '#faf7ef, #241a48', avoid: ''});
    expect(updated.approvedBriefHash).toBeNull();
    expect((await request(`/api/projects/${project.id}/storyboard/approve`, 'POST', {briefHash: briefHash(project.brief)})).status).toBe(409);
    await approve(updated);
    const noop = await request(`/api/projects/${project.id}/style`, 'PUT', {style: updated.style});
    expect((await noop.json()).approvedBriefHash).toBe(briefHash(updated.brief, updated.style));
    const snapshot = await (await request(`/api/projects/${project.id}`)).json() as ProjectSnapshot;
    expect(snapshot.project.style).toEqual(updated.style);
  });

  it('sends current style to chat, generation, bounded repair and image-comment revision; protects a ready candidate', async () => {
    let project = await createProject();
    const style = {mood: 'Warm editorial', colorPalette: 'Ivory and purple', typography: 'Large serif headings', pacing: 'Calm', transitions: 'Sliding panels', visualDirection: 'Editorial typography, no diagrams', referenceNotes: 'https://reference.invalid/example: use only the described pacing', avoid: 'Dark navy and cache diagrams'};
    project = await (await request(`/api/projects/${project.id}/style`, 'PUT', {style})).json() as Project;
    turn.mockResolvedValueOnce({threadId: 'fixture-brainstorm', turnId: randomUUID(), status: 'completed', text: 'Use the warm editorial direction.'});
    const chat = await (await request(`/api/projects/${project.id}/messages`, 'POST', {requestId: randomUUID(), text: 'Suggest a hook.'})).json();
    expect((await waitForJob(project.id, chat.jobId)).status).toBe('succeeded');
    await approve(project);
    const invalid = proposal(null); invalid.shots[0].durationFrames = 449;
    turn.mockResolvedValueOnce({threadId: 'fixture-implementor', turnId: randomUUID(), status: 'completed', text: JSON.stringify(invalid)});
    turn.mockResolvedValueOnce({threadId: 'fixture-implementor', turnId: randomUUID(), status: 'completed', text: JSON.stringify(proposal(null))});
    const gen = await (await request(`/api/projects/${project.id}/generations`, 'POST', {requestId: randomUUID(), expectedRevisionId: null})).json();
    const generated = await waitForJob(project.id, gen.jobId);
    expect(generated.status, generated.error).toBe('succeeded');
    const blocked = await request(`/api/projects/${project.id}/style`, 'PUT', {style: {...style, mood: 'Different direction'}});
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).code).toBe('CANDIDATE_BUSY');
    const applied = await (await request(`/api/projects/${project.id}/candidates/${generated.candidateId}/apply`, 'POST', {expectedRevisionId: null})).json() as Revision;
    const comment = await service.store.addComment(project.id, {revisionId: applied.id, shotId: shot.id, localFrame: 72, fps: 30}, 'Make the heading bigger.');
    turn.mockResolvedValueOnce({threadId: 'fixture-implementor', turnId: randomUUID(), status: 'completed', text: JSON.stringify(proposal(applied.id, source.replace('Cache miss', 'Editorial revised')))});
    const rev = await (await request(`/api/projects/${project.id}/comments/${comment.id}/revisions`, 'POST', {requestId: randomUUID(), expectedRevisionId: applied.id})).json();
    const revised = await waitForJob(project.id, rev.jobId);
    expect(revised.status, revised.error).toBe('succeeded');
    expect(turn).toHaveBeenCalledTimes(4);
    for (const [call] of turn.mock.calls) {
      expect(call.prompt).toContain(JSON.stringify(style));
      expect(call.prompt).toContain('do not fetch links or claim to have watched them');
      expect(call.prompt).not.toContain('near-black navy background');
    }
    expect(turn.mock.calls.at(-1)![0].images).toHaveLength(1);
    expect(service.codex.createThread).toHaveBeenCalledWith(expect.objectContaining({role: 'implementor', developerInstructions: expect.stringContaining('Do not assume a dark navy background')}));
  }, scenarioTimeout);

  it('does not call Codex or renderer when generation lacks approved current brief', async () => {
    const project = await createProject();
    const response = await request(`/api/projects/${project.id}/generations`, 'POST', {requestId: randomUUID(), expectedRevisionId: null});
    expect(response.status).toBe(202);
    const {jobId} = await response.json();
    const job = await waitForJob(project.id, jobId);
    expect(job).toMatchObject({status: 'failed'});
    expect(job.error).toContain('setujui brief');
    expect(turn).not.toHaveBeenCalled();
    expect(service.builder.build).not.toHaveBeenCalled();
    expect((await service.store.getSnapshot(project.id)).candidates).toEqual([]);
  });

  it('keeps working head stable until apply, rejects stale CAS, preserves frame anchors on restore, and discards candidates', async () => {
    const project = await createProject();
    await approve(project);
    const firstCandidateId = await generate(project, null);
    expect((await service.store.getProject(project.id)).currentRevisionId).toBeNull();
    const detail = await request(`/api/projects/${project.id}/candidates/${firstCandidateId}`);
    expect(detail.status).toBe(200);
    const firstDetail = await detail.json();
    expect(firstDetail.candidate.status).toBe('ready');
    expect(firstDetail.before).toEqual([]);
    expect(firstDetail.after[0].content).toContain('Cache miss');
    const firstApplied = await request(`/api/projects/${project.id}/candidates/${firstCandidateId}/apply`, 'POST', {expectedRevisionId: null});
    expect(firstApplied.status).toBe(200);
    const first = await firstApplied.json() as Revision;
    const staleApply = await request(`/api/projects/${project.id}/candidates/${firstCandidateId}/apply`, 'POST', {expectedRevisionId: null});
    expect(staleApply.status).toBe(409);
    expect((await staleApply.json()).code).toBe('STALE_REVISION');
    const commented = await request(`/api/projects/${project.id}/comments`, 'POST', {anchor: {revisionId: first.id, shotId: shot.id, localFrame: 72, fps: 30}, body: 'Reveal the key later.'});
    expect(commented.status).toBe(201);
    const comment = await commented.json();
    const invalidFrame = await request(`/api/projects/${project.id}/comments`, 'POST', {anchor: {...comment.anchor, localFrame: 450}, body: 'Outside duration'});
    expect(invalidFrame.status).toBe(400);
    const nextCandidateId = await generate(project, first.id);
    const secondApplied = await request(`/api/projects/${project.id}/candidates/${nextCandidateId}/apply`, 'POST', {expectedRevisionId: first.id});
    expect(secondApplied.status).toBe(200);
    const second = await secondApplied.json() as Revision;
    const restoredResponse = await request(`/api/projects/${project.id}/revisions/${first.id}/restore`, 'POST', {expectedRevisionId: second.id});
    expect(restoredResponse.status).toBe(200);
    const restored = await restoredResponse.json() as Revision;
    expect(restored.id).not.toBe(first.id);
    expect(restored.sourceId).toBe(first.sourceId);
    expect(restored.buildId).toBe(first.buildId);
    const snapshot = await (await request(`/api/projects/${project.id}`)).json() as ProjectSnapshot;
    expect(snapshot.revisions).toHaveLength(3);
    expect(snapshot.comments[0].anchor).toEqual(comment.anchor);
    expect(snapshot.comments[0].status).toBe('open');
    const discardId = await generate(project, restored.id);
    expect((await request(`/api/projects/${project.id}/candidates/${discardId}/discard`, 'POST', {expectedRevisionId: restored.id})).status).toBe(200);
    expect((await service.store.getProject(project.id)).currentRevisionId).toBe(restored.id);
    expect((await service.store.getProject(project.id)).openCandidateId).toBeNull();
  }, scenarioTimeout);

  it('hands the exact frame screenshot and stable original shot to a comment-driven code revision', async () => {
    const project = await createProject();
    await approve(project);
    const firstId = await generate(project, null);
    const applied = await (await request(`/api/projects/${project.id}/candidates/${firstId}/apply`, 'POST', {expectedRevisionId: null})).json() as Revision;
    const comment = await service.store.addComment(project.id, {revisionId: applied.id, shotId: shot.id, localFrame: 34, fps: 30}, 'Move the key after the DNS explanation.');
    const revisedSource = source.replace('Cache miss', 'Cache delayed');
    turn.mockResolvedValueOnce({threadId: 'fixture-implementor', turnId: randomUUID(), status: 'completed', text: JSON.stringify(proposal(applied.id, revisedSource))});
    const response = await request(`/api/projects/${project.id}/comments/${comment.id}/revisions`, 'POST', {requestId: randomUUID(), expectedRevisionId: applied.id});
    expect(response.status).toBe(202);
    const {jobId} = await response.json();
    const job = await waitForJob(project.id, jobId);
    expect(job, job.error).toMatchObject({status: 'succeeded', kind: 'revise'});
    expect(service.builder.screenshot).toHaveBeenCalledWith(expect.objectContaining({buildId: applied.buildId, frame: 34}));
    expect(service.builder.preview).toHaveBeenLastCalledWith(expect.objectContaining({frames: [34]}));
    const call = turn.mock.calls.at(-1)![0];
    expect(call.images).toEqual([path.join(service.store.projectPath(project.id), 'comments', `${comment.id}.png`)]);
    expect(call.prompt).toContain('"localFrame":34');
    expect(call.prompt).toContain('Move the key after the DNS explanation.');
    const detail = await (await request(`/api/projects/${project.id}/candidates/${job.candidateId}`)).json();
    expect(detail.after[0].content).toContain('Cache delayed');
    expect(detail.before[0].content).toContain('Cache miss');
    expect((await service.store.getComment(project.id, comment.id)).status).toBe('open');
  }, scenarioTimeout);

  it('routes explicit Director revision mode with a required accepted-revision identity', async () => {
    const project = await createProject();
    const revisionId = randomUUID();
    const requestId = randomUUID();
    const dispatch = vi.spyOn(service, 'reviseFromDirector').mockResolvedValue({jobId: randomUUID()});
    const response = await request(`/api/projects/${project.id}/messages`, 'POST', {requestId, text: 'Pelankan seluruh video.', mode: 'revise', expectedRevisionId: revisionId});
    expect(response.status).toBe(202);
    expect(dispatch).toHaveBeenCalledWith(project.id, requestId, 'Pelankan seluruh video.', revisionId, undefined);
    const invalid = await request(`/api/projects/${project.id}/messages`, 'POST', {requestId: randomUUID(), text: 'Pelankan', mode: 'revise'});
    expect(invalid.status).toBe(400);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(turn).not.toHaveBeenCalled();
  });

  it('deduplicates a retried chat command and resumes the correct project thread without duplicating messages', async () => {
    const project = await createProject();
    turn.mockResolvedValueOnce({threadId: 'fixture-brainstorm', turnId: randomUUID(), status: 'completed', text: 'Start with one key and two cache nodes.'});
    const requestId = randomUUID();
    const first = await request(`/api/projects/${project.id}/messages`, 'POST', {requestId, text: 'How should the scene begin?'});
    const result = await first.json();
    expect(first.status).toBe(202);
    expect((await waitForJob(project.id, result.jobId)).status).toBe('succeeded');
    const retry = await request(`/api/projects/${project.id}/messages`, 'POST', {requestId, text: 'How should the scene begin?'});
    expect(await retry.json()).toEqual(result);
    expect(turn).toHaveBeenCalledTimes(1);
    expect((await service.store.getSnapshot(project.id)).messages).toHaveLength(2);
    const thread = await service.store.getThread(project.id, 'brainstorm-style-v1');
    expect(thread).toBeTruthy();
    turn.mockResolvedValueOnce({threadId: thread!, turnId: randomUUID(), status: 'completed', text: 'Then add a third node.'});
    const next = await request(`/api/projects/${project.id}/messages`, 'POST', {requestId: randomUUID(), text: 'What comes next?'});
    const nextJob = await next.json();
    expect((await waitForJob(project.id, nextJob.jobId)).status).toBe('succeeded');
    expect(service.codex.resumeThread).toHaveBeenCalledWith(thread);
    expect((await service.store.getSnapshot(project.id)).messages).toHaveLength(4);
  });

  it('keeps shot discussions in the same Director thread, forwards local detail and restores global scope without changing the board', async () => {
    const project = await createProject();
    const saved = await service.store.saveStoryboard(project.id, board, null, briefHash(project.brief, project.style));
    turn.mockImplementation(async options => ({threadId: options.threadId, turnId: randomUUID(), status: 'completed', text: 'Mari bahas arah shot.'}));
    const send = async (text: string, shotContext?: unknown) => {
      const response = await request(`/api/projects/${project.id}/messages`, 'POST', {requestId: randomUUID(), text, ...(shotContext ? {shotContext} : {})});
      expect(response.status).toBe(202);
      expect((await waitForJob(project.id, (await response.json()).jobId)).status).toBe('succeeded');
    };
    await send('Bahas keseluruhan video.');
    const thread = await service.store.getThread(project.id, 'brainstorm-style-v1');
    const localShot = {...board.shots[1], motionInstructions: 'Gerakkan key perlahan sesuai draft lokal.'};
    await send('Bagaimana animasinya?', {shot: localShot, position: 2, draft: true});
    expect(turn.mock.calls[1][0].threadId).toBe(thread);
    expect(turn.mock.calls[1][0].prompt).toContain('ONLY the selected shot');
    expect(turn.mock.calls[1][0].prompt).toContain(localShot.motionInstructions);
    expect(turn.mock.calls[1][0].prompt).toContain(JSON.stringify(board.designSystem));
    await send('Sekarang bahas hook.', {shot: board.shots[0], position: 1, draft: false});
    expect(turn.mock.calls[2][0].threadId).toBe(thread);
    expect(turn.mock.calls[2][0].prompt).toContain('"position":1');
    await send('Kembali ke keseluruhan video.');
    expect(turn.mock.calls[3][0].threadId).toBe(thread);
    expect(turn.mock.calls[3][0].prompt).toContain('the whole project');
    expect(turn.mock.calls[3][0].prompt).not.toContain('Selected shot context:');
    expect(await service.store.getStoryboard(project.id)).toEqual(saved);
    const snapshot = await service.store.getSnapshot(project.id);
    expect(snapshot.messages).toHaveLength(8);
    expect(snapshot.messages[2].content).toContain('[Shot 02 · Explain · explain]');
    expect(snapshot.messages[2].content).toContain('Bagaimana animasinya?');
  });

  it('rejects invalid shot discussion context before scheduling an AI turn', async () => {
    const project = await createProject();
    const response = await request(`/api/projects/${project.id}/messages`, 'POST', {requestId: randomUUID(), text: 'Bahas ini', shotContext: {position: 0, draft: false, shot: {...board.shots[0], durationFrames: -1}}});
    expect(response.status).toBe(400);
    expect(turn).not.toHaveBeenCalled();
    expect((await service.store.getSnapshot(project.id)).messages).toHaveLength(0);
  });

  it('keeps legacy thread bindings and seeds the new style-aware conversation from saved project messages', async () => {
    const project = await createProject();
    await service.store.setThread(project.id, 'brainstorm', 'legacy-dark-thread');
    await service.store.saveMessage(project.id, {id: randomUUID(), role: 'user', content: 'Remember the four-line brief and CTA.', createdAt: new Date().toISOString()});
    await service.store.saveMessage(project.id, {id: randomUUID(), role: 'assistant', content: 'We will keep the four-line message.', createdAt: new Date().toISOString()});
    turn.mockResolvedValueOnce({threadId: 'new-style-thread', turnId: randomUUID(), status: 'completed', text: 'We can use editorial layouts.'});
    const response = await request(`/api/projects/${project.id}/messages`, 'POST', {requestId: randomUUID(), text: 'Use a brighter direction.'});
    const {jobId} = await response.json();
    expect((await waitForJob(project.id, jobId)).status).toBe('succeeded');
    expect(await service.store.getThread(project.id, 'brainstorm')).toBe('legacy-dark-thread');
    expect(await service.store.getThread(project.id, 'brainstorm-style-v1')).not.toBe('legacy-dark-thread');
    expect(service.codex.resumeThread).not.toHaveBeenCalledWith('legacy-dark-thread');
    expect(turn.mock.calls[0][0].prompt).toContain('Remember the four-line brief and CTA.');
    expect((await service.store.getSnapshot(project.id)).messages).toHaveLength(4);
  });

  it('repairs an out-of-range generated shot as a proposal error rather than treating it as an account usage limit', async () => {
    const project = await createProject();
    await approve(project);
    const invalid = proposal(null);
    invalid.shots[0].durationFrames = 449;
    turn.mockResolvedValueOnce({threadId: 'fixture-implementor', turnId: randomUUID(), status: 'completed', text: JSON.stringify(invalid)});
    turn.mockResolvedValueOnce({threadId: 'fixture-implementor', turnId: randomUUID(), status: 'completed', text: JSON.stringify(proposal(null))});
    const response = await request(`/api/projects/${project.id}/generations`, 'POST', {requestId: randomUUID(), expectedRevisionId: null});
    const {jobId} = await response.json();
    const job = await waitForJob(project.id, jobId);
    expect(job, job.error).toMatchObject({status: 'succeeded'});
    expect(turn).toHaveBeenCalledTimes(2);
    const snapshot = await service.store.getSnapshot(project.id);
    expect(snapshot.candidates.filter(candidate => candidate.status === 'failed')).toHaveLength(1);
    expect(snapshot.candidates.filter(candidate => candidate.status === 'ready')).toHaveLength(1);
  }, scenarioTimeout);

  it('stops after two code repairs and keeps the last working revision when every proposed TSX file is invalid', async () => {
    const project = await createProject();
    await approve(project);
    const firstId = await generate(project, null);
    const first = await (await request(`/api/projects/${project.id}/candidates/${firstId}/apply`, 'POST', {expectedRevisionId: null})).json() as Revision;
    const invalid = proposal(first.id, 'export default function Broken( { return <div>');
    turn.mockResolvedValue({threadId: 'fixture-implementor', turnId: randomUUID(), status: 'completed', text: JSON.stringify(invalid)});
    const response = await request(`/api/projects/${project.id}/generations`, 'POST', {requestId: randomUUID(), expectedRevisionId: first.id});
    const {jobId} = await response.json();
    const job = await waitForJob(project.id, jobId);
    expect(job.status).toBe('failed');
    expect(job.error).toContain('dua perbaikan');
    expect(turn).toHaveBeenCalledTimes(4);
    expect(service.builder.preview).toHaveBeenCalledTimes(1);
    expect(service.builder.build).not.toHaveBeenCalled();
    const snapshot = await service.store.getSnapshot(project.id);
    expect(snapshot.project.currentRevisionId).toBe(first.id);
    expect(snapshot.project.openCandidateId).toBeNull();
    expect(snapshot.candidates.filter(candidate => candidate.status === 'failed')).toHaveLength(3);
  }, scenarioTimeout);

  it('cancels a pending chat turn without persisting a late assistant reply and allows the project to continue', async () => {
    const project = await createProject();
    turn.mockImplementationOnce(async ({signal}) => new Promise(resolve => {
      const cancelled = () => resolve({threadId: 'fixture-brainstorm', turnId: 'cancelled-turn', status: 'interrupted', text: ''});
      if (signal?.aborted) cancelled();
      else signal?.addEventListener('abort', cancelled, {once: true});
    }));
    const response = await request(`/api/projects/${project.id}/messages`, 'POST', {requestId: randomUUID(), text: 'Brainstorm this scene.'});
    const {jobId} = await response.json();
    await vi.waitFor(() => expect(turn).toHaveBeenCalledTimes(1), {timeout: jobTimeout, interval: 25});
    const stopped = await request(`/api/jobs/${jobId}/cancel`, 'POST');
    expect(stopped.status).toBe(200);
    const job = await waitForJob(project.id, jobId);
    expect(job.status).toBe('cancelled');
    const snapshot = await service.store.getSnapshot(project.id);
    expect(snapshot.messages).toHaveLength(1);
    expect(snapshot.messages[0].role).toBe('user');
    turn.mockResolvedValueOnce({threadId: 'fixture-brainstorm', turnId: 'next-turn', status: 'completed', text: 'Use one moving key.'});
    const next = await request(`/api/projects/${project.id}/messages`, 'POST', {requestId: randomUUID(), text: 'Continue with one key.'});
    const nextJob = await next.json();
    expect((await waitForJob(project.id, nextJob.jobId)).status).toBe('succeeded');
  });

  it('serves only ready preview files and refuses encoded traversal or symlinks outside static roots', async () => {
    const project = await createProject();
    await approve(project);
    const candidateId = await generate(project, null);
    const candidate = await service.store.getCandidate(project.id, candidateId);
    const outside = path.join(root, 'outside.txt');
    await fs.writeFile(outside, 'PRIVATE-OUTSIDE-FIXTURE');
    await fs.symlink(outside, path.join(editor, 'escape.txt'));
    const editorEscape = await fetch(origin + '/escape.txt');
    expect(editorEscape.status).toBe(403);
    expect(await editorEscape.text()).not.toContain('PRIVATE-OUTSIDE-FIXTURE');
    const encodedEditor = await fetch(origin + '/%2e%2e%2foutside.txt');
    expect(encodedEditor.status).toBe(403);
    const previewPrefix = `${previewOrigin}/p/${project.id}/${candidate.buildId}`;
    const visible = await fetch(previewPrefix + '/index.html');
    expect(visible.status).toBe(200);
    expect(visible.headers.get('content-security-policy')).toContain('sandbox allow-scripts');
    expect(await visible.text()).not.toContain(token);
    const previewDir = path.join(service.store.projectPath(project.id), 'builds', candidate.buildId!, 'preview');
    await fs.symlink(outside, path.join(previewDir, 'escape.txt'));
    for (const suffix of ['/escape.txt', '/%2e%2e%2fbuild.json', '/%2e%2e%2f%2e%2e%2fproject.json']) {
      const escaped = await fetch(previewPrefix + suffix);
      expect([400, 403, 404]).toContain(escaped.status);
      expect(await escaped.text()).not.toContain('PRIVATE-OUTSIDE-FIXTURE');
    }
    await service.store.writeJson(project.id, `builds/${candidate.buildId}/build.json`, {status: 'building', sourceId: candidate.sourceId});
    expect((await fetch(previewPrefix + '/index.html')).status).toBe(409);
    expect((await fetch(previewOrigin + '/api/projects')).status).toBe(404);
  });

  it('supports selecting and updating agent engine for a project', async () => {
    const createdRes = await request('/api/projects', 'POST', {name: 'Antigravity Project', agentProvider: 'antigravity'});
    expect(createdRes.status).toBe(201);
    const created = await createdRes.json();
    expect(created.agentProvider).toBe('antigravity');

    const updateRes = await request(`/api/projects/${created.id}/agent`, 'PUT', {provider: 'codex'});
    expect(updateRes.status).toBe(200);
    const updated = await updateRes.json();
    expect(updated.agentProvider).toBe('codex');

    const snapshotRes = await request(`/api/projects/${created.id}`);
    expect(snapshotRes.status).toBe(200);
    const snapshot = await snapshotRes.json();
    expect(snapshot.project.agentProvider).toBe('codex');
  });

  it('creates an editable Director storyboard without invoking the production builder, then approves its exact fingerprint', async () => {
    const project = await createProject();
    turn.mockResolvedValueOnce({threadId: 'fixture-director', turnId: randomUUID(), status: 'completed', text: JSON.stringify(board)});
    const response = await request(`/api/projects/${project.id}/director`, 'POST', {requestId: randomUUID(), expectedHash: null});
    expect(response.status).toBe(202);
    const {jobId} = await response.json();
    expect((await waitForJob(project.id, jobId)).status).toBe('succeeded');
    expect(service.builder.build).not.toHaveBeenCalled();
    const state = await (await request(`/api/projects/${project.id}/storyboard`)).json();
    expect(state.draft).toEqual(board);
    expect(state.approvedHash).toBeNull();
    expect(state.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(turn.mock.calls[0][0]).toHaveProperty('outputSchema');

    const rejected = await request(`/api/projects/${project.id}/generations`, 'POST', {requestId: randomUUID(), expectedRevisionId: null, approvedStoryboardHash: state.hash});
    expect((await waitForJob(project.id, (await rejected.json()).jobId)).status).toBe('failed');
    expect(turn).toHaveBeenCalledTimes(1);
    const approved = await request(`/api/projects/${project.id}/storyboard/approve`, 'POST', {storyboardHash: state.hash});
    expect(approved.status).toBe(200);
    expect((await approved.json()).approvedHash).toBe(state.hash);

    const changed = await request(`/api/projects/${project.id}/storyboard`, 'PUT', {storyboard: {...board, hook: 'An edited hook'}, expectedHash: state.hash});
    expect(changed.status).toBe(200);
    expect((await changed.json()).approvedHash).toBeNull();
    expect((await request(`/api/projects/${project.id}/storyboard/approve`, 'POST', {storyboardHash: state.hash})).status).toBe(409);
    expect((await request(`/api/projects/${project.id}/storyboard`, 'PUT', {storyboard: board, expectedHash: state.hash})).status).toBe(409);
    expect((await service.store.getSnapshot(project.id)).messages).toEqual([]);
  });

  it('repairs invalid Director JSON, deduplicates the command and preserves stable shot IDs on reorder', async () => {
    const project = await createProject();
    turn.mockResolvedValueOnce({threadId: 'fixture-director', turnId: randomUUID(), status: 'completed', text: '{invalid'});
    turn.mockResolvedValueOnce({threadId: 'fixture-director', turnId: randomUUID(), status: 'completed', text: JSON.stringify(board)});
    const requestId = randomUUID();
    const first = await (await request(`/api/projects/${project.id}/director`, 'POST', {requestId, expectedHash: null})).json();
    expect((await waitForJob(project.id, first.jobId)).status).toBe('succeeded');
    expect(turn).toHaveBeenCalledTimes(2);
    const retry = await (await request(`/api/projects/${project.id}/director`, 'POST', {requestId, expectedHash: null})).json();
    expect(retry).toEqual(first);
    expect(turn).toHaveBeenCalledTimes(2);
    const state = await service.store.getStoryboard(project.id);
    const reordered = {...board, shots: [...board.shots].reverse()};
    turn.mockResolvedValueOnce({threadId: 'fixture-director', turnId: randomUUID(), status: 'completed', text: JSON.stringify(reordered)});
    const second = await (await request(`/api/projects/${project.id}/director`, 'POST', {requestId: randomUUID(), expectedHash: state.hash})).json();
    expect((await waitForJob(project.id, second.jobId)).status).toBe('succeeded');
    expect((await service.store.getStoryboard(project.id)).draft?.shots.map(shot => shot.id)).toEqual(['explain', 'hook']);
    const stale = await (await request(`/api/projects/${project.id}/director`, 'POST', {requestId: randomUUID(), expectedHash: state.hash})).json();
    expect((await waitForJob(project.id, stale.jobId)).status).toBe('failed');
    expect(turn).toHaveBeenCalledTimes(3);
  });
});
