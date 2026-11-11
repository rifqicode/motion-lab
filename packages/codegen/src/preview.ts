import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {spawn, type ChildProcess} from 'node:child_process';
import {IdSchema, StudioError, sha256, type ShotSpec, type VoiceoverTrack} from '@studio/studio-core';
import {readSourceFiles, validateSourceFiles, type SourceManifest} from './source.js';
import type {BuildResult, BuildProgressCallback, BuilderOptions} from './builder.js';

export interface PreviewTarget {socketPath: string; basePath: string}
interface Session extends PreviewTarget {
  name: string;
  workspace: string;
  output: string;
  image: string;
  key: string;
  process?: ChildProcess;
  diagnosticBuffer?: string;
}
export interface PreviewInput {projectDir: string; sourceId: string; shots: ShotSpec[]; buildId: string; frames?: number[]; signal?: AbortSignal; onProgress?: BuildProgressCallback}

export function previewFrames(shots: ShotSpec[]): number[] {
  let offset = 0;
  const frames: number[] = [];
  for (const shot of shots) {
    frames.push(offset, offset + Math.floor(shot.durationFrames / 2), offset + shot.durationFrames - 1);
    offset += shot.durationFrames;
  }
  return [...new Set(frames)];
}

export function previewComposition(shots: ShotSpec[], buildId: string, sessionId: string, voiceovers: VoiceoverTrack[] = []): string {
  let offset = 0;
  const imports = shots.map((shot, index) => `import Shot${index} from './src/shots/${shot.id}.tsx';`).join('\n');
  const slots = shots.map((shot, index) => {
    const track = voiceovers.find(track => track.shotId === shot.id);
    const audio = track ? `<Audio src={new URL(${JSON.stringify(`./audio/${track.assetId}.wav`)},import.meta.url).href} volume={${track.volume}} />` : '';
    const slot = `<Sequence from={${offset}} durationInFrames={${shot.durationFrames}}><Slot component={Shot${index}} shotId=${JSON.stringify(shot.id)} durationInFrames={${shot.durationFrames}} />${audio}</Sequence>`;
    offset += shot.durationFrames;
    return slot;
  }).join('');
  return `import React from 'react';import {Audio,Sequence,useCurrentFrame} from 'remotion';\n${imports}\nconst Slot=({component:Component,shotId,durationInFrames})=><Component shotId={shotId} frame={useCurrentFrame()} fps={30} width={720} height={1280} durationInFrames={durationInFrames} assets={{}}/>;\nexport const meta=${JSON.stringify({buildId, sessionId, durationFrames: offset, fps: 30, width: 720, height: 1280})};\nexport const StudioComposition=()=> <div style={{width:720,height:1280,position:'relative',overflow:'hidden',background:'#101418'}}>${slots}</div>;\n`;
}

export class StudioPreview {
  private sessions = new Map<string, Session>();
  private pending = new Map<string, Promise<Session>>();
  private queues = new Map<string, Promise<unknown>>();
  constructor(private readonly options: BuilderOptions, private readonly runtime: () => Promise<{available: boolean; image: string; reason?: string}>,
    private readonly hashes: (image: string) => Promise<{dependencyHash: string; runtimeHash: string}>) {}

  private async request<T>(session: PreviewTarget, route: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
      const request = http.request({socketPath: session.socketPath, path: route, method: body ? 'POST' : 'GET',
        headers: body ? {'content-type': 'application/json'} : {}, timeout: 150_000, signal}, response => {
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', chunk => {raw += chunk; if (raw.length > 100_000) request.destroy(new Error('Preview response too large.'));});
        response.on('end', () => {
          try {
            const data = JSON.parse(raw);
            if (response.statusCode !== 200) reject(new StudioError('PREVIEW_VALIDATION', data.error ?? 'Preview validation failed.', 422));
            else resolve(data);
          } catch (error) { reject(error); }
        });
      });
      request.on('timeout', () => request.destroy(new StudioError('PREVIEW_TIMEOUT', 'Preview validation timed out.', 408)));
      request.on('error', reject);
      request.end(body ? JSON.stringify(body) : undefined);
    });
  }

  private async ensure(projectDir: string, sessionId: string): Promise<Session> {
    IdSchema.parse(sessionId);
    const projectId = IdSchema.parse(path.basename(projectDir));
    const key = `${path.resolve(projectDir)}:${sessionId}`;
    const existing = this.sessions.get(key);
    if (existing) {
      try { await this.request(existing, '/__studio/health'); return existing; }
      catch {
        existing.process?.kill('SIGTERM');
        this.sessions.delete(key);
      }
    }
    const pending = this.pending.get(key);
    if (pending) return pending;
    const operation = this.start(projectDir, projectId, sessionId, key);
    this.pending.set(key, operation);
    try {const session = await operation; this.sessions.set(key, session); return session;}
    finally {this.pending.delete(key);}
  }

  private async start(projectDir: string, projectId: string, sessionId: string, key: string): Promise<Session> {
    const runtime = await this.runtime();
    if (!runtime.available) throw new StudioError('RUNTIME_UNAVAILABLE', runtime.reason ?? 'Preview runtime unavailable.', 503);
    const workspace = path.join(projectDir, 'preview', sessionId);
    const output = path.join(os.tmpdir(), `studio-preview-${sha256(key).slice(0, 20)}`);
    const name = `studio-preview-${sha256(key).slice(0, 20)}`;
    const basePath = `/p/${projectId}/${sessionId}/`;
    await fs.mkdir(workspace, {recursive: true, mode: 0o700});
    await fs.mkdir(output, {recursive: true, mode: 0o700});
    const rootStat = await fs.lstat(workspace);
    const outputStat = await fs.lstat(output);
    if (rootStat.isSymbolicLink() || outputStat.isSymbolicLink()) throw new StudioError('INVALID_PATH', 'Preview workspace must not be a symlink.');
    const sentinel = path.join(projectDir, `.preview-isolation-${sha256(key).slice(0, 12)}`);
    await fs.writeFile(sentinel, 'Non-secret isolation fixture.\n', {mode: 0o600});
    await fs.writeFile(path.join(workspace, 'session.json'), JSON.stringify({repoRoot: this.options.repoRoot, basePath,
      previewPort: Number(process.env.STUDIO_PREVIEW_PORT ?? 4181), hostSentinelPath: sentinel}));

    const scriptPath = path.join(this.options.repoRoot, 'apps/worker/runtime/dev-server.mjs');
    let diagnosticBuffer = '';
    const child = spawn(process.execPath, [scriptPath], {
      env: {
        ...process.env,
        STUDIO_SOURCE_DIR: workspace,
        STUDIO_OUTPUT_DIR: output,
        STUDIO_LOCAL_RUNTIME: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', chunk => {
      diagnosticBuffer = (diagnosticBuffer + chunk.toString()).slice(-16_000);
      if (session) session.diagnosticBuffer = diagnosticBuffer;
    });
    child.stderr?.on('data', chunk => {
      diagnosticBuffer = (diagnosticBuffer + chunk.toString()).slice(-16_000);
      if (session) session.diagnosticBuffer = diagnosticBuffer;
    });
    child.on('error', err => {
      diagnosticBuffer = (diagnosticBuffer + `\nProcess error: ${err.message}`).slice(-16_000);
      if (session) session.diagnosticBuffer = diagnosticBuffer;
    });

    const session: Session = {name, workspace, output, image: runtime.image, key, basePath, socketPath: path.join(output, 'runtime.sock'), process: child, diagnosticBuffer};
    try {
      const deadline = Date.now() + 30_000;
      let last: unknown;
      while (Date.now() < deadline) {
        if (child.exitCode !== null) {
          throw new Error(`dev-server exited prematurely with code ${child.exitCode}`);
        }
        try {await this.request(session, '/__studio/health'); return session;}
        catch (error) {last = error; await new Promise(resolve => setTimeout(resolve, 100));}
      }
      throw new StudioError('PREVIEW_START_FAILED', `Preview runtime did not start: ${diagnosticBuffer || String(last)}`, 503);
    } catch (error) {
      child.kill('SIGTERM');
      throw error;
    } finally {await fs.unlink(sentinel).catch(() => undefined);}
  }

  private serialize<T>(projectDir: string, operation: () => Promise<T>): Promise<T> {
    const key = path.resolve(projectDir);
    const next = (this.queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(operation);
    this.queues.set(key, next);
    void next.finally(() => {if (this.queues.get(key) === next) this.queues.delete(key);}).catch(() => undefined);
    return next;
  }

  private async stage(session: Session, input: PreviewInput): Promise<{sourceHash: string; frames: number[]}> {
    const {buildId, shots} = input;
    IdSchema.parse(buildId); IdSchema.parse(input.sourceId);
    const files = await readSourceFiles(input.projectDir, input.sourceId);
    validateSourceFiles({baseRevisionId: null, summary: 'Validate preview source.', shots, changedFiles: files, deletedFiles: []});
    const manifest = JSON.parse(await fs.readFile(path.join(input.projectDir, 'source', input.sourceId, 'manifest.json'), 'utf8')) as SourceManifest;
    if (JSON.stringify(manifest.shots) !== JSON.stringify(shots)) throw new StudioError('INVALID_SOURCE', 'Preview shot metadata does not match sealed source.');
    const version = path.join(session.workspace, 'versions', buildId);
    const existing = await fs.lstat(version).catch((error: NodeJS.ErrnoException) => {if (error.code === 'ENOENT') return null; throw error;});
    if (existing?.isSymbolicLink()) throw new StudioError('INVALID_PATH', 'Preview version must not be a symlink.');
    if (existing) {
      const meta = JSON.parse(await fs.readFile(path.join(version, 'meta.json'), 'utf8')) as {sourceId: string; sourceHash: string};
      if (meta.sourceId !== input.sourceId || meta.sourceHash !== manifest.sourceHash) throw new StudioError('IMMUTABLE_BUILD', 'Preview version already belongs to a different source snapshot.', 409);
    } else {
      const temp = path.join(session.workspace, `pending-${buildId}`);
      await fs.mkdir(temp, {recursive: true, mode: 0o700});
      for (const file of files) {
        const filePath = path.join(temp, file.path);
        await fs.mkdir(path.dirname(filePath), {recursive: true, mode: 0o700});
        await fs.writeFile(filePath, file.content, {flag: 'wx', mode: 0o600});
      }
      for (const track of manifest.voiceovers ?? []) {
        await fs.mkdir(path.join(temp, 'audio'), {recursive: true});
        await fs.copyFile(path.join(input.projectDir, 'source', input.sourceId, 'audio', `${track.assetId}.wav`), path.join(temp, 'audio', `${track.assetId}.wav`));
      }
      const composition = previewComposition(shots, buildId, path.basename(session.workspace), manifest.voiceovers);
      await fs.writeFile(path.join(temp, 'active.tsx'), composition);
      await fs.copyFile(path.join(this.options.repoRoot, 'apps/worker/runtime/probe-client.template'), path.join(temp, 'entry.tsx'));
      await fs.writeFile(path.join(temp, 'probe.html'), this.html('./entry.tsx'));
      await fs.writeFile(path.join(temp, 'meta.json'), JSON.stringify({buildId, sourceId: input.sourceId, files: files.map(file => ({path: file.path})), shots,
        sourceHash: manifest.sourceHash, durationFrames: shots.reduce((sum, shot) => sum + shot.durationFrames, 0)}));
      await fs.mkdir(path.dirname(version), {recursive: true});
      await fs.rename(temp, version);
    }
    const duration = shots.reduce((sum, shot) => sum + shot.durationFrames, 0);
    if (input.frames?.some(frame => !Number.isInteger(frame) || frame < 0 || frame >= duration)) throw new StudioError('INVALID_FRAME', 'Preview check frame is outside the composition.');
    return {sourceHash: manifest.sourceHash, frames: [...new Set([...previewFrames(shots), ...(input.frames ?? [])])]};
  }

  private html(entry: string): string {
    return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Preview MotionLab</title><style>html,body,#root{margin:0;width:100%;height:100%;overflow:hidden;background:#101418;color:#fff}</style></head><body><main id="root"></main><script type="module" src="${entry}"></script></body></html>`;
  }

  async publish(input: PreviewInput): Promise<BuildResult> {
    return this.serialize(input.projectDir, async () => {
      if (input.signal?.aborted) throw new StudioError('CANCELLED', 'Preview cancelled.');
      IdSchema.parse(input.buildId);
      if (await fs.access(path.join(input.projectDir, 'builds', input.buildId, 'build.json')).then(() => true, () => false))
        throw new StudioError('IMMUTABLE_BUILD', 'A validated preview artifact already exists for this version.', 409);
      const session = await this.ensure(input.projectDir, 'live');
      const staged = await this.stage(session, input);
      await input.onProgress?.('typecheck');
      const checked = await this.request<{captures: Array<{frame: number; file: string}>; isolationChecks: Record<string, boolean>; issues?: unknown[]}>(session, '/__studio/check', {buildId: input.buildId, frames: staged.frames}, input.signal).catch(async error => {
        if (input.signal?.aborted) throw error;
        const diag = session.diagnosticBuffer ?? '';
        throw new StudioError('PREVIEW_VALIDATION', `${error instanceof Error ? error.message : String(error)}\n${diag}`, 422);
      });
      if (input.signal?.aborted) throw new StudioError('CANCELLED', 'Preview cancelled.');
      const buildDir = path.join(input.projectDir, 'builds', input.buildId);
      await fs.mkdir(buildDir, {recursive: true});
      await fs.mkdir(path.join(buildDir, 'smoke'), {recursive: true});
      for (const capture of checked.captures) await fs.copyFile(path.join(session.output, 'evidence', input.buildId, `${capture.frame}.png`), path.join(buildDir, 'smoke', `${capture.frame}.png`));
      const hashes = await this.hashes(session.image);
      if (input.signal?.aborted) throw new StudioError('CANCELLED', 'Preview cancelled.');
      const prior = await fs.readFile(path.join(input.projectDir, 'preview', 'current.json'), 'utf8').then(raw => JSON.parse(raw) as {buildId: string}, (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (prior) IdSchema.parse(prior.buildId);
      const record: BuildResult = {id: input.buildId, sourceId: input.sourceId, status: 'ready', shots: input.shots,
        kind: 'development', previewSessionId: 'live', durationFrames: input.shots.reduce((sum, shot) => sum + shot.durationFrames, 0),
        ...(prior ? {previousBuildId: prior.buildId} : {}),
        fps: 30, width: 720, height: 1280, sourceHash: staged.sourceHash, ...hashes, previewDir: session.workspace,
        createdAt: new Date().toISOString(), smokeFrames: staged.frames, image: session.image, isolationChecks: checked.isolationChecks};
      await fs.writeFile(path.join(buildDir, '.build.json.tmp'), JSON.stringify(record, null, 2));
      await fs.rename(path.join(buildDir, '.build.json.tmp'), path.join(buildDir, 'build.json'));
      await fs.writeFile(path.join(buildDir, 'preview-qa.json'), JSON.stringify({status: 'passed', checkType: 'runtime-and-geometry',
        sourceHash: staged.sourceHash, checkedFrames: staged.frames, issues: checked.issues ?? [], visualReview: 'not-run'}));
      await this.entry(session);
      const active = `export {StudioComposition,meta} from './versions/${input.buildId}/active.tsx';\n`;
      await fs.writeFile(path.join(session.workspace, '.active.pending'), active);
      if (input.signal?.aborted) throw new StudioError('CANCELLED', 'Preview cancelled.');
      await fs.rename(path.join(session.workspace, '.active.pending'), path.join(session.workspace, 'active.tsx'));
      await fs.writeFile(path.join(input.projectDir, 'preview', '.current.pending'), JSON.stringify({buildId: input.buildId, sourceId: input.sourceId}));
      await fs.rename(path.join(input.projectDir, 'preview', '.current.pending'), path.join(input.projectDir, 'preview', 'current.json'));
      await input.onProgress?.('ready');
      return record;
    });
  }

  async target(projectDir: string, buildId: string, live = false): Promise<PreviewTarget> {
    IdSchema.parse(buildId);
    const record = JSON.parse(await fs.readFile(path.join(projectDir, 'builds', buildId, 'build.json'), 'utf8')) as BuildResult;
    if (record.status !== 'ready' || record.kind !== 'development') throw new StudioError('PREVIEW_NOT_READY', 'Development preview unavailable.', 409);
    const session = await this.ensure(projectDir, live ? 'live' : buildId);
    await this.entry(session);
    if (!(await fs.access(path.join(session.workspace, 'active.tsx')).then(() => true, () => false))) {
      await this.stage(session, {projectDir, sourceId: record.sourceId, shots: record.shots, buildId});
      await this.entry(session);
      await fs.writeFile(path.join(session.workspace, 'active.tsx'), `export {StudioComposition,meta} from './versions/${buildId}/active.tsx';\n`);
    }
    return {socketPath: session.socketPath, basePath: session.basePath};
  }

  private async entry(session: Session): Promise<void> {
    const entry = path.join(session.workspace, 'entry.tsx');
    const template = await fs.readFile(path.join(this.options.repoRoot, 'apps/worker/runtime/dev-client.template'), 'utf8');
    const current = await fs.readFile(entry, 'utf8').catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (current !== template) await fs.writeFile(entry, template);
    const index = path.join(session.workspace, 'index.html');
    if (!(await fs.access(index).then(() => true, () => false))) await fs.writeFile(index, this.html('./entry.tsx'));
  }

  async screenshot(projectDir: string, record: BuildResult, frame: number, outputPath: string, signal?: AbortSignal, sessionId = record.id): Promise<void> {
    return this.serialize(projectDir, async () => {
      if (signal?.aborted) throw new StudioError('CANCELLED', 'Screenshot cancelled.', 409);
      const session = await this.ensure(projectDir, sessionId);
      const staged = await this.stage(session, {projectDir, sourceId: record.sourceId, shots: record.shots, buildId: record.id, frames: [frame]});
      if (staged.sourceHash !== record.sourceHash) throw new StudioError('SOURCE_CHANGED', 'Screenshot source does not match the referenced revision.', 409);
      await this.request(session, '/__studio/check', {buildId: record.id, frames: [frame]}, signal);
      if (signal?.aborted) throw new StudioError('CANCELLED', 'Screenshot cancelled.', 409);
      await fs.copyFile(path.join(session.output, 'evidence', record.id, `${frame}.png`), outputPath);
    });
  }

  async recover(projectDir: string, failedBuildId: string, fallbackBuildId: string): Promise<boolean> {
    IdSchema.parse(failedBuildId); IdSchema.parse(fallbackBuildId);
    return this.serialize(projectDir, async () => {
      const pointer = path.join(projectDir, 'preview', 'current.json');
      const current = JSON.parse(await fs.readFile(pointer, 'utf8')) as {buildId: string};
      if (current.buildId !== failedBuildId) return false;
      const failed = JSON.parse(await fs.readFile(path.join(projectDir, 'builds', failedBuildId, 'build.json'), 'utf8')) as BuildResult;
      if (failed.id !== failedBuildId || failed.kind !== 'development' || failed.previousBuildId !== fallbackBuildId)
        throw new StudioError('INVALID_FALLBACK', 'Fallback must be the preceding validated version from this live preview.', 409);
      const fallback = JSON.parse(await fs.readFile(path.join(projectDir, 'builds', fallbackBuildId, 'build.json'), 'utf8')) as BuildResult;
      if (fallback.status !== 'ready' || fallback.kind !== 'development' || fallback.id !== fallbackBuildId) throw new StudioError('PREVIEW_NOT_READY', 'Fallback preview is not validated.', 409);
      const session = await this.ensure(projectDir, 'live');
      const staged = await this.stage(session, {projectDir, buildId: fallbackBuildId, sourceId: fallback.sourceId, shots: fallback.shots});
      if (staged.sourceHash !== fallback.sourceHash) throw new StudioError('SOURCE_CHANGED', 'Fallback preview source no longer matches its validation.', 409);
      await fs.writeFile(path.join(session.workspace, '.active.pending'), `export {StudioComposition,meta} from './versions/${fallbackBuildId}/active.tsx';\n`);
      await fs.rename(path.join(session.workspace, '.active.pending'), path.join(session.workspace, 'active.tsx'));
      await fs.writeFile(path.join(projectDir, 'preview', '.current.pending'), JSON.stringify({buildId: fallbackBuildId, sourceId: fallback.sourceId}));
      await fs.rename(path.join(projectDir, 'preview', '.current.pending'), pointer);
      return true;
    });
  }

  async close(): Promise<void> {
    await Promise.allSettled([...this.pending.values()]);
    for (const session of this.sessions.values()) {
      session.process?.kill('SIGTERM');
    }
    this.sessions.clear();
  }
}
