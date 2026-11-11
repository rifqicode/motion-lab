import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {z} from 'zod';
import {
  CandidateSchema, CommentSchema, FrameAnchorSchema, IdSchema, JobSchema, MessageSchema,
  ProjectSchema, RevisionSchema, StyleBriefSchema, StudioError, ThreadBindingsSchema, assertCandidateTransition,
  briefHash, candidateTerminalStatuses, createId, serializeBrief, sha256,
  StoryboardSchema, StoryboardStateSchema, emptyStoryboardState, serializeStoryboard,
  DirectorRevisionArtifactSchema, mergeDirectorRevisionStoryboard,
  SourcePathSchema, ShotSpecSchema, validateSourcePath, VoiceoverTrackSchema, sourceFingerprint,
  type Candidate, type Comment, type FrameAnchor, type Job, type Message, type Project,
  type ProjectSnapshot, type Revision, type StyleBrief, type AgentProvider, type Storyboard, type StoryboardState,
} from '@studio/studio-core';

const LockSchema = z.object({pid: z.number().int().positive(), host: z.string(), token: z.string()}).strict();
const missing = (error: unknown): boolean => (error as NodeJS.ErrnoException)?.code === 'ENOENT';
const now = (): string => new Date().toISOString();
const FingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);
const ShotTaskSchema = z.object({
  shotId: IdSchema,
  status: z.enum(['queued', 'generating', 'validating', 'preview_ready', 'failed', 'cancelled']),
  attempt: z.number().int().nonnegative(),
  workerId: z.string().min(1).max(100).optional(),
  changedFiles: z.array(SourcePathSchema).max(20).optional(),
  error: z.string().max(12_000).optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
}).strict();
const GenerationRunSchema = z.object({
  candidateId: IdSchema, jobId: IdSchema, storyboardHash: FingerprintSchema,
  baseRevisionId: IdSchema.nullable(), sourceId: IdSchema, buildId: IdSchema,
  shots: z.array(ShotTaskSchema).min(1).max(12),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
}).strict().superRefine((run, ctx) => {
  if (new Set(run.shots.map(shot => shot.shotId)).size !== run.shots.length) ctx.addIssue({code: z.ZodIssueCode.custom, message: 'Generation run has duplicate shot IDs.'});
});
const SourceManifestSchema = z.object({
  schemaVersion: z.literal(1), sourceId: IdSchema, sourceHash: FingerprintSchema,
  shots: z.array(ShotSpecSchema).min(1).max(12),
  files: z.array(z.object({path: SourcePathSchema, hash: FingerprintSchema}).strict()).min(1).max(20),
  voiceovers: z.array(VoiceoverTrackSchema).max(12).optional(),
}).strict();

export class StudioStore {
  public readonly root: string;
  private lockToken: string | null = null;
  private queues = new Map<string, Promise<unknown>>();

  constructor(root: string) { this.root = path.resolve(root); }

  projectPath(projectId: string): string { return path.join(this.root, IdSchema.parse(projectId)); }

  async acquireLock(): Promise<void> {
    if (this.lockToken) return;
    await fs.mkdir(this.root, {recursive: true});
    if ((await fs.lstat(this.root)).isSymbolicLink()) throw new StudioError('INVALID_PATH', 'Workspace must not be a symbolic link.');
    const lockPath = path.join(this.root, '.studio.lock.json');
    const token = createId();
    const take = async () => {
      const handle = await fs.open(lockPath, 'wx', 0o600);
      try {
        await handle.writeFile(JSON.stringify({pid: process.pid, host: os.hostname(), token}));
        await handle.sync();
      } finally { await handle.close(); }
    };
    try { await take(); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const recoveryPath = path.join(this.root, '.studio-lock-recovery');
      try { await fs.mkdir(recoveryPath); }
      catch { throw new StudioError('WORKSPACE_LOCKED', 'Another process is opening or recovering this workspace.', 409); }
      try {
        if ((await fs.lstat(lockPath)).isSymbolicLink()) throw new StudioError('WORKSPACE_LOCKED', 'Workspace lock is not a regular lock file.', 409);
        const raw = await fs.readFile(lockPath, 'utf8');
        let lock: z.infer<typeof LockSchema>;
        try { lock = LockSchema.parse(JSON.parse(raw)); }
        catch { throw new StudioError('WORKSPACE_LOCKED', 'Workspace lock is invalid; inspect it before recovery.', 409); }
        if (lock.host !== os.hostname()) throw new StudioError('WORKSPACE_LOCKED', 'Workspace is locked by another host.', 409);
        let alive = true;
        try { process.kill(lock.pid, 0); }
        catch (probeError) { if ((probeError as NodeJS.ErrnoException).code === 'ESRCH') alive = false; }
        if (alive) throw new StudioError('WORKSPACE_LOCKED', 'Another studio process is writing this workspace.', 409);
        if (await fs.readFile(lockPath, 'utf8') !== raw) throw new StudioError('WORKSPACE_LOCKED', 'Workspace lock changed during recovery.', 409);
        await fs.unlink(lockPath);
        await take();
      } finally { await fs.rmdir(recoveryPath); }
    }
    this.lockToken = token;
    try { await this.recoverInterruptedWork(); }
    catch (error) { await this.releaseLock(); throw error; }
  }

  async releaseLock(): Promise<void> {
    if (!this.lockToken) return;
    await Promise.all([...this.queues.values()].map((promise) => promise.catch(() => undefined)));
    const lockPath = path.join(this.root, '.studio.lock.json');
    try {
      const lock = LockSchema.parse(JSON.parse(await fs.readFile(lockPath, 'utf8')));
      if (lock.token === this.lockToken) await fs.unlink(lockPath);
    } catch (error) { if (!missing(error)) throw error; }
    finally { this.lockToken = null; }
  }

  private assertWritable(): void {
    if (!this.lockToken) throw new StudioError('WORKSPACE_NOT_LOCKED', 'Acquire the workspace lock before writing.', 409);
  }

  private async serialize<T>(key: string, task: () => Promise<T>): Promise<T> {
    this.assertWritable();
    const previous = this.queues.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    this.queues.set(key, next);
    try { return await next; }
    finally { if (this.queues.get(key) === next) this.queues.delete(key); }
  }

  private relativeParts(relativePath: string): string[] {
    const parts = relativePath.split('/');
    if (!relativePath || path.isAbsolute(relativePath) || relativePath.length > 500 || /[\\:\0]/.test(relativePath)
        || parts.some((part) => !part || part === '.' || part === '..' || part.startsWith('.'))) {
      throw new StudioError('INVALID_PATH', 'Invalid project-relative file path.');
    }
    return parts;
  }

  private async checkedPath(projectId: string, relativePath: string, createParents = false): Promise<string> {
    const base = this.projectPath(projectId);
    const parts = this.relativeParts(relativePath);
    let current = base;
    for (const part of ['', ...parts.slice(0, -1)]) {
      if (part) current = path.join(current, part);
      let stat;
      try { stat = await fs.lstat(current); }
      catch (error) {
        if (!missing(error) || !createParents) throw error;
        await fs.mkdir(current);
        stat = await fs.lstat(current);
      }
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new StudioError('INVALID_PATH', 'Project path contains a symbolic link or non-directory.');
    }
    const result = path.join(current, parts.at(-1)!);
    try {
      const stat = await fs.lstat(result);
      if (stat.isSymbolicLink() || !stat.isFile()) throw new StudioError('INVALID_PATH', 'Record is not a regular file.');
    } catch (error) { if (!missing(error)) throw error; }
    return result;
  }

  async readJson<T = unknown>(projectId: string, relativePath: string): Promise<T> {
    const target = await this.checkedPath(projectId, relativePath);
    const handle = await fs.open(target, 'r');
    try {
      const stat = await handle.stat();
      if (stat.size > 4 * 1024 * 1024) throw new StudioError('INVALID_RECORD', 'JSON record exceeds size limit.');
      try { return JSON.parse(await handle.readFile('utf8')) as T; }
      catch { throw new StudioError('INVALID_RECORD', `Cannot read saved JSON record: ${relativePath}`, 500); }
    } finally { await handle.close(); }
  }

  private async atomicJson(projectId: string, relativePath: string, value: unknown): Promise<void> {
    const target = await this.checkedPath(projectId, relativePath, true);
    const raw = JSON.stringify(value, null, 2) + '\n';
    if (Buffer.byteLength(raw) > 4 * 1024 * 1024) throw new StudioError('INVALID_RECORD', 'JSON record exceeds size limit.');
    const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${createId()}.tmp`);
    const handle = await fs.open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(raw);
      await handle.sync();
    } catch (error) {
      await handle.close();
      await fs.unlink(temporary).catch(() => undefined);
      throw error;
    }
    await handle.close();
    try { await fs.rename(temporary, target); }
    catch (error) { await fs.unlink(temporary).catch(() => undefined); throw error; }
  }

  async writeJson(projectId: string, relativePath: string, value: unknown): Promise<void> {
    await this.serialize(projectId, async () => {
      await this.getProject(projectId);
      const collection = relativePath.split('/')[0];
      if (relativePath === 'project.json' || relativePath === 'threads.json' || relativePath === 'storyboard.json'
          || ['revisions', 'candidates', 'jobs', 'comments', 'conversations'].includes(collection)) {
        throw new StudioError('RESERVED_RECORD', 'Use the typed store operation to update project lifecycle records.', 409);
      }
      const record = this.validateRecord(relativePath, value);
      await this.atomicJson(projectId, relativePath, record);
    });
  }

  private validateRecord(relativePath: string, value: unknown): unknown {
    if (relativePath === 'project.json') return ProjectSchema.parse(value);
    if (relativePath === 'threads.json') return ThreadBindingsSchema.parse(value);
    if (relativePath.startsWith('generation-runs/')) {
      const parts = relativePath.split('/');
      const run = GenerationRunSchema.parse(value);
      if (parts.length !== 2 || parts[1] !== `${run.candidateId}.json`) throw new StudioError('INVALID_RECORD', 'Generation run identity does not match its filename.');
      return run;
    }
    const collection = relativePath.split('/')[0];
    const schemas: Record<string, z.ZodTypeAny> = {revisions: RevisionSchema, candidates: CandidateSchema, jobs: JobSchema, comments: CommentSchema};
    if (schemas[collection] && relativePath.split('/').length === 2) return schemas[collection].parse(value);
    return value;
  }

  private async records<T>(projectId: string, collection: string, schema: z.ZodType<T>): Promise<T[]> {
    const directory = path.join(this.projectPath(projectId), collection);
    try {
      const stat = await fs.lstat(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new StudioError('INVALID_PATH', 'Invalid record collection.');
      const files = await fs.readdir(directory);
      const values = await Promise.all(files.filter((file) => file.endsWith('.json') && !file.startsWith('.')).map(async (file) => {
        IdSchema.parse(file.slice(0, -5));
        const value = schema.parse(await this.readJson(projectId, `${collection}/${file}`));
        if (collection === 'generation-runs' && (value as {candidateId?: string}).candidateId !== file.slice(0, -5)) throw new StudioError('INVALID_RECORD', 'Generation run identity does not match its filename.', 500);
        return value;
      }));
      return values.sort((a, b) => String((a as {createdAt?: string}).createdAt ?? '').localeCompare(String((b as {createdAt?: string}).createdAt ?? '')));
    } catch (error) { if (missing(error)) return []; throw error; }
  }

  async listProjects(): Promise<Project[]> {
    await fs.mkdir(this.root, {recursive: true});
    const entries = await fs.readdir(this.root, {withFileTypes: true});
    const projects: Project[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.') || !entry.isDirectory()) continue;
      IdSchema.parse(entry.name);
      try { projects.push(await this.getProject(entry.name)); }
      catch (error) { if (!missing(error)) throw error; }
    }
    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createProject(name: string, brief = '', agentProvider: AgentProvider = 'codex'): Promise<Project> {
    return this.serialize('_projects', async () => {
      const timestamp = now();
      const project = ProjectSchema.parse({id: createId(), name, fps: 30, width: 720, height: 1280,
        agentProvider,
        currentRevisionId: null, openCandidateId: null, brief, approvedBriefHash: null, createdAt: timestamp, updatedAt: timestamp});
      await fs.mkdir(this.projectPath(project.id));
      await this.atomicJson(project.id, 'project.json', project);
      return project;
    });
  }

  async updateAgent(projectId: string, provider: AgentProvider): Promise<Project> {
    return this.serialize(projectId, async () => {
      const project = await this.getProject(projectId);
      if (project.agentProvider === provider) return project;
      const updated = ProjectSchema.parse({...project, agentProvider: provider, updatedAt: now()});
      await this.atomicJson(projectId, 'project.json', updated);
      return updated;
    });
  }

  async getProject(projectId: string): Promise<Project> {
    try {
      const project = ProjectSchema.parse(await this.readJson(projectId, 'project.json'));
      if (project.id !== projectId) throw new StudioError('INVALID_RECORD', 'Project ID does not match its directory.', 500);
      return project;
    } catch (error) {
      if (missing(error)) throw new StudioError('NOT_FOUND', 'Project not found.', 404);
      throw error;
    }
  }

  async updateBrief(projectId: string, brief: string): Promise<Project> {
    return this.serialize(projectId, async () => {
      const project = ProjectSchema.parse({...await this.getProject(projectId), brief, approvedBriefHash: null, updatedAt: now()});
      await this.atomicJson(projectId, 'project.json', project);
      await this.invalidateStoryboard(projectId);
      return project;
    });
  }

  async approveBrief(projectId: string): Promise<Project> {
    return this.serialize(projectId, async () => {
      const project = await this.getProject(projectId);
      if (!project.brief.trim()) throw new StudioError('INVALID_BRIEF', 'Write a brief before approving it.');
      const approved = {...project, approvedBriefHash: briefHash(project.brief, project.style), updatedAt: now()};
      await this.atomicJson(projectId, 'project.json', approved);
      return approved;
    });
  }

  async updateStyle(projectId: string, input: Partial<StyleBrief>): Promise<Project> {
    const style = StyleBriefSchema.parse(input);
    return this.serialize(projectId, async () => {
      const project = await this.getProject(projectId);
      if (serializeBrief('', project.style) === serializeBrief('', style)) return project;
      if (project.openCandidateId) throw new StudioError('CANDIDATE_BUSY', 'Terapkan atau buang kandidat yang terbuka sebelum mengubah style.', 409);
      const updated = ProjectSchema.parse({...project, style, approvedBriefHash: null, updatedAt: now()});
      await this.atomicJson(projectId, 'project.json', updated);
      await this.invalidateStoryboard(projectId);
      return updated;
    });
  }

  private async invalidateStoryboard(projectId: string): Promise<void> {
    const state = await this.getStoryboard(projectId);
    if (state.draft) await this.atomicJson(projectId, 'storyboard.json', {...state, approvedHash: null});
  }

  async getStoryboard(projectId: string): Promise<StoryboardState> {
    const project = await this.getProject(projectId);
    let state: StoryboardState;
    try { state = StoryboardStateSchema.parse(await this.readJson(projectId, 'storyboard.json')); }
    catch (error) { if (missing(error)) return emptyStoryboardState(); throw error; }
    if (state.draft && sha256(serializeStoryboard(state.draft)) !== state.hash) throw new StudioError('INVALID_STORYBOARD', 'Storyboard fingerprint does not match its content.', 500);
    return state.briefHash === briefHash(project.brief, project.style) ? state : {...state, approvedHash: null};
  }

  async saveStoryboard(projectId: string, input: Storyboard, expectedHash: string | null, expectedBriefHash?: string): Promise<StoryboardState> {
    const draft = StoryboardSchema.parse(input);
    return this.serialize(projectId, async () => {
      const project = await this.getProject(projectId);
      if (project.openCandidateId) throw new StudioError('CANDIDATE_BUSY', 'Terapkan atau buang kandidat sebelum mengubah storyboard.', 409);
      const state = await this.getStoryboard(projectId);
      if (state.hash !== expectedHash) throw new StudioError('STALE_STORYBOARD', 'Storyboard berubah. Muat ulang sebelum menyimpan.', 409);
      const fingerprint = briefHash(project.brief, project.style);
      if (expectedBriefHash && fingerprint !== expectedBriefHash) throw new StudioError('STALE_BRIEF', 'Brief atau style berubah saat Director bekerja.', 409);
      const nextHash = sha256(serializeStoryboard(draft));
      const next: StoryboardState = {draft, hash: nextHash, briefHash: fingerprint,
        approvedHash: nextHash === state.hash && fingerprint === state.briefHash ? state.approvedHash : null};
      await this.atomicJson(projectId, 'storyboard.json', next);
      return next;
    });
  }

  async approveStoryboard(projectId: string, expectedHash: string): Promise<StoryboardState> {
    return this.serialize(projectId, async () => {
      const project = await this.getProject(projectId);
      if (project.openCandidateId) throw new StudioError('CANDIDATE_BUSY', 'Terapkan atau buang kandidat sebelum menyetujui storyboard.', 409);
      const state = await this.getStoryboard(projectId);
      if (!state.draft || state.hash !== expectedHash) throw new StudioError('STALE_STORYBOARD', 'Storyboard berubah atau belum tersedia.', 409);
      if (state.briefHash !== briefHash(project.brief, project.style)) throw new StudioError('STALE_BRIEF', 'Simpan ulang storyboard sesuai brief dan style saat ini.', 409);
      const next = {...state, approvedHash: state.hash};
      await this.atomicJson(projectId, 'project.json', {...project, approvedBriefHash: state.briefHash, updatedAt: now()});
      await this.atomicJson(projectId, 'storyboard.json', next);
      return next;
    });
  }

  async getSnapshot(projectId: string): Promise<ProjectSnapshot> {
    const [project, revisions, candidates, comments, jobs, messages, storyboard] = await Promise.all([
      this.getProject(projectId), this.records(projectId, 'revisions', RevisionSchema),
      this.records(projectId, 'candidates', CandidateSchema), this.records(projectId, 'comments', CommentSchema),
      this.records(projectId, 'jobs', JobSchema), this.readMessages(projectId), this.getStoryboard(projectId),
    ]);
    return {project, revisions, candidates, comments, jobs, messages, storyboard};
  }

  async getCandidate(projectId: string, candidateId: string): Promise<Candidate> {
    return CandidateSchema.parse(await this.readJson(projectId, `candidates/${IdSchema.parse(candidateId)}.json`));
  }
  async getRevision(projectId: string, revisionId: string): Promise<Revision> {
    return RevisionSchema.parse(await this.readJson(projectId, `revisions/${IdSchema.parse(revisionId)}.json`));
  }
  async getJob(projectId: string, jobId: string): Promise<Job> {
    return JobSchema.parse(await this.readJson(projectId, `jobs/${IdSchema.parse(jobId)}.json`));
  }
  async getComment(projectId: string, commentId: string): Promise<Comment> {
    return CommentSchema.parse(await this.readJson(projectId, `comments/${IdSchema.parse(commentId)}.json`));
  }

  async saveCandidate(projectId: string, input: Candidate): Promise<Candidate> {
    const candidate = CandidateSchema.parse(input);
    return this.serialize(projectId, async () => {
      const project = await this.getProject(projectId);
      let previous: Candidate | undefined;
      try { previous = await this.getCandidate(projectId, candidate.id); }
      catch (error) { if (!missing(error)) throw error; }
      if (previous) {
        assertCandidateTransition(previous.status, candidate.status);
        if (previous.baseRevisionId !== candidate.baseRevisionId || previous.createdAt !== candidate.createdAt) throw new StudioError('INVALID_RECORD', 'Candidate identity cannot change.', 409);
      } else if (!candidateTerminalStatuses.has(candidate.status) && project.openCandidateId && project.openCandidateId !== candidate.id) {
        throw new StudioError('CANDIDATE_BUSY', 'Finish or discard the current candidate first.', 409);
      }
      if (candidate.status === 'ready' && (!candidate.sourceId || !candidate.buildId || !candidate.shots.length)) throw new StudioError('INVALID_CANDIDATE', 'Ready candidate needs source, build and shots.');
      await this.atomicJson(projectId, `candidates/${candidate.id}.json`, candidate);
      const openCandidateId = candidateTerminalStatuses.has(candidate.status)
        ? project.openCandidateId === candidate.id ? null : project.openCandidateId : candidate.id;
      await this.atomicJson(projectId, 'project.json', {...project, openCandidateId, updatedAt: now()});
      return candidate;
    });
  }

  async saveJob(projectId: string, input: Job): Promise<Job> {
    const job = JobSchema.parse(input);
    if (job.projectId !== projectId) throw new StudioError('INVALID_RECORD', 'Job project ID mismatch.');
    return this.serialize(projectId, async () => {
      await this.getProject(projectId);
      let previous: Job | undefined;
      try { previous = await this.getJob(projectId, job.id); }
      catch (error) { if (!missing(error)) throw error; }
      if (previous && previous.status !== job.status) {
        const next = previous.status === 'queued' ? ['running', 'failed', 'cancelled'] : previous.status === 'running' ? ['succeeded', 'failed', 'cancelled'] : [];
        if (!next.includes(job.status)) throw new StudioError('INVALID_STATE', 'Job is already terminal or has an invalid transition.', 409);
      }
      await this.atomicJson(projectId, `jobs/${job.id}.json`, job);
      return job;
    });
  }

  async saveRevision(projectId: string, input: Revision): Promise<Revision> {
    const revision = RevisionSchema.parse(input);
    return this.serialize(projectId, async () => {
      await this.getProject(projectId);
      await this.writeRevision(projectId, revision);
      return revision;
    });
  }

  private async writeRevision(projectId: string, revision: Revision): Promise<void> {
    try { await this.readJson(projectId, `revisions/${revision.id}.json`); throw new StudioError('IMMUTABLE_REVISION', 'Revision already exists.', 409); }
    catch (error) { if (!missing(error)) throw error; }
    await this.atomicJson(projectId, `revisions/${revision.id}.json`, revision);
  }

  private async assertBuildProvenance(projectId: string, buildId: string, sourceId: string, shots: Revision['shots']): Promise<void> {
    const record = await this.readJson<{kind?: unknown; id?: unknown; shots?: unknown; status?: string; sourceId?: string; sourceHash?: unknown; previewSessionId?: unknown}>(projectId, `builds/${buildId}/build.json`);
    if (record.status !== 'ready' || record.sourceId !== sourceId) throw new StudioError('BUILD_NOT_READY', 'Build is not ready for the exact source snapshot.', 409);
    // Minimal legacy records retain their original gate. Records carrying sealed
    // source evidence are verified even if the optional runtime kind is absent.
    if (record.kind === undefined && record.sourceHash === undefined && record.previewSessionId === undefined && record.id === undefined && record.shots === undefined) return;
    const development = z.object({kind: z.literal('development').optional(), id: IdSchema, status: z.literal('ready'), sourceId: IdSchema,
      sourceHash: FingerprintSchema, shots: z.array(ShotSpecSchema).min(1).max(12),
      durationFrames: z.number().int().positive(), fps: z.literal(30), width: z.literal(720), height: z.literal(1280),
      dependencyHash: z.string().min(1), runtimeHash: z.string().min(1), image: z.string().min(1),
      smokeFrames: z.array(z.number().int().nonnegative()).min(1),
    }).passthrough().safeParse(record);
    if (!development.success) throw new StudioError('BUILD_NOT_READY', 'Development preview provenance is incomplete or unsupported.', 409);
    const build = development.data;
    const manifest = SourceManifestSchema.parse(await this.readJson(projectId, `source/${sourceId}/manifest.json`));
    const timeline = JSON.stringify(shots);
    if (build.id !== buildId || manifest.sourceId !== sourceId || build.sourceHash !== manifest.sourceHash
        || JSON.stringify(build.shots) !== timeline || JSON.stringify(manifest.shots) !== timeline
        || build.durationFrames !== shots.reduce((sum, shot) => sum + shot.durationFrames, 0)
        || build.smokeFrames.some(frame => frame >= build.durationFrames)
        || new Set(manifest.files.map(file => file.path)).size !== manifest.files.length) {
      throw new StudioError('SOURCE_CHANGED', 'Development preview no longer matches its sealed source or timeline.', 409);
    }
    const files: Array<{path: string; content: string}> = [];
    let bytes = 0;
    for (const entry of manifest.files) {
      validateSourcePath(entry.path);
      const file = await this.checkedPath(projectId, `source/${sourceId}/${entry.path}`);
      const handle = await fs.open(file, 'r');
      try {
        const stat = await handle.stat();
        bytes += stat.size;
        if (stat.size > 65_536 || bytes > 524_288) throw new StudioError('INVALID_SOURCE', 'Source snapshot exceeds byte limits.');
        const content = await handle.readFile('utf8');
        if (sha256(content) !== entry.hash) throw new StudioError('SOURCE_CHANGED', 'Source file changed after preview validation.', 409);
        files.push({path: entry.path, content});
      } finally {await handle.close();}
    }
    if (sourceFingerprint(files, manifest.shots, manifest.voiceovers) !== manifest.sourceHash) throw new StudioError('SOURCE_CHANGED', 'Source manifest changed after preview validation.', 409);
    const tracks = manifest.voiceovers ?? [];
    if (new Set(tracks.map(track => track.shotId)).size !== tracks.length || new Set(tracks.map(track => track.assetId)).size !== tracks.length)
      throw new StudioError('INVALID_AUDIO', 'Duplicate voice-over tracks.');
    for (const track of tracks) {
      const shot = shots.find(shot => shot.id === track.shotId);
      if (!shot || Math.ceil(track.durationMs * 30 / 1000) > shot.durationFrames) throw new StudioError('INVALID_AUDIO', 'Voice-over does not fit its shot.');
      const file = await this.checkedPath(projectId, `source/${sourceId}/audio/${track.assetId}.wav`);
      const stat = await fs.stat(file);
      if (stat.size < 44 || stat.size > 24_000_000 || sha256(await fs.readFile(file)) !== track.hash)
        throw new StudioError('SOURCE_CHANGED', 'Voice-over changed after preview validation.', 409);
    }
  }

  async applyCandidate(projectId: string, candidateId: string, expectedRevisionId: string | null): Promise<Revision> {
    return this.serialize(projectId, async () => {
      const project = await this.getProject(projectId);
      const candidate = await this.getCandidate(projectId, candidateId);
      if (project.currentRevisionId !== expectedRevisionId || candidate.baseRevisionId !== expectedRevisionId) throw new StudioError('STALE_REVISION', 'Project changed; regenerate or review this candidate against the current revision.', 409);
      if (candidate.status !== 'ready' || !candidate.sourceId || !candidate.buildId || project.openCandidateId !== candidate.id) throw new StudioError('CANDIDATE_NOT_READY', 'Only the current ready candidate can be applied.', 409);
      await this.assertBuildProvenance(projectId, candidate.buildId, candidate.sourceId, candidate.shots);
      const revisedStoryboard = await this.appliedDirectorStoryboard(project, candidate);
      const revision = RevisionSchema.parse({id: createId(), parentRevisionId: project.currentRevisionId,
        sourceId: candidate.sourceId, buildId: candidate.buildId, summary: candidate.summary, shots: candidate.shots, createdAt: now()});
      await this.writeRevision(projectId, revision);
      if (revisedStoryboard) await this.atomicJson(projectId, 'storyboard.json', revisedStoryboard);
      await this.atomicJson(projectId, 'project.json', {...project, currentRevisionId: revision.id, openCandidateId: null, updatedAt: now()});
      await this.atomicJson(projectId, `candidates/${candidate.id}.json`, {...candidate, status: 'applied'});
      return revision;
    });
  }

  private async appliedDirectorStoryboard(project: Project, candidate: Candidate): Promise<StoryboardState | null> {
    let raw: unknown;
    try {raw = await this.readJson(project.id, `builds/${candidate.buildId}/director-revision.json`);}
    catch (error) {if (missing(error)) return null; throw error;}
    const artifact = DirectorRevisionArtifactSchema.parse(raw);
    if (!candidate.baseRevisionId || artifact.baseRevisionId !== candidate.baseRevisionId) throw new StudioError('STALE_REVISION', 'Director revision belongs to another base revision.', 409);
    const base = await this.getRevision(project.id, candidate.baseRevisionId);
    const timeline = (shots: {id: string; durationFrames: number}[]) => JSON.stringify(shots.map(({id, durationFrames}) => ({id, durationFrames})));
    if (base.sourceId !== artifact.baseSourceId || timeline(artifact.baseStoryboard.shots) !== timeline(base.shots)
        || timeline(artifact.storyboard.shots) !== timeline(candidate.shots)) throw new StudioError('INVALID_STORYBOARD', 'Director revision timeline does not match its sealed source.', 409);
    if (artifact.storyboard.shots.some((shot, index) => shot.id !== artifact.baseStoryboard.shots[index]?.id)
        || artifact.storyboard.shots.length !== artifact.baseStoryboard.shots.length
        || new Set(artifact.shotIds).size !== artifact.shotIds.length
        || artifact.shotIds.some(id => !base.shots.some(shot => shot.id === id))) throw new StudioError('INVALID_STORYBOARD', 'Director revision must retain shot identities and order.', 409);
    for (const shot of artifact.storyboard.shots) {
      if (!artifact.shotIds.includes(shot.id) && JSON.stringify(shot) !== JSON.stringify(artifact.baseStoryboard.shots.find(item => item.id === shot.id))) throw new StudioError('SHOT_OWNERSHIP', 'Director revision changed an unselected shot.', 409);
    }
    const state = await this.getStoryboard(project.id);
    if (state.hash !== artifact.projectStoryboardHash) throw new StudioError('STALE_STORYBOARD', 'Storyboard changed while the revision candidate was open.', 409);
    const draft = mergeDirectorRevisionStoryboard(state.draft, artifact);
    const hash = sha256(serializeStoryboard(draft));
    return {draft, hash, briefHash: briefHash(project.brief, project.style), approvedHash: serializeStoryboard(draft) === serializeStoryboard(artifact.storyboard) ? hash : null};
  }

  async discardCandidate(projectId: string, candidateId: string): Promise<Candidate> {
    return this.serialize(projectId, async () => {
      const project = await this.getProject(projectId);
      const candidate = await this.getCandidate(projectId, candidateId);
      if (candidate.status !== 'ready') throw new StudioError('CANDIDATE_NOT_READY', 'Only a ready candidate can be discarded.', 409);
      const discarded = CandidateSchema.parse({...candidate, status: 'discarded'});
      await this.atomicJson(projectId, `candidates/${candidate.id}.json`, discarded);
      await this.atomicJson(projectId, 'project.json', {...project, openCandidateId: project.openCandidateId === candidate.id ? null : project.openCandidateId, updatedAt: now()});
      return discarded;
    });
  }

  async restoreRevision(projectId: string, revisionId: string, expectedRevisionId: string | null): Promise<Revision> {
    return this.serialize(projectId, async () => {
      const project = await this.getProject(projectId);
      if (project.currentRevisionId !== expectedRevisionId) throw new StudioError('STALE_REVISION', 'Project changed before restore.', 409);
      if (project.openCandidateId) throw new StudioError('CANDIDATE_BUSY', 'Finish or discard the current candidate before restoring.', 409);
      const original = await this.getRevision(projectId, revisionId);
      await this.assertBuildProvenance(projectId, original.buildId, original.sourceId, original.shots);
      let restoredStoryboard: StoryboardState | null = null;
      if (project.currentRevisionId) {
        const current = await this.getRevision(projectId, project.currentRevisionId);
        const readBoard = async (buildId: string): Promise<Storyboard | null> => {
          try {return StoryboardSchema.parse((await this.readJson<{storyboard: unknown}>(projectId, `builds/${buildId}/director.json`)).storyboard);}
          catch (error) {if (missing(error)) return null; throw error;}
        };
        const [currentBoard, originalBoard, state] = await Promise.all([readBoard(current.buildId), readBoard(original.buildId), this.getStoryboard(projectId)]);
        if (currentBoard && originalBoard && state.draft && serializeStoryboard(state.draft) === serializeStoryboard(currentBoard)) {
          if (originalBoard.shots.length !== original.shots.length || originalBoard.shots.some((shot, index) => shot.id !== original.shots[index].id || shot.durationFrames !== original.shots[index].durationFrames)) throw new StudioError('INVALID_STORYBOARD', 'Restored storyboard does not match its revision timeline.', 409);
          const hash = sha256(serializeStoryboard(originalBoard));
          restoredStoryboard = {draft: originalBoard, hash, approvedHash: hash, briefHash: briefHash(project.brief, project.style)};
        }
      }
      const restored = RevisionSchema.parse({...original, id: createId(), parentRevisionId: project.currentRevisionId, summary: `Restored: ${original.summary}`.slice(0, 4000), createdAt: now()});
      await this.writeRevision(projectId, restored);
      if (restoredStoryboard) await this.atomicJson(projectId, 'storyboard.json', restoredStoryboard);
      await this.atomicJson(projectId, 'project.json', {...project, currentRevisionId: restored.id, updatedAt: now()});
      return restored;
    });
  }

  async addComment(projectId: string, input: FrameAnchor, body: string): Promise<Comment> {
    return this.serialize(projectId, async () => {
      await this.getProject(projectId);
      const anchor = FrameAnchorSchema.parse(input);
      const revision = await this.getRevision(projectId, anchor.revisionId);
      const shot = revision.shots.find((item) => item.id === anchor.shotId);
      if (!shot || anchor.localFrame >= shot.durationFrames) throw new StudioError('INVALID_ANCHOR', 'Comment frame is outside the referenced shot.');
      const comment = CommentSchema.parse({id: createId(), anchor, body, status: 'open', createdAt: now()});
      await this.atomicJson(projectId, `comments/${comment.id}.json`, comment);
      return comment;
    });
  }

  async resolveComment(projectId: string, commentId: string, status: 'open' | 'resolved' = 'resolved'): Promise<Comment> {
    return this.serialize(projectId, async () => {
      const comment = CommentSchema.parse(await this.readJson(projectId, `comments/${IdSchema.parse(commentId)}.json`));
      const updated = CommentSchema.parse({...comment, status});
      await this.atomicJson(projectId, `comments/${commentId}.json`, updated);
      return updated;
    });
  }

  async setCommentScreenshot(projectId: string, commentId: string, screenshot: string): Promise<Comment> {
    this.relativeParts(screenshot);
    return this.serialize(projectId, async () => {
      const comment = await this.getComment(projectId, commentId);
      const updated = CommentSchema.parse({...comment, screenshot});
      await this.atomicJson(projectId, `comments/${commentId}.json`, updated);
      return updated;
    });
  }

  private async readMessages(projectId: string): Promise<Message[]> {
    let raw: string;
    try { raw = await fs.readFile(await this.checkedPath(projectId, 'conversations/chat.jsonl'), 'utf8'); }
    catch (error) { if (missing(error)) return []; throw error; }
    const lines = raw.split('\n');
    const messages: Message[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      try { messages.push(MessageSchema.parse(JSON.parse(lines[i]))); }
      catch {
        if (i === lines.length - 1 && !raw.endsWith('\n')) break;
        throw new StudioError('INVALID_RECORD', 'Conversation history contains an invalid saved record.', 500);
      }
    }
    return messages;
  }

  async saveMessage(projectId: string, input: Message): Promise<Message> {
    const message = MessageSchema.parse(input);
    return this.serialize(projectId, async () => {
      await this.getProject(projectId);
      const messages = await this.readMessages(projectId);
      const existing = messages.find((item) => item.id === message.id);
      if (existing) return existing;
      const target = await this.checkedPath(projectId, 'conversations/chat.jsonl', true);
      const temporary = path.join(path.dirname(target), `.chat.${createId()}.tmp`);
      const handle = await fs.open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile([...messages, message].map((item) => JSON.stringify(item)).join('\n') + '\n');
        await handle.sync();
      } catch (error) { await handle.close(); await fs.unlink(temporary).catch(() => undefined); throw error; }
      await handle.close();
      try { await fs.rename(temporary, target); }
      catch (error) { await fs.unlink(temporary).catch(() => undefined); throw error; }
      return message;
    });
  }

  async getThread(projectId: string, role: string): Promise<string | null> {
    await this.getProject(projectId);
    try { return ThreadBindingsSchema.parse(await this.readJson(projectId, 'threads.json'))[role] ?? null; }
    catch (error) { if (missing(error)) return null; throw error; }
  }

  async setThread(projectId: string, role: string, threadId: string): Promise<void> {
    await this.serialize(projectId, async () => {
      await this.getProject(projectId);
      let bindings = {};
      try { bindings = await this.readJson(projectId, 'threads.json'); }
      catch (error) { if (!missing(error)) throw error; }
      await this.atomicJson(projectId, 'threads.json', ThreadBindingsSchema.parse({...bindings, [role]: threadId}));
    });
  }

  private async recoverInterruptedWork(): Promise<void> {
    for (const project of await this.listProjects()) {
      await this.serialize(project.id, async () => {
        const jobs = await this.records(project.id, 'jobs', JobSchema);
        const candidates = await this.records(project.id, 'candidates', CandidateSchema);
        const runs = await this.records(project.id, 'generation-runs', GenerationRunSchema);
        for (const run of runs) {
          const candidate = candidates.find(item => item.id === run.candidateId);
          const job = jobs.find(item => item.id === run.jobId);
          if (!candidate || !job || !['generate', 'revise'].includes(job.kind) || job.candidateId !== candidate.id || candidate.baseRevisionId !== run.baseRevisionId
              || candidate.shots.length !== run.shots.length || run.shots.some(shot => !candidate.shots.some(item => item.id === shot.shotId))
              || ['ready', 'applied'].includes(candidate.status) && (run.shots.some(shot => shot.status !== 'preview_ready') || candidate.sourceId !== run.sourceId || candidate.buildId !== run.buildId)) {
            throw new StudioError('INVALID_RECORD', 'Generation run does not match its candidate, job or completed shots.', 500);
          }
        }
        for (const run of runs) {
          if (run.shots.some(shot => ['queued', 'generating', 'validating'].includes(shot.status))) {
            const recovered = {...run, updatedAt: now(), shots: run.shots.map(shot => ['queued', 'generating', 'validating'].includes(shot.status)
              ? {...shot, status: 'cancelled' as const, error: 'INTERRUPTED: Studio stopped. Retry this shot explicitly.', completedAt: now()} : shot)};
            await this.atomicJson(project.id, `generation-runs/${run.candidateId}.json`, recovered);
          }
        }
        for (const job of jobs) {
          if (job.status === 'running' || job.status === 'queued') await this.atomicJson(project.id, `jobs/${job.id}.json`, {...job,
            status: 'failed', message: 'Interrupted when studio stopped. Retry explicitly.', error: 'INTERRUPTED', updatedAt: now()});
        }
        for (const candidate of candidates) {
          if (!candidateTerminalStatuses.has(candidate.status) && candidate.status !== 'ready') {
            await this.atomicJson(project.id, `candidates/${candidate.id}.json`, {...candidate, status: 'failed', error: 'Interrupted when studio stopped. Retry explicitly.'});
          }
        }
        const openCandidate = candidates.find((candidate) => candidate.id === project.openCandidateId);
        if (project.openCandidateId && (!openCandidate || openCandidate.status !== 'ready')) {
          await this.atomicJson(project.id, 'project.json', {...project, openCandidateId: null, updatedAt: now()});
        }
      });
    }
  }
}
