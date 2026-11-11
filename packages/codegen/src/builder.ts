import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {IdSchema, StudioError, sha256, sourceFingerprint, type ShotSpec} from '@studio/studio-core';
import {readSourceFiles, validateSourceFiles, type SourceManifest} from './source.js';
import {StudioPreview, type PreviewInput, type PreviewTarget} from './preview.js';

const bounded = (value: string): string => value.slice(-16_000);

export interface BuildResult {
  kind?: 'development';
  previewSessionId?: string;
  previousBuildId?: string;
  id: string;
  sourceId: string;
  status: 'ready';
  shots: ShotSpec[];
  durationFrames: number;
  fps: 30;
  width: 720;
  height: 1280;
  sourceHash: string;
  dependencyHash: string;
  runtimeHash: string;
  previewDir: string;
  createdAt: string;
  smokeFrames: number[];
  image: string;
  isolationChecks: Record<string, boolean>;
}

export type BuildProgressCallback = (stage: string) => void | Promise<void>;
export interface BuilderOptions {repoRoot: string; runtimeImage?: string; onProgress?: BuildProgressCallback}
interface Mount {source: string; target: string; readonly?: boolean}

export class StudioBuilder {
  private readonly repoRoot: string;
  private readonly image: string;
  private readonly workerDir: string;
  private readonly onProgress?: BuildProgressCallback;
  private readonly development: StudioPreview;

  constructor(options: BuilderOptions) {
    this.repoRoot = path.resolve(options.repoRoot);
    this.image = options.runtimeImage ?? process.env.STUDIO_RUNTIME_IMAGE ?? 'local-node';
    this.workerDir = path.join(this.repoRoot, 'apps/worker/runtime');
    this.onProgress = options.onProgress;
    this.development = new StudioPreview({...options, repoRoot: this.repoRoot}, () => this.status(), async image => ({
      dependencyHash: await this.dependenciesHash(), runtimeHash: await this.runtimeHash(image),
    }));
  }

  async status(): Promise<{available: boolean; image: string; reason?: string}> {
    return {available: true, image: 'local-node'};
  }

  private async dependenciesHash(): Promise<string> {
    return sha256(await fs.readFile(path.join(this.repoRoot, 'pnpm-lock.yaml')));
  }

  private async runtimeHash(_image = 'local-node'): Promise<string> {
    const names = (await fs.readdir(this.workerDir)).filter((name) => /\.(mjs|tsx|ts|template)$/.test(name)).sort();
    const files = await Promise.all(names.map(async (name) => [name, await fs.readFile(path.join(this.workerDir, name), 'utf8')]));
    return sha256(JSON.stringify({image: 'local-node', files}));
  }

  private dependencyMounts(): Mount[] {
    return [
      {source: path.join(this.repoRoot, 'node_modules'), target: path.join(this.repoRoot, 'node_modules'), readonly: true},
      ...['apps/cli', 'packages/renderer'].flatMap((part) => [
        {source: path.join(this.repoRoot, part, 'node_modules'), target: path.join(this.repoRoot, part, 'node_modules'), readonly: true},
        {source: path.join(this.repoRoot, part, 'package.json'), target: path.join(this.repoRoot, part, 'package.json'), readonly: true},
      ]),
      {source: this.workerDir, target: '/opt/studio-worker', readonly: true},
    ];
  }

  private async reportProgress(stage: string, onProgress?: BuildProgressCallback): Promise<void> {
    for (const callback of new Set([this.onProgress, onProgress])) if (callback) await callback(stage);
  }

  private async runContainer(image: string, mounts: Mount[], args: string[], options: {name: string; timeoutMs: number; signal?: AbortSignal; onProgress?: BuildProgressCallback}): Promise<void> {
    if (options.signal?.aborted) throw new StudioError('CANCELLED', 'Build cancelled.', 409);

    const mountMap = new Map(mounts.map(m => [m.target, m.source]));
    const sourceDir = mountMap.get('/work/source');
    const outputDir = mountMap.get('/work/output');
    const buildDir = mountMap.get('/work/build');
    const exportDir = mountMap.get('/work/export');
    const screenshotDir = mountMap.get('/work/screenshot');
    const screenshotInput = mountMap.get('/work/input.json');
    const renderDir = buildDir ? path.join(buildDir, 'render') : (outputDir ? path.join(outputDir, 'render') : undefined);

    const scriptPath = args[0] ?? 'build.mjs';
    const scriptFile = path.join(this.workerDir, path.basename(scriptPath));
    const scriptArgs = args.slice(1).map(arg => {
      if (outputDir && arg.startsWith('/work/output/')) {
        return path.join(outputDir, arg.slice('/work/output/'.length));
      }
      if (sourceDir && arg.startsWith('/work/source/')) {
        return path.join(sourceDir, arg.slice('/work/source/'.length));
      }
      if (exportDir && arg.startsWith('/work/export/')) {
        return path.join(exportDir, arg.slice('/work/export/'.length));
      }
      return arg;
    });

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: '/tmp/studio-home',
      TMPDIR: '/tmp',
      NODE_ENV: 'production',
      STUDIO_LOCAL_RUNTIME: '1',
      ...(sourceDir ? {STUDIO_SOURCE_DIR: sourceDir} : {}),
      ...(outputDir ? {STUDIO_OUTPUT_DIR: outputDir} : {}),
      ...(exportDir ? {STUDIO_EXPORT_DIR: exportDir, STUDIO_EXPORT_INPUT: path.join(exportDir, 'input.json')} : {}),
      ...(renderDir ? {STUDIO_RENDER_DIR: renderDir} : {}),
      ...(screenshotDir ? {STUDIO_SCREENSHOT_DIR: screenshotDir} : {}),
      ...(screenshotInput ? {STUDIO_SCREENSHOT_INPUT: screenshotInput} : {}),
    };

    let diagnostic = '';
    let lineBuffer = '';
    let stopped: StudioError | null = null;
    let progressWork = Promise.resolve();
    let progressError: unknown;

    const child = spawn(process.execPath, [scriptFile, ...scriptArgs], {
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stop = (reason: StudioError) => {
      if (stopped) return;
      stopped = reason;
      child.kill('SIGTERM');
    };
    const abort = () => stop(new StudioError('CANCELLED', 'Build cancelled.', 409));
    options.signal?.addEventListener('abort', abort, {once: true});
    const timer = setTimeout(() => stop(new StudioError('BUILD_TIMEOUT', 'Restricted build exceeded its time budget.', 408)), options.timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      diagnostic = bounded(diagnostic + text);
      lineBuffer = bounded(lineBuffer + text);
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() ?? '';
      for (const line of lines) {
        try {
          const event = JSON.parse(line) as {type?: string; stage?: string};
          const stage = (event.type === 'progress' && typeof event.stage === 'string')
            ? event.stage
            : (typeof event.stage === 'string' ? event.stage : undefined);
          if (stage && ['typecheck', 'browser-build', 'render-build', 'smoke-checking'].includes(stage)) {
            progressWork = progressWork.then(() => this.reportProgress(stage, options.onProgress)).catch(error => { progressError ??= error; });
          }
        } catch { /* Non-event output remains in the bounded build diagnostic. */ }
      }
    });

    child.stderr.on('data', (chunk: Buffer) => { diagnostic = bounded(diagnostic + chunk.toString()); });

    try {
      const code = await new Promise<number | null>((resolve, reject) => {
        child.once('error', reject);
        child.once('close', resolve);
      });
      await progressWork;
      if (stopped) throw stopped;
      if (code !== 0) {
        if (/Timed out after \d+ ms while trying to connect to the browser\b/i.test(diagnostic)) {
          throw new StudioError('BROWSER_START_TIMEOUT', `Chromium belum berhasil mulai dalam batas waktu startup. Source tersimpan; periksa runtime lalu coba ulang build.\n${diagnostic}`, 503);
        }
        throw new StudioError('BUILD_FAILED', `Restricted worker exited with code ${code}.\n${diagnostic}`, 422);
      }
      if (progressError) throw new StudioError('PROGRESS_FAILED', `Build progress could not be saved: ${progressError instanceof Error ? progressError.message : String(progressError)}`, 500);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      await progressWork;
    }
  }

  async build(input: {projectDir: string; sourceId: string; shots: ShotSpec[]; buildId: string; signal?: AbortSignal; onProgress?: BuildProgressCallback}): Promise<BuildResult> {
    const {projectDir, sourceId, buildId, shots, signal} = input;
    IdSchema.parse(sourceId); IdSchema.parse(buildId);
    const runtime = await this.status();
    if (!runtime.available) throw new StudioError('RUNTIME_UNAVAILABLE', runtime.reason ?? 'Restricted runtime is unavailable.', 503);
    const files = await readSourceFiles(projectDir, sourceId);
    validateSourceFiles({baseRevisionId: null, summary: 'Validate the sealed build input.', shots, changedFiles: files, deletedFiles: []});
    const sourceDir = path.join(projectDir, 'source', sourceId);
    const manifest = JSON.parse(await fs.readFile(path.join(sourceDir, 'manifest.json'), 'utf8')) as SourceManifest;
    if (JSON.stringify(shots) !== JSON.stringify(manifest.shots)) throw new StudioError('INVALID_SOURCE', 'Build shots do not match the source snapshot.');
    const buildsDir = path.join(projectDir, 'builds');
    await fs.mkdir(buildsDir, {recursive: true});
    if ((await fs.lstat(buildsDir)).isSymbolicLink()) throw new StudioError('INVALID_PATH', 'Build directory may not be a symbolic link.');
    const buildDir = path.join(buildsDir, buildId);
    await fs.mkdir(buildDir, {mode: 0o700});
    const dependencyHash = await this.dependenciesHash();
    const runtimeHash = await this.runtimeHash(runtime.image);
    const hostSentinelPath = path.join(projectDir, `.isolation-${buildId}`);
    await fs.writeFile(hostSentinelPath, 'Local runtime isolation fixture; no secret material.\n', {flag: 'wx', mode: 0o600});
    const request = {repoRoot: this.repoRoot, sourceId, buildId, shots, voiceovers: manifest.voiceovers ?? [], hostSentinelPath, files: files.map((file) => ({path: file.path}))};
    await fs.writeFile(path.join(buildDir, 'input.json'), JSON.stringify(request), {flag: 'wx', mode: 0o600});
    try {
      await this.runContainer(runtime.image, [
        {source: sourceDir, target: '/work/source', readonly: true},
        {source: buildDir, target: '/work/output'},
      ], ['/opt/studio-worker/build.mjs', '/work/output/input.json'], {name: `studio-build-${buildId}`, timeoutMs: 240_000, signal, onProgress: input.onProgress});
      if (signal?.aborted) throw new StudioError('CANCELLED', 'Build cancelled.', 409);
      const checkedFiles = await readSourceFiles(projectDir, sourceId);
      if (sourceFingerprint(checkedFiles, shots, manifest.voiceovers) !== manifest.sourceHash) throw new StudioError('SOURCE_CHANGED', 'Source changed while its build was running.', 409);
      const result = JSON.parse(await fs.readFile(path.join(buildDir, 'result.json'), 'utf8')) as {durationFrames: number; smokeFrames: number[]; isolationChecks: Record<string, boolean>};
      const record: BuildResult = {id: buildId, sourceId, status: 'ready', shots, durationFrames: result.durationFrames,
        fps: 30, width: 720, height: 1280, sourceHash: manifest.sourceHash, dependencyHash, runtimeHash,
        previewDir: path.join(buildDir, 'preview'), createdAt: new Date().toISOString(), smokeFrames: result.smokeFrames, image: runtime.image, isolationChecks: result.isolationChecks};
      const temporary = path.join(buildDir, '.build.json.tmp');
      await fs.writeFile(temporary, JSON.stringify(record, null, 2) + '\n', {flag: 'wx', mode: 0o600});
      await fs.rename(temporary, path.join(buildDir, 'build.json'));
      await this.reportProgress('ready', input.onProgress);
      return record;
    } catch (error) {
      await fs.writeFile(path.join(buildDir, 'failure.json'), JSON.stringify({status: signal?.aborted ? 'cancelled' : 'failed',
        message: error instanceof Error ? error.message : String(error), createdAt: new Date().toISOString()}, null, 2)).catch(() => undefined);
      throw error;
    } finally { await fs.unlink(hostSentinelPath).catch(() => undefined); }
  }

  async screenshot(input: {projectDir: string; buildId: string; frame: number; outputPath: string; signal?: AbortSignal}): Promise<void> {
    IdSchema.parse(input.buildId);
    const buildDir = path.join(input.projectDir, 'builds', input.buildId);
    const record = JSON.parse(await fs.readFile(path.join(buildDir, 'build.json'), 'utf8')) as BuildResult;
    if (record.status !== 'ready' || record.id !== input.buildId) throw new StudioError('BUILD_NOT_READY', 'Comment screenshot requires a ready build.', 409);
    if (!Number.isInteger(input.frame) || input.frame < 0 || input.frame >= record.durationFrames) throw new StudioError('INVALID_FRAME', 'Screenshot frame is outside the composition.');
    const relativeOutput = path.relative(path.resolve(input.projectDir), path.resolve(input.outputPath));
    if (!relativeOutput || relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput) || !relativeOutput.endsWith('.png')) throw new StudioError('INVALID_PATH', 'Screenshot output must be a PNG inside its project.');
    let outputParent = path.resolve(input.projectDir);
    for (const part of relativeOutput.split(path.sep).slice(0, -1)) {
      outputParent = path.join(outputParent, part);
      await fs.mkdir(outputParent, {recursive: true});
      if ((await fs.lstat(outputParent)).isSymbolicLink()) throw new StudioError('INVALID_PATH', 'Screenshot output directory may not be a symbolic link.');
    }
    const outputExists = await fs.lstat(input.outputPath).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
    if (outputExists?.isSymbolicLink() || outputExists && !outputExists.isFile()) throw new StudioError('INVALID_PATH', 'Screenshot output must be a regular file.');
    await readSourceFiles(input.projectDir, record.sourceId);
    const manifest = JSON.parse(await fs.readFile(path.join(input.projectDir, 'source', record.sourceId, 'manifest.json'), 'utf8')) as SourceManifest;
    if (manifest.sourceHash !== record.sourceHash || JSON.stringify(manifest.shots) !== JSON.stringify(record.shots))
      throw new StudioError('SOURCE_CHANGED', 'Screenshot source does not match the referenced revision.', 409);
    const dependencyHash = await this.dependenciesHash();
    const runtimeHash = await this.runtimeHash(record.image);
    const revalidated = dependencyHash !== record.dependencyHash || runtimeHash !== record.runtimeHash;
    const temporaryDir = await fs.mkdtemp(path.join(path.dirname(input.outputPath), '.capture-'));
    try {
      const stagedPng = path.join(temporaryDir, 'frame.png');
      if (record.kind === 'development' || revalidated) {
        // A changed trusted runtime needs fresh browser evidence, not a new AI proposal.
        const sessionId = revalidated ? `capture-${sha256(JSON.stringify({buildId: record.id, dependencyHash, runtimeHash})).slice(0, 32)}` : record.id;
        await this.development.screenshot(input.projectDir, record, input.frame, stagedPng, input.signal, sessionId);
      } else {
        const inputPath = path.join(temporaryDir, 'input.json');
        await fs.writeFile(inputPath, JSON.stringify({repoRoot: this.repoRoot, frame: input.frame}), {flag: 'wx', mode: 0o600});
        await this.runContainer(record.image, [
          {source: buildDir, target: '/work/build', readonly: true},
          {source: inputPath, target: '/work/input.json', readonly: true},
          {source: temporaryDir, target: '/work/screenshot'},
        ], ['/opt/studio-worker/screenshot.mjs'], {name: `studio-shot-${input.buildId}-${input.frame}`, timeoutMs: 90_000, signal: input.signal});
      }
      if (input.signal?.aborted) throw new StudioError('CANCELLED', 'Screenshot cancelled.', 409);
      const checkedFiles = await readSourceFiles(input.projectDir, record.sourceId);
      if (sourceFingerprint(checkedFiles, record.shots, manifest.voiceovers) !== record.sourceHash)
        throw new StudioError('SOURCE_CHANGED', 'Source changed during screenshot validation.', 409);
      if (dependencyHash !== await this.dependenciesHash() || runtimeHash !== await this.runtimeHash(record.image))
        throw new StudioError('BUILD_CHANGED', 'Runtime changed during screenshot validation. Retry the comment revision.', 409);
      const stagedEvidence = path.join(temporaryDir, 'capture.json');
      await fs.writeFile(stagedEvidence, JSON.stringify({schemaVersion: 1, buildId: record.id, sourceId: record.sourceId,
        sourceHash: record.sourceHash, frame: input.frame, width: record.width, height: record.height, fps: record.fps,
        revalidated, dependencyHash, runtimeHash, originalDependencyHash: record.dependencyHash,
        originalRuntimeHash: record.runtimeHash, createdAt: new Date().toISOString()}, null, 2), {flag: 'wx', mode: 0o600});
      await fs.rename(stagedPng, input.outputPath);
      // Collection readers reserve visible *.json filenames for domain records.
      const evidencePath = path.join(path.dirname(input.outputPath), `.${path.basename(input.outputPath, '.png')}.capture.json`);
      await fs.rename(stagedEvidence, evidencePath);
    } finally { await fs.rm(temporaryDir, {recursive: true, force: true}); }
  }

  async preview(input: PreviewInput): Promise<BuildResult> { return this.development.publish(input); }

  async previewTarget(projectDir: string, buildId: string, live = false): Promise<PreviewTarget> {
    return this.development.target(projectDir, buildId, live);
  }

  async close(): Promise<void> { await this.development.close(); }

  async recoverPreview(projectDir: string, failedBuildId: string, fallbackBuildId: string): Promise<boolean> {
    return this.development.recover(projectDir, failedBuildId, fallbackBuildId);
  }

  async export(input: {projectDir: string; buildId: string; exportId: string; signal?: AbortSignal; onProgress?: BuildProgressCallback}): Promise<{id: string; file: string; durationFrames: number; fps: number; width: number; height: number}> {
    IdSchema.parse(input.buildId); IdSchema.parse(input.exportId);
    const original = JSON.parse(await fs.readFile(path.join(input.projectDir, 'builds', input.buildId, 'build.json'), 'utf8')) as BuildResult;
    if (original.status !== 'ready' || original.id !== input.buildId) throw new StudioError('BUILD_NOT_READY', 'Export requires a validated snapshot.', 409);
    const production = await this.build({projectDir: input.projectDir, sourceId: original.sourceId, shots: original.shots,
      buildId: input.exportId, signal: input.signal, onProgress: input.onProgress});
    const exportDir = path.join(input.projectDir, 'exports', input.exportId);
    await fs.mkdir(exportDir, {recursive: true});
    const manifest = JSON.parse(await fs.readFile(path.join(input.projectDir, 'source', original.sourceId, 'manifest.json'), 'utf8')) as SourceManifest;
    await fs.writeFile(path.join(exportDir, 'input.json'), JSON.stringify({repoRoot: this.repoRoot, expected: {
      durationFrames: production.durationFrames, fps: production.fps, width: production.width, height: production.height, hasAudio: Boolean(manifest.voiceovers?.length),
    }}));
    await this.runContainer(production.image, [
      {source: path.join(input.projectDir, 'builds', input.exportId), target: '/work/build', readonly: true},
      {source: exportDir, target: '/work/export'},
    ], ['/opt/studio-worker/export.mjs'], {name: `studio-export-${input.exportId}`, timeoutMs: 30 * 60_000, signal: input.signal});
    const verified = JSON.parse(await fs.readFile(path.join(exportDir, 'verified.json'), 'utf8'));
    if (verified.status !== 'verified' || verified.durationFrames !== production.durationFrames || verified.width !== production.width
        || verified.height !== production.height || Math.abs(verified.fps - production.fps) > 0.01) throw new StudioError('EXPORT_VERIFICATION', 'Rendered video metadata did not match the accepted timeline.', 422);
    const result = {id: input.exportId, file: path.join(exportDir, 'video.mp4'), durationFrames: production.durationFrames,
      fps: production.fps, width: production.width, height: production.height};
    await fs.writeFile(path.join(exportDir, 'export.json'), JSON.stringify({...result, sourceId: original.sourceId,
      sourceHash: original.sourceHash, buildId: input.buildId, createdAt: new Date().toISOString(), status: 'ready'}));
    return result;
  }
}
