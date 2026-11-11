import path from 'node:path';
import fs from 'node:fs/promises';
import ts from 'typescript';
import {createId, briefHash, sha256, serializeStoryboard, StudioError, SourceProposalSchema, StoryboardSchema, ShotDiscussionContextSchema, DirectorRevisionArtifactSchema, storyboardShots, shotGlobalFrame, type DirectorRevisionArtifact, type Revision, type ShotDiscussionContext, type Candidate, type Job, type SourceProposal, type AgentProvider, type Storyboard, type Project, type ShotSpec} from '@studio/studio-core';
import {StudioStore} from '@studio/storage';
import {CodexRuntime} from '@studio/codex-runtime';
import {AntigravityRuntime} from '@studio/antigravity-runtime';
import {StudioBuilder, materializeSource, readSourceFiles, readSourceVoiceovers, validateSourceFiles} from '@studio/codegen';
import {LocalVoiceoverRuntime} from './voiceover-runtime.js';
import {StudioEvents} from './events.js';
import {BRAINSTORM_INSTRUCTIONS, DEFAULT_BRIEF, DIRECTOR_INSTRUCTIONS, DIRECTOR_OUTPUT_SCHEMA, IMPLEMENTATION_INSTRUCTIONS, SHOT_IMPLEMENTATION_INSTRUCTIONS, SOURCE_OUTPUT_SCHEMA, creativeContext} from './prompts.js';
import {ShotScheduler, type ShotTask} from './shot-scheduler.js';
import {recordPreviewQa, reviewPreviewQa} from './visual-qa.js';
import {DIRECTOR_REVISION_OUTPUT_SCHEMA, SHOT_PATCH_OUTPUT_SCHEMA, PATCH_INSTRUCTIONS, applyRevisionPatch, revisionStoryboard} from './director-revision.js';

export interface GenerationRun {
  candidateId: string;
  jobId: string;
  storyboardHash: string;
  baseRevisionId: string | null;
  sourceId: string;
  buildId: string;
  shots: ShotTask[];
  createdAt: string;
  updatedAt: string;
}

interface ShotOutput {proposal: SourceProposal; threadId: string; prompt: string; attempt: number}

const now = () => new Date().toISOString();
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Unexpected studio error.').slice(0, 12_000);
const isAbort = (error: unknown, signal: AbortSignal) => signal.aborted || (error instanceof Error && /cancelled|aborted|interrupted/i.test(error.message));
const cannotRepairSource = (error: unknown): boolean => {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  return code.startsWith('CODEX_') || ['LOGIN_REQUIRED', 'TOOLS_UNRESTRICTED', 'MODEL_UNAVAILABLE', 'RUNTIME_UNAVAILABLE', 'BUILD_TIMEOUT', 'BROWSER_START_TIMEOUT', 'PROGRESS_FAILED'].includes(code)
    || /\b(rate limit|usage limit|quota|login required|not logged in|authentication failed|docker daemon|permission denied|runtime unavailable)\b/i.test(errorMessage(error));
};
const buildStageMessages: Record<string, string> = {
  typecheck: 'Memeriksa tipe TypeScript',
  'browser-build': 'Membangun preview',
  'render-build': 'Membangun render',
  'smoke-checking': 'Memeriksa frame',
  ready: 'Menyiapkan kandidat preview',
};

export class StudioService {
  readonly events = new StudioEvents();
  readonly store: StudioStore;
  readonly codex: CodexRuntime;
  readonly antigravity: AntigravityRuntime;
  readonly builder: StudioBuilder;
  readonly voiceover: LocalVoiceoverRuntime;
  private active = new Map<string, {jobId: string; controller: AbortController; completion: Promise<void>}>();
  private statusCache: {at: number; value: unknown} | null = null;
  private closing = false;
  private shotSchedulers = new Map<string, ShotScheduler>();

  constructor(readonly options: {repoRoot: string; projectRoot: string; runtimeImage?: string}) {
    this.store = new StudioStore(options.projectRoot);
    this.codex = new CodexRuntime({cwd: options.repoRoot});
    this.antigravity = new AntigravityRuntime({cwd: options.repoRoot});
    this.builder = new StudioBuilder({repoRoot: options.repoRoot, runtimeImage: options.runtimeImage});
    this.voiceover = new LocalVoiceoverRuntime({repoRoot: options.repoRoot});
  }

  async start(): Promise<void> { await this.store.acquireLock(); }

  async status(refresh = false): Promise<unknown> {
    if (!refresh && this.statusCache && Date.now() - this.statusCache.at < 20_000) return this.statusCache.value;
    const results = await Promise.allSettled([this.codex.status(), this.antigravity.status(), this.builder.status()]);
    const [codex, antigravity, runner] = results;
    const value = {
      version: '0.1.0', mode: '2d-local-voiceover',
      codex: codex.status === 'fulfilled' ? codex.value : {connected: false, authenticated: false, error: errorMessage(codex.reason)},
      antigravity: antigravity.status === 'fulfilled' ? antigravity.value : {connected: false, authenticated: false, error: errorMessage(antigravity.reason)},
      runner: runner.status === 'fulfilled' ? runner.value : {available: false, reason: errorMessage(runner.reason)},
      activeJobs: [...this.active].map(([projectId, value]) => ({projectId, jobId: value.jobId})),
    };
    this.statusCache = {at: Date.now(), value};
    return value;
  }

  assertIdle(projectId: string): void {
    if (this.closing) throw new StudioError('SHUTTING_DOWN', 'Studio sedang berhenti.', 503);
    if (this.active.has(projectId)) throw new StudioError('PROJECT_BUSY', 'Tunggu job selesai atau batalkan sebelum mengubah project.', 409);
  }

  private async thread(projectId: string, role: 'brainstorm' | 'implementor', provider: AgentProvider = 'codex'): Promise<{id: string; fresh: boolean}> {
    if (provider === 'antigravity') {
      const binding = `${role}-antigravity-v1`;
      const existing = await this.store.getThread(projectId, binding);
      if (existing) return {id: await this.antigravity.resumeThread(existing), fresh: false};
      const id = await this.antigravity.createThread({role, cwd: this.options.repoRoot, developerInstructions: role === 'brainstorm' ? BRAINSTORM_INSTRUCTIONS : IMPLEMENTATION_INSTRUCTIONS});
      await this.store.setThread(projectId, binding, id);
      return {id, fresh: true};
    }
    // Existing Codex sessions retain the old developer-level visual instructions.
    const binding = `${role}-style-v1`;
    const existing = await this.store.getThread(projectId, binding);
    if (existing) return {id: await this.codex.resumeThread(existing), fresh: false};
    const id = await this.codex.createThread({role, cwd: this.options.repoRoot, developerInstructions: role === 'brainstorm' ? BRAINSTORM_INSTRUCTIONS : IMPLEMENTATION_INSTRUCTIONS});
    await this.store.setThread(projectId, binding, id);
    return {id, fresh: true};
  }

  private async startJob(projectId: string, requestId: string, kind: Job['kind'], task: (job: Job, signal: AbortSignal) => Promise<void>): Promise<{jobId: string}> {
    const command = `commands/${requestId}.json`;
    try {
      const prior = await this.store.readJson<{jobId: string; kind: Job['kind']}>(projectId, command);
      if (prior.kind !== kind) throw new StudioError('COMMAND_CONFLICT', 'Request ID sudah dipakai untuk operasi lain.', 409);
      return {jobId: prior.jobId};
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      if (code !== 'ENOENT' && code !== 'NOT_FOUND') throw error;
    }
    this.assertIdle(projectId);
    const controller = new AbortController();
    const job: Job = {id: createId(), projectId, kind, status: 'queued', message: 'Menunggu proses', createdAt: now(), updatedAt: now()};
    const holder = {jobId: job.id, controller, completion: Promise.resolve()};
    this.active.set(projectId, holder);
    try {
      await this.store.saveJob(projectId, job);
      await this.store.writeJson(projectId, command, {jobId: job.id, kind});
    } catch (error) { this.active.delete(projectId); throw error; }
    holder.completion = (async () => {
      try {
        await this.store.saveJob(projectId, {...job, status: 'running', message: 'Sedang diproses', updatedAt: now()});
        this.events.publish(projectId, 'job.progress', {...job, status: 'running'}, job.id);
        if (controller.signal.aborted) throw new StudioError('CANCELLED', 'Job dibatalkan.');
        await task(job, controller.signal);
        const current = await this.store.getJob(projectId, job.id);
        if (controller.signal.aborted) throw new StudioError('CANCELLED', 'Job dibatalkan.');
        const completed: Job = {...current, status: 'succeeded', message: 'Selesai', updatedAt: now()};
        await this.store.saveJob(projectId, completed);
        this.events.publish(projectId, 'job.completed', completed, job.id);
      } catch (error) {
        const cancelled = isAbort(error, controller.signal);
        const current = await this.store.getJob(projectId, job.id).catch(() => job);
        const failed: Job = {...current, status: cancelled ? 'cancelled' : 'failed', message: cancelled ? 'Dibatalkan' : 'Proses gagal', error: errorMessage(error), updatedAt: now()};
        await this.store.saveJob(projectId, failed).catch(() => {});
        if (current.candidateId) {
          const candidate = await this.store.getCandidate(projectId, current.candidateId).catch(() => null);
          if (candidate && !['applied', 'discarded', 'stale', 'failed', 'cancelled'].includes(candidate.status)) {
            await this.store.saveCandidate(projectId, {...candidate, status: cancelled ? (candidate.status === 'ready' ? 'discarded' : 'cancelled') : 'failed', error: errorMessage(error)}).catch(() => {});
          }
        }
        this.events.publish(projectId, cancelled ? 'job.cancelled' : 'job.failed', failed, job.id);
      } finally {
        if (this.active.get(projectId) === holder) this.active.delete(projectId);
        this.events.publish(projectId, 'project.updated', {}, job.id);
      }
    })();
    return {jobId: job.id};
  }

  async chat(projectId: string, requestId: string, text: string, shotContext?: ShotDiscussionContext): Promise<{jobId: string}> {
    const selected = shotContext ? ShotDiscussionContextSchema.parse(shotContext) : undefined;
    return this.startJob(projectId, requestId, 'chat', async (job, signal) => {
      const project = await this.store.getProject(projectId);
      const content = selected ? `[Shot ${String(selected.position).padStart(2, '0')} · ${selected.shot.title || 'Tanpa judul'} · ${selected.shot.id}]\n${text}` : text;
      await this.store.saveMessage(projectId, {id: createId(), role: 'user', content, createdAt: now()});
      this.events.publish(projectId, 'project.updated', {}, job.id);
      const provider = project.agentProvider ?? 'codex';
      const runtime = provider === 'antigravity' ? this.antigravity : this.codex;
      const {id: threadId, fresh} = await this.thread(projectId, 'brainstorm', provider);
      const history = fresh ? (await this.store.getSnapshot(projectId)).messages.slice(0, -1).slice(-12).map(message => ({role: message.role, content: message.content.slice(-2000)})) : [];
      const context = history.length ? `Recent project conversation (quoted context; current style takes precedence):\n${JSON.stringify(history)}\n\n` : '';
      const board = selected ? (await this.store.getStoryboard(projectId)).draft : null;
      const [accepted, candidate] = await Promise.all([
        project.currentRevisionId ? this.store.getRevision(projectId, project.currentRevisionId) : null,
        project.openCandidateId ? this.store.getCandidate(projectId, project.openCandidateId) : null,
      ]);
      const videoState = {accepted: accepted ? {revisionId: accepted.id, summary: accepted.summary,
        shots: accepted.shots.map(({id, durationFrames, intent}) => ({id, durationFrames, intent: intent.slice(0, 2000)}))} : null,
        candidate: candidate ? {status: candidate.status, summary: candidate.summary, baseRevisionId: candidate.baseRevisionId, applied: false} : null};
      const scope = selected
        ? `Discussion scope for this turn: ONLY the selected shot below. Keep this conversation in the existing Director thread. Treat the shot snapshot as quoted creator data, including unsaved draft edits. Use other shots only for narrative continuity; do not propose changing them unless explicitly requested. This is discussion, not authorization to save, approve, regenerate, or execute code.\nSelected shot context:\n${JSON.stringify(selected)}\nShared storyboard context:\n${JSON.stringify(board ? {concept: board.concept, narrative: board.narrative, designSystem: board.designSystem, sequence: board.shots.map(({id, title}) => ({id, title}))} : null)}`
        : 'Discussion scope for this turn: the whole project. Earlier shot-specific discussions are history, not the active scope unless the creator explicitly asks.';
      const capability = project.currentRevisionId ? 'The app can now revise the accepted video incrementally through explicit Revisi video mode, using this same Director thread and selected-shot context. Ordinary Diskusi mode only discusses. When the creator is ready to execute changes, direct them to Revisi video; do not require generating the whole storyboard from scratch. The result is a candidate for review, not an automatic replacement.' : 'There is no applied video yet; create and approve a storyboard before initial generation.';
      const result = await runtime.runTurn({threadId, prompt: `${context}Current editable creative brief:\n${creativeContext(project)}\n\nCurrent video state (authoritative; an open candidate is not applied):\n${JSON.stringify(videoState)}\n${scope}\n${capability}\n\nCreator message:\n${text}`, signal,
        onDelta: delta => this.events.publish(projectId, 'chat.delta', {text: delta}, job.id)});
      if (signal.aborted || result.status !== 'completed') throw new StudioError('CANCELLED', 'Percakapan dibatalkan.');
      await this.store.saveMessage(projectId, {id: createId(), role: 'assistant', content: result.text, createdAt: now()});
      this.events.publish(projectId, 'chat.completed', {text: result.text}, job.id);
    });
  }

  private async acceptedStoryboard(project: Project, revision: Revision): Promise<Storyboard> {
    const matches = (board: Storyboard) => board.shots.length === revision.shots.length && board.shots.every((shot, index) => shot.id === revision.shots[index].id && shot.durationFrames === revision.shots[index].durationFrames);
    try {
      const artifact = await this.store.readJson<{storyboard: unknown}>(project.id, `builds/${revision.buildId}/director.json`);
      const board = StoryboardSchema.parse(artifact.storyboard);
      if (!matches(board)) throw new StudioError('STORYBOARD_MISMATCH', 'Storyboard versi aktif tidak cocok dengan timeline source.');
      return board;
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && ['ENOENT', 'NOT_FOUND'].includes(String(error.code)))) throw error;
    }
    const saved = (await this.store.getStoryboard(project.id)).draft;
    if (saved && matches(saved)) return saved;
    return StoryboardSchema.parse({schemaVersion: 1, concept: (project.brief || 'Video existing').slice(0, 8000), hook: revision.shots[0].intent.slice(0, 8000),
      narrative: revision.shots.map(shot => shot.intent).join('\n').slice(0, 8000), sharedComponents: [],
      designSystem: {colors: ['#101418', '#ffffff'], typography: 'Preserve typography in the existing source.', spacing: 'Preserve existing layout and safe areas.', motionStyle: 'Preserve existing frame-based motion unless requested.'},
      shots: revision.shots.map(shot => ({id: shot.id, title: shot.id, durationFrames: shot.durationFrames, intent: shot.intent.slice(0, 8000),
        visualDirection: shot.visualDirection.slice(0, 8000), motionInstructions: 'Preserve existing implementation.', transition: 'cut', dependencies: [], sharedComponents: []}))});
  }

  async voiceovers(projectId: string, sourceId?: string) {
    const snapshot = await this.store.getSnapshot(projectId);
    const source = sourceId ?? snapshot.revisions.find(revision => revision.id === snapshot.project.currentRevisionId)?.sourceId;
    if (source && !snapshot.revisions.some(revision => revision.sourceId === source) && !snapshot.candidates.some(candidate => candidate.sourceId === source))
      throw new StudioError('NOT_FOUND', 'Source audio tidak ditemukan.', 404);
    return {runtime: await this.voiceover.status(), tracks: source ? await readSourceVoiceovers(this.store.projectPath(projectId), source) : []};
  }

  async voiceoverFile(projectId: string, sourceId: string, assetId: string): Promise<string> {
    const {tracks} = await this.voiceovers(projectId, sourceId);
    if (!tracks.some(track => track.assetId === assetId)) throw new StudioError('NOT_FOUND', 'Audio tidak ditemukan.', 404);
    return path.join(this.store.projectPath(projectId), 'source', sourceId, 'audio', `${assetId}.wav`);
  }

  async generateVoiceover(projectId: string, requestId: string, input: {expectedRevisionId: string; shotId: string; text: string; volume: number; fitDuration: boolean}): Promise<{jobId: string}> {
    return this.startJob(projectId, requestId, 'voiceover', async (job, signal) => {
      const project = await this.store.getProject(projectId);
      if (project.currentRevisionId !== input.expectedRevisionId) throw new StudioError('STALE_REVISION', 'Versi aktif berubah. Muat ulang sebelum generate audio.', 409);
      if (project.openCandidateId) throw new StudioError('CANDIDATE_BUSY', 'Terapkan atau buang kandidat sebelum generate audio.', 409);
      const revision = await this.store.getRevision(projectId, input.expectedRevisionId);
      if (!revision.shots.some(shot => shot.id === input.shotId)) throw new StudioError('INVALID_SHOT', 'Shot tidak ada pada versi aktif.');
      const savedBoard = await this.store.getStoryboard(projectId);
      const baseBoard = await this.acceptedStoryboard(project, revision);
      const status = await this.voiceover.status();
      if (!status.available) throw new StudioError('VOICEOVER_UNAVAILABLE', status.reason ?? 'Runtime Chatterbox belum siap.', 503);
      const candidate: Candidate = {id: createId(), baseRevisionId: revision.id, sourceId: null, buildId: null, status: 'generating',
        summary: `Voice-over shot ${input.shotId}: ${input.text}`.slice(0, 4000), shots: revision.shots, createdAt: now()};
      await this.store.saveCandidate(projectId, candidate);
      await this.store.saveJob(projectId, {...await this.store.getJob(projectId, job.id), candidateId: candidate.id, updatedAt: now()});
      const directory = path.join(this.store.projectPath(projectId), 'audio-work', job.id);
      await fs.mkdir(directory, {recursive: true, mode: 0o700});
      const outputPath = path.join(directory, 'voice.wav');
      try {
        await this.progress(projectId, job.id, 'Chatterbox lokal sedang membuat narasi');
        const audio = await this.voiceover.synthesize({text: input.text, outputPath, signal});
        if (signal.aborted) throw new StudioError('CANCELLED', 'Generate audio dibatalkan.');
        const needed = Math.ceil(audio.durationMs * 30 / 1000);
        const currentShot = revision.shots.find(shot => shot.id === input.shotId)!;
        if (!input.fitDuration && needed > currentShot.durationFrames) throw new StudioError('AUDIO_TOO_LONG', 'Narasi melebihi durasi shot. Pendekkan teks atau aktifkan perpanjang shot.');
        const board = StoryboardSchema.parse({...baseBoard, shots: baseBoard.shots.map(shot => shot.id === input.shotId
          ? {...shot, durationFrames: input.fitDuration ? Math.max(shot.durationFrames, needed + 9) : shot.durationFrames} : shot)});
        const shots = revision.shots.map(shot => shot.id === input.shotId ? {...shot, durationFrames: board.shots.find(item => item.id === shot.id)!.durationFrames} : shot);
        const bytes = await fs.readFile(outputPath);
        const source = await materializeSource(this.store.projectPath(projectId), {baseRevisionId: revision.id, summary: candidate.summary,
          shots, changedFiles: [], deletedFiles: []}, revision.sourceId,
        {track: {assetId: createId(), shotId: input.shotId, hash: sha256(bytes), text: input.text, durationMs: audio.durationMs, sampleRate: audio.sampleRate, volume: input.volume}, file: outputPath});
        const assertCurrent = async () => {
          const latest = await this.store.getProject(projectId);
          if (signal.aborted) throw new StudioError('CANCELLED', 'Generate audio dibatalkan.');
          if (latest.currentRevisionId !== revision.id || latest.openCandidateId !== candidate.id || (await this.store.getStoryboard(projectId)).hash !== savedBoard.hash
            || briefHash(latest.brief, latest.style) !== briefHash(project.brief, project.style)) throw new StudioError('STALE_REVISION', 'Project berubah selama generate audio.', 409);
        };
        await assertCurrent();
        const buildId = createId();
        await this.store.saveCandidate(projectId, {...candidate, sourceId: source.sourceId, buildId, shots, status: 'validating'});
        await this.store.saveCandidate(projectId, {...candidate, sourceId: source.sourceId, buildId, shots, status: 'building'});
        await this.progress(projectId, job.id, 'Memeriksa preview video dengan voice-over');
        await this.builder.preview({projectDir: this.store.projectPath(projectId), sourceId: source.sourceId, shots, buildId, signal});
        await this.store.writeJson(projectId, `builds/${buildId}/director.json`, {storyboard: board, storyboardHash: sha256(serializeStoryboard(board))});
        const artifact: DirectorRevisionArtifact = {schemaVersion: 1, baseRevisionId: revision.id, baseSourceId: revision.sourceId, baseStoryboard: baseBoard,
          storyboard: board, shotIds: [input.shotId], projectStoryboardHash: savedBoard.hash, instructions: candidate.summary};
        await this.store.writeJson(projectId, `builds/${buildId}/director-revision.json`, artifact);
        await assertCurrent();
        await this.store.saveCandidate(projectId, {...candidate, sourceId: source.sourceId, buildId, shots, status: 'smoke-checking'});
        await recordPreviewQa(this.store, this.events, projectId, buildId, job.id);
        await this.store.saveCandidate(projectId, {...candidate, sourceId: source.sourceId, buildId, shots, status: 'ready'});
        this.events.publish(projectId, 'candidate.ready', {candidateId: candidate.id}, job.id);
      } finally { await fs.rm(directory, {recursive: true, force: true}); }
    });
  }

  async reviseFromDirector(projectId: string, requestId: string, text: string, expectedRevisionId: string, shotContext?: ShotDiscussionContext): Promise<{jobId: string}> {
    const selected = shotContext ? ShotDiscussionContextSchema.parse(shotContext) : undefined;
    return this.startJob(projectId, requestId, 'revise', async (job, signal) => {
      const project = await this.store.getProject(projectId);
      if (project.currentRevisionId !== expectedRevisionId) throw new StudioError('STALE_REVISION', 'Versi aktif berubah. Muat ulang sebelum merevisi.', 409);
      if (project.openCandidateId) throw new StudioError('CANDIDATE_BUSY', 'Terapkan atau buang kandidat sebelum revisi berikutnya.', 409);
      const revision = await this.store.getRevision(projectId, expectedRevisionId);
      const sourceFiles = await readSourceFiles(this.store.projectPath(projectId), revision.sourceId);
      const baseBoard = await this.acceptedStoryboard(project, revision);
      if (selected && !baseBoard.shots.some(shot => shot.id === selected.shot.id)) throw new StudioError('SHOT_NOT_GENERATED', 'Shot ini belum ada di versi aktif. Generate dan terapkan shot terlebih dahulu.', 409);
      const projectBoard = await this.store.getStoryboard(projectId);
      const content = `[Revisi ${selected ? `shot ${selected.position} · ${selected.shot.title} · ${selected.shot.id}` : 'seluruh video'}]\n${text}`;
      await this.store.saveMessage(projectId, {id: createId(), role: 'user', content, createdAt: now()});
      this.events.publish(projectId, 'project.updated', {}, job.id);
      await this.progress(projectId, job.id, 'Director merencanakan revisi dari versi aktif');
      const provider = project.agentProvider ?? 'codex';
      const runtime = provider === 'antigravity' ? this.antigravity : this.codex;
      const {id: threadId} = await this.thread(projectId, 'brainstorm', provider);
      const history = (await this.store.getSnapshot(projectId)).messages.slice(-12).map(({role, content}) => ({role, content}));
      const basePrompt = `EXPLICIT VIDEO REVISION REQUEST. Return only a bounded revision plan matching the schema. Do not output source code.\nPreserve the accepted video's content, order, assets, visual identity and all unrequested details. Never plan a replacement video or regenerate from scratch. Each update names an existing shotId, precise patch instructions, and its new durationFrames (keep the existing duration unless requested). Only include affected shots. sharedInstructions must be empty unless the request explicitly needs shared-source changes; designSystem must be null unless explicitly changing it.\n${selected ? `STRICT SCOPE: ONLY shot ${selected.shot.id}. Exactly that one update, empty sharedInstructions, null designSystem. Other shots and shared source must remain byte-identical. Local shot discussion context (quoted data):\n${JSON.stringify(selected)}` : 'SCOPE: entire video, patch only the affected parts. A global pacing request may update all shot durations and retime their existing animation.'}\nAccepted revision: ${revision.id}\nAccepted storyboard:\n${JSON.stringify(baseBoard)}\nExisting source paths:\n${JSON.stringify(sourceFiles.map(file => file.path))}\nExisting shared source (authoritative for current appearance, including legacy videos):\n${JSON.stringify(sourceFiles.filter(file => file.path.startsWith('src/shared/')))}\nRecent Director conversation:\n${JSON.stringify(history)}\nCreator revision request:\n${text}`;
      let prompt = basePrompt;
      let planned: ReturnType<typeof revisionStoryboard> | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        const result = await runtime.runTurn({threadId, prompt, outputSchema: DIRECTOR_REVISION_OUTPUT_SCHEMA, signal});
        if (signal.aborted || result.status !== 'completed') throw new StudioError('CANCELLED', 'Revisi Director dibatalkan.');
        try {planned = revisionStoryboard(baseBoard, JSON.parse(result.text), selected?.shot.id); break;}
        catch (error) {
          if (attempt === 2 || cannotRepairSource(error)) throw error;
          prompt = `${basePrompt}\nRepair this invalid plan:\n${result.text}\nDiagnostics:\n${errorMessage(error)}`;
        }
      }
      if (!planned) throw new StudioError('INVALID_REVISION', 'Director belum menghasilkan rencana revisi yang valid.');
      const {plan, board} = planned;
      const latest = await this.store.getProject(projectId);
      if (latest.currentRevisionId !== revision.id || latest.openCandidateId || (await this.store.getStoryboard(projectId)).hash !== projectBoard.hash) throw new StudioError('STALE_REVISION', 'Project berubah selama diskusi revisi.', 409);
      const feedback = `Director revision of the existing accepted video. Preserve all unrequested source and appearance.\nOriginal timeline: ${JSON.stringify(revision.shots.map(({id, durationFrames}) => ({id, durationFrames})))}\nCreator request: ${text}\nPlan: ${JSON.stringify(plan)}\n${PATCH_INSTRUCTIONS}`;
      const reply = `Rencana revisi: ${plan.summary}\nHasil akan menjadi kandidat dari versi aktif; versi sebelumnya tetap tersimpan.`;
      await this.store.saveMessage(projectId, {id: createId(), role: 'assistant', content: reply, createdAt: now()});
      this.events.publish(projectId, 'chat.completed', {text: reply}, job.id);
      let sourceId = (await materializeSource(this.store.projectPath(projectId), {baseRevisionId: revision.id, summary: plan.summary,
        shots: storyboardShots(board), changedFiles: [], deletedFiles: []}, revision.sourceId)).sourceId;
      if (plan.sharedInstructions.trim()) sourceId = await this.patchSharedSource(project, board, sourceId, plan.sharedInstructions, signal);
      const artifact: DirectorRevisionArtifact = {schemaVersion: 1, baseRevisionId: revision.id, baseSourceId: revision.sourceId,
        baseStoryboard: baseBoard, storyboard: board, shotIds: plan.updates.map(update => update.shotId), projectStoryboardHash: projectBoard.hash, instructions: text};
      await this.generateShots(project, board, sha256(serializeStoryboard(board)), job, signal, {sourceId,
        selectedShots: artifact.shotIds, patchOnly: true, feedback, directorRevision: artifact});
      const completed = `Kandidat revisi siap direview: ${plan.summary}\nTerapkan kandidat untuk memakai hasilnya, atau buang untuk mempertahankan versi aktif.`;
      await this.store.saveMessage(projectId, {id: createId(), role: 'assistant', content: completed, createdAt: now()});
      this.events.publish(projectId, 'chat.completed', {text: completed}, job.id);
    });
  }

  private async patchSharedSource(project: Project, board: Storyboard, sourceId: string, instructions: string, signal: AbortSignal): Promise<string> {
    const runtime = project.agentProvider === 'antigravity' ? this.antigravity : this.codex;
    const files = (await readSourceFiles(this.store.projectPath(project.id), sourceId)).filter(file => file.path.startsWith('src/shared/'));
    const threadId = await runtime.createThread({role: 'implementor', cwd: this.options.repoRoot, developerInstructions: PATCH_INSTRUCTIONS});
    const base = `Shared-source patch explicitly requested for a whole-video revision. shotId must be "shared". Own only existing src/shared/ files; do not edit shot source.\nExpected baseRevisionId: ${JSON.stringify(project.currentRevisionId)}\nInstructions: ${instructions}\nRevised shared design system: ${JSON.stringify(board.designSystem)}\nExisting shared source:\n${JSON.stringify(files)}\n${PATCH_INSTRUCTIONS}`;
    let prompt = base;
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await runtime.runTurn({threadId, prompt, outputSchema: SHOT_PATCH_OUTPUT_SCHEMA, signal});
      if (signal.aborted || result.status !== 'completed') throw new StudioError('CANCELLED', 'Revisi shared dibatalkan.');
      try {
        const patch = applyRevisionPatch(JSON.parse(result.text), project.currentRevisionId!, 'shared', files, storyboardShots(board), true);
        return (await materializeSource(this.store.projectPath(project.id), patch, sourceId)).sourceId;
      } catch (error) {
        if (attempt === 2 || cannotRepairSource(error)) throw error;
        prompt = `${base}\nRepair patch:\n${result.text}\nDiagnostics:\n${errorMessage(error)}`;
      }
    }
    throw new StudioError('INVALID_PATCH', 'Patch shared belum valid.');
  }

  async direct(projectId: string, requestId: string, expectedHash: string | null): Promise<{jobId: string}> {
    return this.startJob(projectId, requestId, 'director', async (job, signal) => {
      const project = await this.store.getProject(projectId);
      if (project.openCandidateId) throw new StudioError('CANDIDATE_BUSY', 'Terapkan atau buang kandidat sebelum menyusun storyboard.', 409);
      const snapshot = await this.store.getSnapshot(projectId);
      const messages = snapshot.messages.slice(-12).map(({role, content}) => ({role, content: content.slice(-4000)}));
      if ((!project.brief.trim() || project.brief === DEFAULT_BRIEF) && messages.length === 0) {
        throw new StudioError('INVALID_BRIEF', 'Kirim pesan ke Director atau tulis brief sebelum menyusun storyboard.');
      }
      const state = await this.store.getStoryboard(projectId);
      if (state.hash !== expectedHash) throw new StudioError('STALE_STORYBOARD', 'Storyboard berubah. Muat ulang sebelum meminta Director.', 409);
      this.events.publish(projectId, 'director.started', {jobId: job.id}, job.id);
      const runtime = project.agentProvider === 'antigravity' ? this.antigravity : this.codex;
      const threadId = await runtime.createThread({role: 'brainstorm', cwd: this.options.repoRoot, developerInstructions: DIRECTOR_INSTRUCTIONS});
      const messagesContext = messages.length > 0
        ? `PRIMARY SOURCE OF TRUTH — RECENT CREATOR DISCUSSION:\n${JSON.stringify(messages)}\n\n`
        : '';
      const briefContext = (project.brief && project.brief !== DEFAULT_BRIEF)
        ? `Optional supplementary brief:\n${project.brief}\n\n`
        : '';
      let prompt = `${messagesContext}${briefContext}Current project editing style:\n${JSON.stringify(project.style)}\nExisting draft (preserve stable IDs for retained shots):\n${JSON.stringify(state.draft)}\n${DIRECTOR_INSTRUCTIONS}`;
      for (let attempt = 0; attempt < 3; attempt++) {
        await this.progress(projectId, job.id, attempt ? 'Director memperbaiki storyboard' : 'Director menyusun storyboard');
        const result = await runtime.runTurn({threadId, prompt, outputSchema: DIRECTOR_OUTPUT_SCHEMA, signal});
        if (signal.aborted || result.status !== 'completed') throw new StudioError('CANCELLED', 'Director dibatalkan.');
        try {
          const draft = StoryboardSchema.parse(JSON.parse(result.text));
          if (state.draft) {
            for (const previous of state.draft.shots) {
              const retained = draft.shots.find(shot => shot.title === previous.title);
              if (retained && retained.id !== previous.id) throw new StudioError('SHOT_ID_CHANGED', 'Director harus mempertahankan ID shot yang masih digunakan.');
            }
          }
          let currentBrief = project.brief;
          let currentStyle = project.style;
          if (!project.brief.trim() || project.brief === DEFAULT_BRIEF) {
            currentBrief = draft.narrative || draft.concept || draft.hook || 'Konsep disusun bersama Director';
            await this.store.updateBrief(projectId, currentBrief);
          }
          const isStyleEmpty = !currentStyle || Object.values(currentStyle).every(v => typeof v !== 'string' || !v.trim());
          if (isStyleEmpty && draft.designSystem) {
            const autoStyle = {
              colorPalette: draft.designSystem.colors.join(', '),
              typography: draft.designSystem.typography,
              pacing: draft.designSystem.motionStyle,
              visualDirection: draft.designSystem.spacing,
              mood: draft.hook || draft.concept || '',
              transitions: 'cut',
              avoid: '',
              referenceNotes: '',
            };
            await this.store.updateStyle(projectId, autoStyle);
            currentStyle = autoStyle;
          }
          const saved = await this.store.saveStoryboard(projectId, draft, expectedHash, briefHash(currentBrief, currentStyle));
          this.events.publish(projectId, 'director.completed', {storyboardHash: saved.hash, shots: draft.shots.map(shot => shot.id)}, job.id);
          return;
        } catch (error) {
          if (attempt === 2 || cannotRepairSource(error) || error instanceof StudioError && ['STALE_STORYBOARD', 'STALE_BRIEF', 'CANDIDATE_BUSY'].includes(error.code)) throw error;
          prompt = `${messagesContext}${briefContext}Current project editing style:\n${JSON.stringify(project.style)}\nExisting draft:\n${JSON.stringify(state.draft)}\nRepair this invalid storyboard:\n${result.text}\nValidation diagnostics:\n${errorMessage(error)}\n${DIRECTOR_INSTRUCTIONS}`;
        }
      }
    });
  }

  private async shotProposal(project: Project, board: Storyboard, shotId: string, baseRevisionId: string | null,
    sourceId: string, signal: AbortSignal, onRetry: (attempt: number, error: string) => Promise<void>, feedback = '', images: string[] = [],
    previous?: ShotOutput, diagnostic?: string, patchOnly = false, allowTimingOnly = false): Promise<ShotOutput> {
    const shot = board.shots.find(item => item.id === shotId);
    if (!shot) throw new StudioError('INVALID_SHOT', 'Shot tidak ditemukan.');
    const runtime = project.agentProvider === 'antigravity' ? this.antigravity : this.codex;
    const threadId = previous?.threadId ?? await runtime.createThread({role: 'implementor', cwd: this.options.repoRoot, developerInstructions: patchOnly ? PATCH_INSTRUCTIONS : SHOT_IMPLEMENTATION_INSTRUCTIONS});
    const files = (await readSourceFiles(this.store.projectPath(project.id), sourceId))
      .filter(file => file.path === `src/shots/${shotId}.tsx` || file.path.startsWith(`src/shots/${shotId}/`) || file.path.startsWith('src/shared/'));
    const creative = patchOnly ? 'Revise the existing accepted video. Existing source and explicit revision instructions are authoritative; do not apply unrelated project Brief/Style changes or redesign from scratch.' : creativeContext(project);
    const basePrompt = `${creative}\nApproved storyboard and shared visual rules:\n${JSON.stringify(board)}\nAssigned shot:\n${JSON.stringify(shot)}\nExpected baseRevisionId: ${JSON.stringify(baseRevisionId)}\nCurrent shot source and read-only shared files:\n${JSON.stringify(files)}\n${feedback}\n${patchOnly ? PATCH_INSTRUCTIONS : SHOT_IMPLEMENTATION_INSTRUCTIONS}`;
    let prompt = diagnostic && previous ? `${basePrompt}\nRepair your last proposal:\n${JSON.stringify(previous.proposal)}\nDiagnostics:\n${diagnostic}` : basePrompt;
    let failure = '';
    const firstAttempt = previous ? previous.attempt + 1 : 1;
    for (let attempt = firstAttempt; attempt <= 3; attempt++) {
      if (signal.aborted) throw new StudioError('CANCELLED', 'Shot dibatalkan.');
      if (attempt > 1) await onRetry(attempt, diagnostic ?? failure);
      const result = await runtime.runTurn({threadId, prompt, outputSchema: patchOnly ? SHOT_PATCH_OUTPUT_SCHEMA : SOURCE_OUTPUT_SCHEMA, images, signal});
      if (signal.aborted || result.status !== 'completed') throw new StudioError('CANCELLED', 'Shot dibatalkan.');
      try {
        const proposal = patchOnly ? applyRevisionPatch(JSON.parse(result.text), baseRevisionId!, shotId, files, storyboardShots(board).filter(item => item.id === shotId), false, allowTimingOnly) : SourceProposalSchema.parse(JSON.parse(result.text));
        if (proposal.baseRevisionId !== baseRevisionId) throw new StudioError('STALE_PROPOSAL', 'Base revision worker tidak sesuai.');
        if (proposal.shots.length !== 1 || proposal.shots[0].id !== shotId || proposal.shots[0].durationFrames !== shot.durationFrames) throw new StudioError('STORYBOARD_MISMATCH', 'Worker harus mempertahankan ID dan durasi shot yang ditugaskan.');
        const own = (file: string) => file === `src/shots/${shotId}.tsx` || file.startsWith(`src/shots/${shotId}/`);
        if ([...proposal.changedFiles.map(file => file.path), ...proposal.deletedFiles].some(file => !own(file))) throw new StudioError('SHOT_OWNERSHIP', 'Worker hanya boleh mengubah file milik shot yang ditugaskan.');
        if (!proposal.changedFiles.length && !(patchOnly && allowTimingOnly)) throw new StudioError('EMPTY_PROPOSAL', 'Worker tidak mengembalikan perubahan source.');
        validateSourceFiles(proposal);
        return {proposal, threadId, prompt: basePrompt, attempt};
      } catch (error) {
        if (attempt === 3 || cannotRepairSource(error)) throw error;
        failure = errorMessage(error);
        prompt = `${basePrompt}\nRepair your invalid proposal:\n${result.text}\nDiagnostics:\n${failure}`;
      }
    }
    throw new StudioError('GENERATION_FAILED', failure || 'Shot belum berhasil setelah dua perbaikan.', 422);
  }

  private coordinatorFiles(board: Storyboard): Array<{path: string; content: string}> {
    return [
      {path: 'src/shared/design.ts', content: `export const designSystem = ${JSON.stringify(board.designSystem)};\nexport const sharedContracts = ${JSON.stringify(board.sharedComponents)};\n`},
      {path: 'src/shared/components.tsx', content: `import React from 'react';\nimport {designSystem} from './design';\ntype Props={children?:React.ReactNode};\nexport function Surface({children}:Props){return <div style={{width:'100%',height:'100%',background:designSystem.colors[0],color:designSystem.colors[1]||'#ffffff',fontFamily:designSystem.typography}}>{children}</div>;}\nexport function Heading({children}:Props){return <h1 style={{margin:0,fontFamily:designSystem.typography,lineHeight:1.15}}>{children}</h1>;}\n`},
      ...board.shots.map(shot => ({path: `src/shots/${shot.id}.tsx`, content: `import React from 'react';\nexport default function Pending(){return <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',background:${JSON.stringify(board.designSystem.colors[0])},color:${JSON.stringify(board.designSystem.colors[1] ?? '#ffffff')},fontFamily:'sans-serif',fontSize:32}}>Shot sedang disiapkan</div>;}\n`})),
    ];
  }

  private async sharedComponents(project: Project, board: Storyboard, sourceId: string, signal: AbortSignal): Promise<string> {
    if (!board.sharedComponents.length) return sourceId;
    const runtime = project.agentProvider === 'antigravity' ? this.antigravity : this.codex;
    const instructions = `${SHOT_IMPLEMENTATION_INSTRUCTIONS}\nCoordinator exception: you own ONLY src/shared/components.tsx and modules under src/shared/components/. Do not write shot entries or src/shared/design.ts. Implement each approved shared component description as reusable React components with props {children?:React.ReactNode,frame?:number,fps?:number}. Export const sharedComponents = { '<approved-id>': Component, ... } as a plain object literal with every approved component id. Also export Surface and Heading if useful. Use designSystem from './design' (provided). Output shots metadata for the complete supplied timeline; these are metadata only. This coordinator exception replaces the shot-owned-path restriction. Shared source will be validated before shot workers are dispatched.`;
    const threadId = await runtime.createThread({role: 'implementor', cwd: this.options.repoRoot, developerInstructions: instructions});
    const files = (await readSourceFiles(this.store.projectPath(project.id), sourceId)).filter(file => file.path.startsWith('src/shared/'));
    const basePrompt = `${creativeContext(project)}\nApproved storyboard:\n${JSON.stringify(board)}\nExpected baseRevisionId: ${JSON.stringify(project.currentRevisionId)}\nCoordinator-owned initial shared files:\n${JSON.stringify(files)}\n${instructions}`;
    let prompt = basePrompt;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = await runtime.runTurn({threadId, prompt, outputSchema: SOURCE_OUTPUT_SCHEMA, signal});
      if (signal.aborted || result.status !== 'completed') throw new StudioError('CANCELLED', 'Penyusunan shared components dibatalkan.');
      try {
        const proposal = SourceProposalSchema.parse(JSON.parse(result.text));
        if (proposal.baseRevisionId !== project.currentRevisionId) throw new StudioError('STALE_PROPOSAL', 'Base revision coordinator tidak sesuai.');
        const owns = (file: string) => file === 'src/shared/components.tsx' || file.startsWith('src/shared/components/');
        if ([...proposal.changedFiles.map(file => file.path), ...proposal.deletedFiles].some(file => !owns(file))) throw new StudioError('SHARED_OWNERSHIP', 'Coordinator hanya boleh mengubah implementasi shared components.');
        const registry = proposal.changedFiles.find(file => file.path === 'src/shared/components.tsx');
        if (!registry) throw new StudioError('SHARED_REGISTRY', 'Coordinator harus menghasilkan shared component registry.');
        const ast = ts.createSourceFile(registry.path, registry.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        const exported = ast.statements.find(statement => ts.isVariableStatement(statement) && statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
          && statement.declarationList.declarations.some(declaration => ts.isIdentifier(declaration.name) && declaration.name.text === 'sharedComponents'));
        const declaration = exported && ts.isVariableStatement(exported) ? exported.declarationList.declarations.find(item => ts.isIdentifier(item.name) && item.name.text === 'sharedComponents') : undefined;
        const initializer = declaration?.initializer;
        if (!initializer || !ts.isObjectLiteralExpression(initializer)) throw new StudioError('SHARED_REGISTRY', 'Shared registry harus exported object literal.');
        const keys = new Set(initializer.properties.flatMap(property => property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) ? [property.name.text] : []));
        if (board.sharedComponents.some(component => !keys.has(component.id))) throw new StudioError('SHARED_REGISTRY', 'Ada shared component approved yang belum diimplementasikan.');
        return (await materializeSource(this.store.projectPath(project.id), {...proposal, shots: storyboardShots(board)}, sourceId)).sourceId;
      } catch (error) {
        if (attempt === 3 || cannotRepairSource(error)) throw error;
        prompt = `${basePrompt}\nRepair your invalid shared source:\n${result.text}\nDiagnostics:\n${errorMessage(error)}`;
      }
    }
    throw new StudioError('SHARED_GENERATION_FAILED', 'Shared components belum berhasil.', 422);
  }

  private async generateShots(project: Project, board: Storyboard, storyboardHash: string, job: Job, signal: AbortSignal,
    options: {retryRun?: GenerationRun; selectedShot?: string; selectedShots?: string[]; sourceId?: string; feedback?: string; images?: string[]; targetFrame?: number; patchOnly?: boolean; directorRevision?: DirectorRevisionArtifact; expectedStoryboardHash?: string | null} = {}): Promise<void> {
    const projectId = project.id;
    const projectDir = this.store.projectPath(projectId);
    const shots = storyboardShots(board);
    const assertCurrentBase = async () => {
      const latest = await this.store.getProject(projectId);
      const latestBoard = await this.store.getStoryboard(projectId);
      const boardChanged = options.directorRevision ? latestBoard.hash !== options.directorRevision.projectStoryboardHash
        : options.expectedStoryboardHash !== undefined ? latestBoard.hash !== options.expectedStoryboardHash : latestBoard.approvedHash !== storyboardHash;
      if (latest.currentRevisionId !== project.currentRevisionId || boardChanged || briefHash(latest.brief, latest.style) !== briefHash(project.brief, project.style)) throw new StudioError('STALE_REVISION', 'Project atau storyboard berubah saat generation.', 409);
    };
    await assertCurrentBase();
    const candidate: Candidate = {id: createId(), baseRevisionId: project.currentRevisionId, sourceId: null, buildId: null,
      status: 'generating', summary: options.directorRevision ? `Revisi Director: ${options.directorRevision.instructions}`.slice(0, 4000) : options.feedback ? 'Merevisi shot dari komentar frame' : options.retryRun ? 'Mengulang shot yang belum selesai' : 'Membuat shot dari storyboard', shots, createdAt: now()};
    await this.store.saveCandidate(projectId, candidate);
    const currentJob = await this.store.getJob(projectId, job.id);
    await this.store.saveJob(projectId, {...currentJob, candidateId: candidate.id, updatedAt: now()});
    let initialSource = options.sourceId ?? options.retryRun?.sourceId ?? (await materializeSource(projectDir, {
      baseRevisionId: project.currentRevisionId, summary: 'Coordinator establishes shared design and placeholders', shots,
      changedFiles: this.coordinatorFiles(board), deletedFiles: [],
    })).sourceId;
    if (!options.sourceId && !options.retryRun) {
      await this.progress(projectId, job.id, 'Coordinator menyiapkan shared design dan components');
      initialSource = await this.sharedComponents(project, board, initialSource, signal);
    }
    const initialBuildId = createId();
    await this.store.saveCandidate(projectId, {...candidate, status: 'validating'});
    let aggregate: Candidate = {...candidate, status: 'building', sourceId: initialSource, buildId: initialBuildId};
    await this.store.saveCandidate(projectId, aggregate);
    const initialRecord = await this.builder.preview({projectDir, sourceId: initialSource, shots, buildId: initialBuildId, signal});
    await this.store.writeJson(projectId, `builds/${initialBuildId}/director.json`, {storyboard: board, storyboardHash});
    if (options.directorRevision) await this.store.writeJson(projectId, `builds/${initialBuildId}/director-revision.json`, options.directorRevision);
    const selected = options.selectedShots ?? (options.selectedShot ? [options.selectedShot] : null);
    const timingChanged = (shotId: string) => Boolean(options.directorRevision && options.directorRevision.baseStoryboard.shots.find(shot => shot.id === shotId)?.durationFrames !== board.shots.find(shot => shot.id === shotId)?.durationFrames);
    const tasks: ShotTask[] = board.shots.map(shot => {
      const prior = options.retryRun?.shots.find(item => item.shotId === shot.id);
      if (selected && !selected.includes(shot.id)) return prior ? {...prior} : {shotId: shot.id, status: 'preview_ready', attempt: 0};
      return {shotId: shot.id, status: 'queued', attempt: (prior?.attempt ?? 0) + 1};
    });
    if (options.directorRevision && tasks.every(task => task.status === 'preview_ready')) await recordPreviewQa(this.store, this.events, projectId, initialBuildId, job.id);
    const run: GenerationRun = {candidateId: candidate.id, jobId: job.id, storyboardHash, baseRevisionId: project.currentRevisionId,
      sourceId: initialSource, buildId: initialBuildId, shots: tasks, createdAt: now(), updatedAt: now()};
    const persist = async () => {
      run.updatedAt = now();
      await this.store.writeJson(projectId, `generation-runs/${candidate.id}.json`, JSON.parse(JSON.stringify(run)));
    };
    await persist();
    this.events.publish(projectId, 'candidate.preview_ready', {candidateId: candidate.id, buildId: initialRecord.id, placeholder: !options.sourceId && !options.retryRun}, job.id);
    const scheduler = new ShotScheduler();
    const attemptOffsets = new Map(tasks.map(task => [task.shotId, task.attempt - 1]));
    const schedulerKey = `${projectId}:${candidate.id}`;
    this.shotSchedulers.set(schedulerKey, scheduler);
    const change = async (task: ShotTask) => {
      run.shots = run.shots.map(item => item.shotId === task.shotId ? {...task} : item);
      await persist();
      this.events.publish(projectId, `shot.${task.status}`, {candidateId: candidate.id, ...task, sourceId: run.sourceId, buildId: run.buildId}, job.id);
    };
    const retrying = async (task: ShotTask, attempt: number, error: string) => {
      task.attempt = (attemptOffsets.get(task.shotId) ?? 0) + attempt;
      task.status = 'generating';
      run.shots = run.shots.map(item => item.shotId === task.shotId ? {...task} : item);
      await persist();
      this.events.publish(projectId, 'shot.retrying', {candidateId: candidate.id, shotId: task.shotId, attempt: task.attempt, error}, job.id);
    };
    for (const task of tasks.filter(item => item.status === 'queued')) await change(task);
    try {
      const result = await scheduler.run(tasks.filter(task => task.status === 'queued'), {concurrency: 2, signal, onChange: change},
        async (task, childSignal) => this.shotProposal(project, board, task.shotId, project.currentRevisionId, run.sourceId, childSignal,
          async (attempt, error) => retrying(task, attempt, error), options.feedback, options.images, undefined, undefined, options.patchOnly, timingChanged(task.shotId)),
        async (task, output, childSignal) => {
          let current = output;
          while (true) {
            if (signal.aborted || childSignal.aborted) throw new StudioError('CANCELLED', 'Shot dibatalkan.');
            await assertCurrentBase();
            try {
              const snapshot = await materializeSource(projectDir, {...current.proposal, shots}, run.sourceId);
              const buildId = createId();
              this.events.publish(projectId, 'visual_qa.started', {candidateId: candidate.id, shotId: task.shotId, checkType: 'runtime'}, job.id);
              const checked = await this.builder.preview({projectDir, sourceId: snapshot.sourceId, shots, buildId, signal: childSignal,
                frames: options.targetFrame === undefined ? undefined : [options.targetFrame]});
              await this.store.writeJson(projectId, `builds/${buildId}/director.json`, {storyboard: board, storyboardHash});
              if (options.directorRevision) await this.store.writeJson(projectId, `builds/${buildId}/director-revision.json`, options.directorRevision);
              if (signal.aborted || childSignal.aborted) throw new StudioError('CANCELLED', 'Shot dibatalkan.');
              run.sourceId = snapshot.sourceId;
              run.buildId = buildId;
              task.attempt = (attemptOffsets.get(task.shotId) ?? 0) + current.attempt;
              task.changedFiles = current.proposal.changedFiles.map(file => file.path);
              aggregate = {...aggregate, sourceId: snapshot.sourceId, buildId, summary: options.directorRevision ? candidate.summary : current.proposal.summary};
              await this.store.saveCandidate(projectId, aggregate);
              await recordPreviewQa(this.store, this.events, projectId, checked.id, job.id, task.shotId);
              await persist();
              return;
            } catch (error) {
              if (signal.aborted || childSignal.aborted || current.attempt >= 3 || cannotRepairSource(error)) throw error;
              current = await this.shotProposal(project, board, task.shotId, project.currentRevisionId, run.sourceId, childSignal,
                async (attempt, diagnostic) => retrying(task, attempt, diagnostic), options.feedback, options.images, current, errorMessage(error), options.patchOnly, timingChanged(task.shotId));
              await change({...task, status: 'validating'});
            }
          }
        });
      for (const task of result) run.shots = run.shots.map(item => item.shotId === task.shotId ? task : item);
      await persist();
      if (signal.aborted) throw new StudioError('CANCELLED', 'Generation dibatalkan.');
      await assertCurrentBase();
      if (run.shots.some(task => task.status !== 'preview_ready')) throw new StudioError('SHOT_GENERATION_FAILED', 'Sebagian shot belum selesai. Hasil shot lain disimpan; ulangi shot yang gagal.', 422);
      await this.store.saveCandidate(projectId, {...aggregate, status: 'smoke-checking'});
      await this.store.saveCandidate(projectId, {...aggregate, status: 'ready'});
      this.events.publish(projectId, 'candidate.ready', {candidateId: candidate.id}, job.id);
    } finally { this.shotSchedulers.delete(schedulerKey); }
  }

  async retryShot(projectId: string, requestId: string, candidateId: string, shotId: string): Promise<{jobId: string}> {
    return this.startJob(projectId, requestId, 'generate', async (job, signal) => {
      const project = await this.store.getProject(projectId);
      const candidate = await this.store.getCandidate(projectId, candidateId);
      const run = await this.store.readJson<GenerationRun>(projectId, `generation-runs/${candidate.id}.json`);
      const board = await this.store.getStoryboard(projectId);
      const task = run.shots.find(item => item.shotId === shotId);
      if (project.currentRevisionId !== run.baseRevisionId || project.openCandidateId) throw new StudioError('STALE_REVISION', 'Selesaikan kandidat aktif atau kembali ke base revision sebelum retry.', 409);
      if (!['failed', 'cancelled'].includes(candidate.status) || !task || !['failed', 'cancelled'].includes(task.status)) throw new StudioError('SHOT_NOT_RETRYABLE', 'Hanya shot gagal atau dibatalkan yang bisa diulang.', 409);
      let revision: DirectorRevisionArtifact | undefined;
      try {revision = DirectorRevisionArtifactSchema.parse(await this.store.readJson(projectId, `builds/${run.buildId}/director-revision.json`));}
      catch (error) {if (!(error && typeof error === 'object' && 'code' in error && ['ENOENT', 'NOT_FOUND'].includes(String(error.code)))) throw error;}
      if (revision) {
        if (board.hash !== revision.projectStoryboardHash) throw new StudioError('STALE_STORYBOARD', 'Storyboard berubah sejak revisi dimulai.', 409);
        await this.generateShots(project, revision.storyboard, run.storyboardHash, job, signal, {retryRun: run, selectedShot: shotId,
          patchOnly: true, feedback: `${PATCH_INSTRUCTIONS}\nOriginal timeline: ${JSON.stringify(revision.baseStoryboard.shots.map(({id, durationFrames}) => ({id, durationFrames})))}\nCreator revision request:\n${revision.instructions}`, directorRevision: revision});
        return;
      }
      if (!board.draft || !board.approvedHash || board.approvedHash !== run.storyboardHash) throw new StudioError('STALE_STORYBOARD', 'Storyboard berubah; generate dari approval terbaru.', 409);
      await this.generateShots(project, board.draft, board.approvedHash, job, signal, {retryRun: run, selectedShot: shotId});
    });
  }

  async cancelShot(projectId: string, candidateId: string, shotId: string): Promise<void> {
    const scheduler = this.shotSchedulers.get(`${projectId}:${candidateId}`);
    if (!scheduler) throw new StudioError('JOB_NOT_ACTIVE', 'Generation shot tidak aktif.', 409);
    const run = await this.store.readJson<GenerationRun>(projectId, `generation-runs/${candidateId}.json`);
    if (!run.shots.some(task => task.shotId === shotId && ['queued', 'generating', 'validating'].includes(task.status))) throw new StudioError('SHOT_NOT_ACTIVE', 'Shot sudah selesai atau tidak aktif.', 409);
    scheduler.cancel(shotId);
  }

  async exportRevision(projectId: string, requestId: string, revisionId: string): Promise<{jobId: string}> {
    return this.startJob(projectId, requestId, 'export', async (job, signal) => {
      const project = await this.store.getProject(projectId);
      if (project.currentRevisionId !== revisionId || project.openCandidateId) throw new StudioError('REVISION_NOT_FINAL', 'Terapkan kandidat dan pilih revision aktif sebelum export.', 409);
      const revision = await this.store.getRevision(projectId, revisionId);
      this.events.publish(projectId, 'export.started', {revisionId, jobId: job.id}, job.id);
      try {
        const artifact = await this.builder.export({projectDir: this.store.projectPath(projectId), buildId: revision.buildId, exportId: job.id, signal});
        const record = {jobId: job.id, revisionId, status: 'ready', ...artifact};
        await this.store.writeJson(projectId, `exports/${job.id}.json`, record);
        this.events.publish(projectId, 'export.completed', record, job.id);
      } catch (error) {
        this.events.publish(projectId, 'export.failed', {revisionId, error: errorMessage(error)}, job.id);
        throw error;
      }
    });
  }

  async visualQa(projectId: string, requestId: string, buildId: string): Promise<{jobId: string}> {
    return this.startJob(projectId, requestId, 'visual-qa', async (job, signal) => {
      const project = await this.store.getProject(projectId);
      await reviewPreviewQa({store: this.store, events: this.events, runtime: project.agentProvider === 'antigravity' ? this.antigravity : this.codex,
        projectId, buildId, jobId: job.id, signal, repoRoot: this.options.repoRoot});
    });
  }

  async generate(projectId: string, requestId: string, expectedRevisionId: string | null, commentId?: string, approvedStoryboardHash?: string): Promise<{jobId: string}> {
    return this.startJob(projectId, requestId, commentId ? 'revise' : 'generate', async (job, signal) => {
      const project = await this.store.getProject(projectId);
      if (project.currentRevisionId !== expectedRevisionId) throw new StudioError('STALE_REVISION', 'Versi project berubah. Muat ulang sebelum generate.', 409);
      if (project.openCandidateId) throw new StudioError('CANDIDATE_BUSY', 'Terapkan atau buang kandidat yang terbuka.', 409);
      if (!project.approvedBriefHash || project.approvedBriefHash !== briefHash(project.brief, project.style)) throw new StudioError('BRIEF_NOT_APPROVED', 'Simpan dan setujui brief beserta style sebelum generate.', 409);
      const storyboard = await this.store.getStoryboard(projectId);
      if (!commentId && storyboard.draft && (!storyboard.approvedHash || storyboard.approvedHash !== storyboard.hash
          || approvedStoryboardHash !== undefined && approvedStoryboardHash !== storyboard.approvedHash)) throw new StudioError('STORYBOARD_NOT_APPROVED', 'Setujui storyboard saat ini sebelum generate.', 409);
      if (approvedStoryboardHash !== undefined && approvedStoryboardHash !== storyboard.approvedHash) throw new StudioError('STALE_STORYBOARD', 'Versi storyboard berbeda dari approval generation.', 409);
      const runtime = await this.builder.status();
      if (!runtime.available) throw new StudioError('RUNTIME_UNAVAILABLE', runtime.reason ?? 'Runtime render belum siap.', 503);
      const original = expectedRevisionId ? await this.store.getRevision(projectId, expectedRevisionId) : null;
      const files = original ? await readSourceFiles(this.store.projectPath(projectId), original.sourceId) : [];
      let images: string[] = [];
      let feedback = '';
      let targetShotId: string | undefined;
      let targetFrame: number | undefined;
      if (commentId) {
        const comment = await this.store.getComment(projectId, commentId);
        if (!original || comment.anchor.revisionId !== expectedRevisionId) throw new StudioError('STALE_COMMENT', 'Komentar berasal dari versi lain. Pulihkan versi itu atau buat komentar baru.', 409);
        const shot = original.shots.find(s => s.id === comment.anchor.shotId);
        if (!shot) throw new StudioError('INVALID_ANCHOR', 'Shot komentar tidak ditemukan.');
        targetShotId = shot.id;
        targetFrame = shotGlobalFrame(original.shots, comment.anchor.shotId, comment.anchor.localFrame);
        const outputPath = path.join(this.store.projectPath(projectId), 'comments', `${comment.id}.png`);
        await this.progress(projectId, job.id, 'Mengambil frame komentar');
        await this.builder.screenshot({projectDir: this.store.projectPath(projectId), buildId: original.buildId, frame: shotGlobalFrame(original.shots, comment.anchor.shotId, comment.anchor.localFrame), outputPath, signal});
        await this.store.setCommentScreenshot(projectId, commentId, `comments/${comment.id}.png`);
        images = [outputPath];
        feedback = `\nCreator frame comment (attached image is this exact frame):\n${JSON.stringify(comment)}\nPreserve stable shot ID and unaffected content. Make a meaningful source edit for this comment.`;
      }
      if (commentId && original) {
        const accepted = await this.acceptedStoryboard(project, original);
        await this.generateShots(project, accepted, sha256(serializeStoryboard(accepted)), job, signal,
          {selectedShot: targetShotId, sourceId: original.sourceId, feedback, images, targetFrame, expectedStoryboardHash: storyboard.hash});
        return;
      }
      if (storyboard.draft && storyboard.approvedHash) {
        await this.generateShots(project, storyboard.draft, storyboard.approvedHash, job, signal,
          commentId && original ? {selectedShot: targetShotId, sourceId: original.sourceId, feedback, images, targetFrame} : {});
        return;
      }
      const provider = project.agentProvider ?? 'codex';
      const agentName = provider === 'antigravity' ? 'Antigravity' : 'Codex';
      const agentRuntime = provider === 'antigravity' ? this.antigravity : this.codex;
      const {id: threadId} = await this.thread(projectId, 'implementor', provider);
      const storyboardContext = storyboard.draft ? `\nApproved storyboard (shot IDs, timing, visual/motion direction and design system are authoritative):\n${JSON.stringify(storyboard.draft)}\nThe approved storyboard supersedes the legacy one-shot duration limit.\n` : '';
      let prompt = `Implement this approved creative brief:\n${creativeContext(project)}${storyboardContext}\nExpected baseRevisionId: ${JSON.stringify(expectedRevisionId)}\nExisting shot metadata: ${JSON.stringify(original?.shots ?? [])}\nExisting source files: ${JSON.stringify(files)}${feedback}\n${IMPLEMENTATION_INSTRUCTIONS}`;
      let failure = '';
      for (let attempt = 0; attempt < 3; attempt++) {
        if (signal.aborted) throw new StudioError('CANCELLED', 'Generate dibatalkan.');
        const candidate: Candidate = {id: createId(), baseRevisionId: expectedRevisionId, sourceId: null, buildId: null, status: 'generating', summary: attempt ? `Perbaikan build ${attempt}` : 'Membuat komposisi', shots: [], createdAt: now()};
        await this.store.saveCandidate(projectId, candidate);
        const currentJob = await this.store.getJob(projectId, job.id);
        await this.store.saveJob(projectId, {...currentJob, candidateId: candidate.id, updatedAt: now()});
        await this.progress(projectId, job.id, attempt ? `${agentName} memperbaiki kode (${attempt}/2)` : `${agentName} menulis shot TSX`);
        let proposal: SourceProposal | null = null;
        try {
          const result = await agentRuntime.runTurn({threadId, prompt, outputSchema: SOURCE_OUTPUT_SCHEMA, images, signal});
          if (signal.aborted || result.status !== 'completed') throw new StudioError('CANCELLED', 'Generate dibatalkan.');
          proposal = SourceProposalSchema.parse(JSON.parse(result.text));
          if (proposal.baseRevisionId !== expectedRevisionId) throw new StudioError('STALE_PROPOSAL', 'Agent mengembalikan base revision yang berbeda.');
          if (storyboard.draft) {
            const planned = storyboardShots(storyboard.draft);
            if (proposal.shots.length !== planned.length || proposal.shots.some((shot, index) => shot.id !== planned[index].id || shot.durationFrames !== planned[index].durationFrames)) throw new StudioError('STORYBOARD_MISMATCH', 'Shot dan durasi harus mengikuti storyboard approved.');
          } else {
            if (proposal.shots.length !== 1 || proposal.shots[0].durationFrames < 450 || proposal.shots[0].durationFrames > 900) throw new StudioError('M0_SHOT_LIMIT', 'Tahap ini memerlukan satu shot berdurasi 15–30 detik.');
            if (original && proposal.shots[0].id !== original.shots[0].id) throw new StudioError('SHOT_ID_CHANGED', 'Revisi harus mempertahankan ID shot.');
          }
          if (!proposal.changedFiles.length) throw new StudioError('EMPTY_PROPOSAL', 'Agent belum menghasilkan perubahan source.');
          if (targetShotId && [...proposal.changedFiles.map(file => file.path), ...proposal.deletedFiles].some(file => file !== `src/shots/${targetShotId}.tsx` && !file.startsWith(`src/shots/${targetShotId}/`))) throw new StudioError('SHOT_OWNERSHIP', 'Revisi frame hanya boleh mengubah file shot yang dituju.');
          validateSourceFiles(proposal);
          await this.store.saveCandidate(projectId, {...candidate, status: 'validating', summary: proposal.summary, shots: proposal.shots});
          await this.progress(projectId, job.id, 'Memvalidasi kode shot');
          const source = await materializeSource(this.store.projectPath(projectId), proposal, original?.sourceId);
          const buildId = createId();
          const building: Candidate = {...candidate, sourceId: source.sourceId, buildId, status: 'building', summary: proposal.summary, shots: proposal.shots};
          await this.store.saveCandidate(projectId, building);
          let acceptBuildProgress = true;
          let pendingProgress = Promise.resolve();
          let progressError: unknown;
          const onProgress = (stage: string): Promise<void> => {
            const message = buildStageMessages[stage];
            if (!acceptBuildProgress || !message || signal.aborted) return Promise.resolve();
            pendingProgress = pendingProgress.then(() => this.progress(projectId, job.id, message)).catch(error => { progressError ??= error; });
            return pendingProgress;
          };
          try {
            await this.builder.preview({projectDir: this.store.projectPath(projectId), sourceId: source.sourceId, shots: proposal.shots, buildId, signal, onProgress,
              frames: targetFrame === undefined ? undefined : [targetFrame]});
          } finally {
            acceptBuildProgress = false;
            await pendingProgress;
          }
          if (progressError) throw new StudioError('PROGRESS_FAILED', `Progress build gagal disimpan: ${errorMessage(progressError)}`, 500);
          await recordPreviewQa(this.store, this.events, projectId, buildId, job.id, targetShotId);
          await this.store.saveCandidate(projectId, {...building, status: 'smoke-checking'});
          if (signal.aborted) throw new StudioError('CANCELLED', 'Generate dibatalkan.');
          const latest = await this.store.getProject(projectId);
          const latestStoryboard = await this.store.getStoryboard(projectId);
          if (latest.currentRevisionId !== expectedRevisionId || latest.approvedBriefHash !== project.approvedBriefHash || latestStoryboard.approvedHash !== storyboard.approvedHash) {
            await this.store.saveCandidate(projectId, {...building, status: 'stale'});
            throw new StudioError('STALE_REVISION', 'Project berubah saat build; kandidat tidak diterapkan.', 409);
          }
          await this.store.saveCandidate(projectId, {...building, status: 'ready'});
          this.events.publish(projectId, 'candidate.ready', {candidateId: candidate.id}, job.id);
          return;
        } catch (error) {
          const cancelled = isAbort(error, signal);
          const existing = await this.store.getCandidate(projectId, candidate.id);
          if (!['stale', 'failed', 'cancelled'].includes(existing.status)) await this.store.saveCandidate(projectId, {...existing, status: cancelled ? 'cancelled' : 'failed', error: errorMessage(error)});
          if (cancelled) throw error;
          failure = errorMessage(error);
          this.events.publish(projectId, 'candidate.failed', {candidateId: candidate.id, error: failure, attempt}, job.id);
          if (cannotRepairSource(error)) throw error;
          if (attempt === 2) break;
          prompt = `The last proposal failed validation/build. Fix the code and return the full corrected proposal against baseRevisionId ${JSON.stringify(expectedRevisionId)}.\nApproved creative brief:\n${creativeContext(project)}${storyboardContext}\nOriginal base files:\n${JSON.stringify(files)}\nFailed proposal:\n${JSON.stringify(proposal)}\nDiagnostics:\n${failure}\n${feedback}\n${IMPLEMENTATION_INSTRUCTIONS}`;
        }
      }
      throw new StudioError('GENERATION_FAILED', `Kode belum berhasil setelah dua perbaikan. ${failure}`, 422);
    });
  }

  private async progress(projectId: string, jobId: string, message: string): Promise<void> {
    const active = this.active.get(projectId);
    if (!active || active.jobId !== jobId || active.controller.signal.aborted) return;
    const job = await this.store.getJob(projectId, jobId);
    if (job.projectId !== projectId || job.status !== 'running' || this.active.get(projectId) !== active || active.controller.signal.aborted) return;
    await this.store.saveJob(projectId, {...job, message, updatedAt: now()});
    if (this.active.get(projectId) === active && !active.controller.signal.aborted) this.events.publish(projectId, 'job.progress', {message}, jobId);
  }

  async candidateDetails(projectId: string, candidateId: string): Promise<unknown> {
    const candidate = await this.store.getCandidate(projectId, candidateId);
    const base = candidate.baseRevisionId ? await this.store.getRevision(projectId, candidate.baseRevisionId) : null;
    const [before, after] = await Promise.all([
      base ? readSourceFiles(this.store.projectPath(projectId), base.sourceId) : Promise.resolve([]),
      candidate.sourceId ? readSourceFiles(this.store.projectPath(projectId), candidate.sourceId) : Promise.resolve([]),
    ]);
    return {candidate, before, after};
  }

  async revisionSource(projectId: string, revisionId: string): Promise<unknown> {
    const revision = await this.store.getRevision(projectId, revisionId);
    return {revision, files: await readSourceFiles(this.store.projectPath(projectId), revision.sourceId)};
  }

  async recoverPreview(projectId: string, failedBuildId: string, fallbackBuildId: string, _frame?: number): Promise<boolean> {
    const projectDir = this.store.projectPath(projectId);
    return this.builder.recoverPreview(projectDir, failedBuildId, fallbackBuildId);
  }

  async cancel(jobId: string): Promise<void> {
    const entry = [...this.active.values()].find(active => active.jobId === jobId);
    if (!entry) throw new StudioError('JOB_NOT_ACTIVE', 'Job sudah selesai atau tidak aktif.', 409);
    entry.controller.abort();
    await entry.completion;
  }

  async close(): Promise<void> {
    this.closing = true;
    for (const entry of this.active.values()) entry.controller.abort();
    await Promise.allSettled([this.codex.close(), this.antigravity.close()]);
    await Promise.allSettled([...this.active.values()].map(entry => entry.completion));
    await this.builder.close();
    this.events.close();
    await this.store.releaseLock();
  }
}
