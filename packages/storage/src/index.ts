import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {z} from 'zod';
import {
  CandidateSchema, CommentSchema, FrameAnchorSchema, IdSchema, JobSchema, MessageSchema,
  ProjectSchema, RevisionSchema, StyleBriefSchema, StudioError, ThreadBindingsSchema, assertCandidateTransition,
  briefHash, candidateTerminalStatuses, createId, serializeBrief,
  type Candidate, type Comment, type FrameAnchor, type Job, type Message, type Project,
  type ProjectSnapshot, type Revision, type StyleBrief, type AgentProvider,
} from '@studio/studio-core';

const LockSchema = z.object({pid: z.number().int().positive(), host: z.string(), token: z.string()}).strict();
const missing = (error: unknown): boolean => (error as NodeJS.ErrnoException)?.code === 'ENOENT';
const now = (): string => new Date().toISOString();

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
      if (relativePath === 'project.json' || relativePath === 'threads.json'
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
        return schema.parse(await this.readJson(projectId, `${collection}/${file}`));
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
      return updated;
    });
  }

  async getSnapshot(projectId: string): Promise<ProjectSnapshot> {
    const [project, revisions, candidates, comments, jobs, messages] = await Promise.all([
      this.getProject(projectId), this.records(projectId, 'revisions', RevisionSchema),
      this.records(projectId, 'candidates', CandidateSchema), this.records(projectId, 'comments', CommentSchema),
      this.records(projectId, 'jobs', JobSchema), this.readMessages(projectId),
    ]);
    return {project, revisions, candidates, comments, jobs, messages};
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

  async applyCandidate(projectId: string, candidateId: string, expectedRevisionId: string | null): Promise<Revision> {
    return this.serialize(projectId, async () => {
      const project = await this.getProject(projectId);
      const candidate = await this.getCandidate(projectId, candidateId);
      if (project.currentRevisionId !== expectedRevisionId || candidate.baseRevisionId !== expectedRevisionId) throw new StudioError('STALE_REVISION', 'Project changed; regenerate or review this candidate against the current revision.', 409);
      if (candidate.status !== 'ready' || !candidate.sourceId || !candidate.buildId || project.openCandidateId !== candidate.id) throw new StudioError('CANDIDATE_NOT_READY', 'Only the current ready candidate can be applied.', 409);
      const build = await this.readJson<{status?: string; sourceId?: string}>(projectId, `builds/${candidate.buildId}/build.json`);
      if (build.status !== 'ready' || build.sourceId !== candidate.sourceId) throw new StudioError('BUILD_NOT_READY', 'Candidate build is not ready or source does not match.', 409);
      const revision = RevisionSchema.parse({id: createId(), parentRevisionId: project.currentRevisionId,
        sourceId: candidate.sourceId, buildId: candidate.buildId, summary: candidate.summary, shots: candidate.shots, createdAt: now()});
      await this.writeRevision(projectId, revision);
      await this.atomicJson(projectId, 'project.json', {...project, currentRevisionId: revision.id, openCandidateId: null, updatedAt: now()});
      await this.atomicJson(projectId, `candidates/${candidate.id}.json`, {...candidate, status: 'applied'});
      return revision;
    });
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
      const build = await this.readJson<{status?: string; sourceId?: string}>(projectId, `builds/${original.buildId}/build.json`);
      if (build.status !== 'ready' || build.sourceId !== original.sourceId) throw new StudioError('BUILD_NOT_READY', 'Saved revision build is not ready or source does not match.', 409);
      const restored = RevisionSchema.parse({...original, id: createId(), parentRevisionId: project.currentRevisionId, summary: `Restored: ${original.summary}`.slice(0, 4000), createdAt: now()});
      await this.writeRevision(projectId, restored);
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
        for (const job of await this.records(project.id, 'jobs', JobSchema)) {
          if (job.status === 'running') await this.atomicJson(project.id, `jobs/${job.id}.json`, {...job,
            status: 'failed', message: 'Interrupted when studio stopped. Retry explicitly.', error: 'INTERRUPTED', updatedAt: now()});
        }
        const candidates = await this.records(project.id, 'candidates', CandidateSchema);
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
