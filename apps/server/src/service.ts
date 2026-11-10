import path from 'node:path';
import {createId, briefHash, StudioError, SourceProposalSchema, type Candidate, type Job, type SourceProposal, type AgentProvider} from '@studio/studio-core';
import {StudioStore} from '@studio/storage';
import {CodexRuntime} from '@studio/codex-runtime';
import {AntigravityRuntime} from '@studio/antigravity-runtime';
import {StudioBuilder, materializeSource, readSourceFiles, validateSourceFiles} from '@studio/codegen';
import {StudioEvents} from './events.js';
import {BRAINSTORM_INSTRUCTIONS, IMPLEMENTATION_INSTRUCTIONS, SOURCE_OUTPUT_SCHEMA, creativeContext} from './prompts.js';

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
  private active = new Map<string, {jobId: string; controller: AbortController; completion: Promise<void>}>();
  private statusCache: {at: number; value: unknown} | null = null;
  private closing = false;

  constructor(readonly options: {repoRoot: string; projectRoot: string; runtimeImage?: string}) {
    this.store = new StudioStore(options.projectRoot);
    this.codex = new CodexRuntime({cwd: options.repoRoot});
    this.antigravity = new AntigravityRuntime({cwd: options.repoRoot});
    this.builder = new StudioBuilder({repoRoot: options.repoRoot, runtimeImage: options.runtimeImage});
  }

  async start(): Promise<void> { await this.store.acquireLock(); }

  async status(refresh = false): Promise<unknown> {
    if (!refresh && this.statusCache && Date.now() - this.statusCache.at < 20_000) return this.statusCache.value;
    const results = await Promise.allSettled([this.codex.status(), this.antigravity.status(), this.builder.status()]);
    const [codex, antigravity, runner] = results;
    const value = {
      version: '0.1.0', mode: 'silent-2d',
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

  async chat(projectId: string, requestId: string, text: string): Promise<{jobId: string}> {
    return this.startJob(projectId, requestId, 'chat', async (job, signal) => {
      const project = await this.store.getProject(projectId);
      await this.store.saveMessage(projectId, {id: createId(), role: 'user', content: text, createdAt: now()});
      this.events.publish(projectId, 'project.updated', {}, job.id);
      const provider = project.agentProvider ?? 'codex';
      const runtime = provider === 'antigravity' ? this.antigravity : this.codex;
      const {id: threadId, fresh} = await this.thread(projectId, 'brainstorm', provider);
      const history = fresh ? (await this.store.getSnapshot(projectId)).messages.slice(0, -1).slice(-12).map(message => ({role: message.role, content: message.content.slice(-2000)})) : [];
      const context = history.length ? `Recent project conversation (quoted context; current style takes precedence):\n${JSON.stringify(history)}\n\n` : '';
      const result = await runtime.runTurn({threadId, prompt: `${context}Current editable creative brief:\n${creativeContext(project)}\n\nCreator message:\n${text}`, signal,
        onDelta: delta => this.events.publish(projectId, 'chat.delta', {text: delta}, job.id)});
      if (signal.aborted || result.status !== 'completed') throw new StudioError('CANCELLED', 'Percakapan dibatalkan.');
      await this.store.saveMessage(projectId, {id: createId(), role: 'assistant', content: result.text, createdAt: now()});
      this.events.publish(projectId, 'chat.completed', {text: result.text}, job.id);
    });
  }

  async generate(projectId: string, requestId: string, expectedRevisionId: string | null, commentId?: string): Promise<{jobId: string}> {
    return this.startJob(projectId, requestId, commentId ? 'revise' : 'generate', async (job, signal) => {
      const project = await this.store.getProject(projectId);
      if (project.currentRevisionId !== expectedRevisionId) throw new StudioError('STALE_REVISION', 'Versi project berubah. Muat ulang sebelum generate.', 409);
      if (project.openCandidateId) throw new StudioError('CANDIDATE_BUSY', 'Terapkan atau buang kandidat yang terbuka.', 409);
      if (!project.approvedBriefHash || project.approvedBriefHash !== briefHash(project.brief, project.style)) throw new StudioError('BRIEF_NOT_APPROVED', 'Simpan dan setujui brief beserta style sebelum generate.', 409);
      const runtime = await this.builder.status();
      if (!runtime.available) throw new StudioError('RUNTIME_UNAVAILABLE', runtime.reason ?? 'Runtime render belum siap.', 503);
      const original = expectedRevisionId ? await this.store.getRevision(projectId, expectedRevisionId) : null;
      const files = original ? await readSourceFiles(this.store.projectPath(projectId), original.sourceId) : [];
      let images: string[] = [];
      let feedback = '';
      if (commentId) {
        const comment = await this.store.getComment(projectId, commentId);
        if (!original || comment.anchor.revisionId !== expectedRevisionId) throw new StudioError('STALE_COMMENT', 'Komentar berasal dari versi lain. Pulihkan versi itu atau buat komentar baru.', 409);
        const shot = original.shots.find(s => s.id === comment.anchor.shotId);
        if (!shot) throw new StudioError('INVALID_ANCHOR', 'Shot komentar tidak ditemukan.');
        const outputPath = path.join(this.store.projectPath(projectId), 'comments', `${comment.id}.png`);
        await this.progress(projectId, job.id, 'Mengambil frame komentar');
        await this.builder.screenshot({projectDir: this.store.projectPath(projectId), buildId: original.buildId, frame: comment.anchor.localFrame, outputPath, signal});
        await this.store.setCommentScreenshot(projectId, commentId, `comments/${comment.id}.png`);
        images = [outputPath];
        feedback = `\nCreator frame comment (attached image is this exact frame):\n${JSON.stringify(comment)}\nPreserve stable shot ID and unaffected content. Make a meaningful source edit for this comment.`;
      }
      const provider = project.agentProvider ?? 'codex';
      const agentName = provider === 'antigravity' ? 'Antigravity' : 'Codex';
      const agentRuntime = provider === 'antigravity' ? this.antigravity : this.codex;
      const {id: threadId} = await this.thread(projectId, 'implementor', provider);
      let prompt = `Implement this approved creative brief:\n${creativeContext(project)}\nExpected baseRevisionId: ${JSON.stringify(expectedRevisionId)}\nExisting shot metadata: ${JSON.stringify(original?.shots ?? [])}\nExisting source files: ${JSON.stringify(files)}${feedback}\n${IMPLEMENTATION_INSTRUCTIONS}`;
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
          if (proposal.shots.length !== 1 || proposal.shots[0].durationFrames < 450 || proposal.shots[0].durationFrames > 900) throw new StudioError('M0_SHOT_LIMIT', 'Tahap ini memerlukan satu shot berdurasi 15–30 detik.');
          if (original && proposal.shots[0].id !== original.shots[0].id) throw new StudioError('SHOT_ID_CHANGED', 'Revisi harus mempertahankan ID shot.');
          if (!proposal.changedFiles.length) throw new StudioError('EMPTY_PROPOSAL', 'Agent belum menghasilkan perubahan source.');
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
            await this.builder.build({projectDir: this.store.projectPath(projectId), sourceId: source.sourceId, shots: proposal.shots, buildId, signal, onProgress});
          } finally {
            acceptBuildProgress = false;
            await pendingProgress;
          }
          if (progressError) throw new StudioError('PROGRESS_FAILED', `Progress build gagal disimpan: ${errorMessage(progressError)}`, 500);
          await this.store.saveCandidate(projectId, {...building, status: 'smoke-checking'});
          if (signal.aborted) throw new StudioError('CANCELLED', 'Generate dibatalkan.');
          const latest = await this.store.getProject(projectId);
          if (latest.currentRevisionId !== expectedRevisionId || latest.approvedBriefHash !== project.approvedBriefHash) {
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
          prompt = `The last proposal failed validation/build. Fix the code and return the full corrected proposal against baseRevisionId ${JSON.stringify(expectedRevisionId)}.\nApproved creative brief:\n${creativeContext(project)}\nOriginal base files:\n${JSON.stringify(files)}\nFailed proposal:\n${JSON.stringify(proposal)}\nDiagnostics:\n${failure}\n${feedback}\n${IMPLEMENTATION_INSTRUCTIONS}`;
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
    this.events.close();
    await this.store.releaseLock();
  }
}
