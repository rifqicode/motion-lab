import http, {type IncomingMessage, type ServerResponse} from 'node:http';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {randomBytes, timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {IdSchema, FrameAnchorSchema, StyleBriefSchema, StoryboardSchema, ShotDiscussionContextSchema, StudioError} from '@studio/studio-core';
import {StudioService} from './service.js';
import {DEFAULT_BRIEF} from './prompts.js';
import {proxyPreview, proxyPreviewSocket, validatePreviewPath} from './preview-proxy.js';

const requestId = z.string().uuid();
const expectedRevision = IdSchema.nullable();
const mime: Record<string, string> = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json; charset=utf-8'};
const safeEqual = (a: string, b: string) => Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'access-control-allow-origin': '*'});
  response.end(JSON.stringify(value));
}

async function body(request: IncomingMessage): Promise<unknown> {
  if (!(request.headers['content-type'] ?? '').startsWith('application/json')) throw new StudioError('CONTENT_TYPE', 'Gunakan application/json.', 415);
  let bytes = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += data.byteLength;
    if (bytes > 128 * 1024) throw new StudioError('BODY_LIMIT', 'Request terlalu besar.', 413);
    chunks.push(data);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new StudioError('INVALID_JSON', 'JSON tidak valid.'); }
}

async function regularFile(root: string, relative: string): Promise<string> {
  const full = path.resolve(root, relative);
  const base = await fs.realpath(root);
  const actual = await fs.realpath(full);
  if (actual !== base && !actual.startsWith(base + path.sep)) throw new StudioError('INVALID_PATH', 'Path di luar direktori yang diizinkan.', 403);
  if (!(await fs.stat(actual)).isFile()) throw new StudioError('NOT_FOUND', 'File tidak ditemukan.', 404);
  return actual;
}

export interface StudioHttpOptions {
  service: StudioService;
  editorDir: string;
  port: number;
  previewPort: number;
}

export async function createStudioHttp(options: StudioHttpOptions): Promise<{close: () => Promise<void>}> {
  const {service, port, previewPort} = options;
  const session = randomBytes(32).toString('hex');
  const acceptedOrigins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
  const acceptedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const previewHosts = new Set([`127.0.0.1:${previewPort}`, `localhost:${previewPort}`]);

  async function records(projectId: string, collection: string): Promise<unknown[]> {
    let entries: string[];
    try { entries = await fs.readdir(path.join(service.store.projectPath(projectId), collection)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
    const values = await Promise.all(entries.filter(name => /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}\.json$/.test(name))
      .map(name => service.store.readJson<Record<string, unknown>>(projectId, `${collection}/${name}`)));
    return values.sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')));
  }

  async function previewTarget(projectId: string, version: string) {
    let buildId = version;
    if (version === 'live') {
      const current = await service.store.readJson<{buildId: string}>(projectId, 'preview/current.json');
      buildId = IdSchema.parse(current.buildId);
    }
    const record = await service.store.readJson<{status: string; kind?: string}>(projectId, `builds/${IdSchema.parse(buildId)}/build.json`);
    if (record.status !== 'ready') throw new StudioError('BUILD_NOT_READY', 'Preview belum siap.', 409);
    return record.kind === 'development'
      ? service.builder.previewTarget(service.store.projectPath(projectId), buildId, version === 'live') : null;
  }

  function authenticated(request: IncomingMessage): void {
    const token = request.headers['x-studio-session'];
    if (typeof token !== 'string' || !safeEqual(token, session)) throw new StudioError('UNAUTHORIZED', 'Sesi studio tidak valid. Buka ulang halaman studio.', 401);
    const origin = request.headers.origin;
    if (origin && !acceptedOrigins.has(origin)) throw new StudioError('INVALID_ORIGIN', 'Origin tidak diizinkan.', 403);
    const fetchSite = request.headers['sec-fetch-site'];
    if (fetchSite && !['same-origin', 'none'].includes(String(fetchSite))) throw new StudioError('INVALID_ORIGIN', 'Request lintas origin ditolak.', 403);
  }

  const app = http.createServer((request, response) => {
    void (async () => {
      if (!acceptedHosts.has(request.headers.host ?? '')) throw new StudioError('INVALID_HOST', 'Host tidak diizinkan.', 403);
      const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
      if (url.pathname === '/health' && request.method === 'GET') return json(response, 200, {ok: true});
      if (url.pathname === '/favicon.ico' && request.method === 'GET') { response.writeHead(204); response.end(); return; }
      if (url.pathname.startsWith('/api/')) {
        authenticated(request);
        const route = url.pathname.split('/').filter(Boolean);
        const method = request.method;
        if (url.pathname === '/api/status' && method === 'GET') return json(response, 200, await service.status(url.searchParams.get('refresh') === '1'));
        if (url.pathname === '/api/projects' && method === 'GET') return json(response, 200, {projects: await service.store.listProjects(), defaultBrief: DEFAULT_BRIEF});
        if (url.pathname === '/api/projects' && method === 'POST') {
          const input = z.object({name: z.string().trim().min(1).max(120), brief: z.string().max(100_000).optional(), agentProvider: z.enum(['codex', 'antigravity']).optional()}).strict().parse(await body(request));
          return json(response, 201, await service.store.createProject(input.name, input.brief ?? '', input.agentProvider ?? 'codex'));
        }
        if (route[1] === 'projects' && route[2]) {
          const projectId = IdSchema.parse(route[2]);
          if (route[3] === 'voiceovers') {
            if (route.length === 4 && method === 'GET') {
              const sourceId = url.searchParams.get('sourceId');
              return json(response, 200, await service.voiceovers(projectId, sourceId ? IdSchema.parse(sourceId) : undefined));
            }
            if (route.length === 4 && method === 'POST') {
              const input = z.object({requestId, expectedRevisionId: IdSchema, shotId: IdSchema,
                text: z.string().trim().min(1).max(3000), volume: z.number().min(0).max(1).default(1), fitDuration: z.boolean().default(true)}).strict().parse(await body(request));
              return json(response, 202, await service.generateVoiceover(projectId, input.requestId, input));
            }
            if (route.length === 6 && route[5] === 'audio' && method === 'GET') {
              const sourceId = IdSchema.parse(url.searchParams.get('sourceId'));
              const file = await service.voiceoverFile(projectId, sourceId, IdSchema.parse(route[4]));
              response.writeHead(200, {'content-type': 'audio/wav', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff'});
              createReadStream(file).pipe(response); return;
            }
          }
          if (route.length === 3 && method === 'GET') {
            const snapshot = await service.store.getSnapshot(projectId);
            const [generationRuns, exports, qaReports] = await Promise.all([records(projectId, 'generation-runs'), records(projectId, 'exports'), records(projectId, 'qa')]);
            let preview = null;
            const candidate = snapshot.candidates.find(item => item.id === snapshot.project.openCandidateId);
            if (candidate?.buildId) {
              const record = await service.store.readJson<{kind?: string}>(projectId, `builds/${candidate.buildId}/build.json`).catch(() => null);
              const published = await service.store.readJson<{buildId: string}>(projectId, 'preview/current.json').catch(() => null);
              if (record?.kind === 'development' && published?.buildId === candidate.buildId) preview = {buildId: candidate.buildId, sessionId: 'live', candidateId: candidate.id};
            }
            return json(response, 200, {...snapshot, generationRuns, exports, qaReports, preview});
          }
          if (route[3] === 'generation-runs' && route[4]) {
            const candidateId = IdSchema.parse(route[4]);
            if (route.length === 5 && method === 'GET') return json(response, 200, await service.store.readJson(projectId, `generation-runs/${candidateId}.json`));
            if (route[5] === 'shots' && route[6] && route.length === 8 && method === 'POST') {
              const shotId = IdSchema.parse(route[6]);
              if (route[7] === 'cancel') {
                await service.cancelShot(projectId, candidateId, shotId);
                return json(response, 200, {cancelled: true});
              }
              if (route[7] === 'retry') {
                const input = z.object({requestId}).strict().parse(await body(request));
                return json(response, 202, await service.retryShot(projectId, input.requestId, candidateId, shotId));
              }
            }
          }
          if (route[3] === 'exports') {
            if (route.length === 4 && method === 'POST') {
              const input = z.object({requestId, revisionId: IdSchema}).strict().parse(await body(request));
              return json(response, 202, await service.exportRevision(projectId, input.requestId, input.revisionId));
            }
            if (route[4] && route[5] === 'file' && route.length === 6 && method === 'GET') {
              const jobId = IdSchema.parse(route[4]);
              const artifact = await service.store.readJson<{status: string; file: string}>(projectId, `exports/${jobId}.json`);
              if (artifact.status !== 'ready') throw new StudioError('EXPORT_NOT_READY', 'Export belum siap.', 409);
              const relative = path.relative(service.store.projectPath(projectId), artifact.file);
              const file = await regularFile(service.store.projectPath(projectId), relative);
              response.writeHead(200, {'content-type': 'video/mp4', 'content-disposition': `attachment; filename="motionlab-${jobId}.mp4"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff'});
              const stream = createReadStream(file);
              stream.on('error', () => response.destroy());
              response.on('close', () => stream.destroy());
              stream.pipe(response);
              return;
            }
          }
          if (route[3] === 'visual-qa' && route.length === 4 && method === 'POST') {
            const input = z.object({requestId, buildId: IdSchema}).strict().parse(await body(request));
            return json(response, 202, await service.visualQa(projectId, input.requestId, input.buildId));
          }
          if (route[3] === 'preview' && route[4] === 'recover' && route.length === 5 && method === 'POST') {
            const input = z.object({failedBuildId: IdSchema, fallbackBuildId: IdSchema, frame: z.number().int().nonnegative()}).strict().parse(await body(request));
            const recovered = await service.recoverPreview(projectId, input.failedBuildId, input.fallbackBuildId, input.frame);
            service.events.publish(projectId, 'preview.recovered', {...input, recovered});
            return json(response, 200, {recovered});
          }
          if (route[3] === 'agent' && route.length === 4 && method === 'PUT') {
            const input = z.object({provider: z.enum(['codex', 'antigravity'])}).strict().parse(await body(request));
            service.assertIdle(projectId);
            const result = await service.store.updateAgent(projectId, input.provider);
            service.events.publish(projectId, 'project.updated', {});
            return json(response, 200, result);
          }
          if (route[3] === 'events' && route.length === 4 && method === 'GET') {
            await service.store.getProject(projectId);
            const after = Number(request.headers['last-event-id'] ?? url.searchParams.get('after') ?? 0);
            if (!Number.isSafeInteger(after) || after < 0) throw new StudioError('INVALID_EVENT_ID', 'Event ID tidak valid.');
            response.writeHead(200, {'content-type': 'text/event-stream', 'cache-control': 'no-store', 'connection': 'keep-alive', 'x-content-type-options': 'nosniff'});
            response.flushHeaders();
            const close = service.events.subscribe(projectId, response, after);
            response.on('close', close);
            return;
          }
          if (route[3] === 'brief' && route.length === 4 && method === 'PUT') {
            const input = z.object({brief: z.string().max(100_000)}).strict().parse(await body(request));
            service.assertIdle(projectId);
            const result = await service.store.updateBrief(projectId, input.brief);
            service.events.publish(projectId, 'project.updated', {});
            return json(response, 200, result);
          }
          if (route[3] === 'style' && route.length === 4 && method === 'PUT') {
            const input = z.object({style: StyleBriefSchema}).strict().parse(await body(request));
            service.assertIdle(projectId);
            const result = await service.store.updateStyle(projectId, input.style);
            service.events.publish(projectId, 'project.updated', {});
            return json(response, 200, result);
          }
          if (route[3] === 'storyboard' && route[4] === 'approve' && route.length === 5 && method === 'POST') {
            const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
            const input = z.union([z.object({storyboardHash: fingerprint}).strict(), z.object({briefHash: fingerprint}).strict()]).parse(await body(request));
            service.assertIdle(projectId);
            if ('storyboardHash' in input) {
              const result = await service.store.approveStoryboard(projectId, input.storyboardHash);
              service.events.publish(projectId, 'storyboard.approved', {storyboardHash: result.approvedHash});
              service.events.publish(projectId, 'project.updated', {});
              return json(response, 200, result);
            }
            const {briefHash} = await import('@studio/studio-core');
            const project = await service.store.getProject(projectId);
            if (briefHash(project.brief, project.style) !== input.briefHash) throw new StudioError('STALE_BRIEF', 'Brief atau style berubah sebelum disetujui.', 409);
            const result = await service.store.approveBrief(projectId);
            service.events.publish(projectId, 'project.updated', {});
            return json(response, 200, result);
          }
          if (route[3] === 'storyboard' && route.length === 4) {
            if (method === 'GET') return json(response, 200, await service.store.getStoryboard(projectId));
            if (method === 'PUT') {
              const input = z.object({storyboard: StoryboardSchema, expectedHash: z.string().regex(/^[a-f0-9]{64}$/).nullable()}).strict().parse(await body(request));
              service.assertIdle(projectId);
              const result = await service.store.saveStoryboard(projectId, input.storyboard, input.expectedHash);
              service.events.publish(projectId, 'project.updated', {});
              return json(response, 200, result);
            }
          }
          if (route[3] === 'director' && route.length === 4 && method === 'POST') {
            const input = z.object({requestId, expectedHash: z.string().regex(/^[a-f0-9]{64}$/).nullable()}).strict().parse(await body(request));
            return json(response, 202, await service.direct(projectId, input.requestId, input.expectedHash));
          }
          if (route[3] === 'messages' && route.length === 4 && method === 'POST') {
            const common = {requestId, text: z.string().trim().min(1).max(12_000), shotContext: ShotDiscussionContextSchema.optional()};
            const input = z.union([
              z.object({...common, mode: z.literal('discuss').optional()}).strict(),
              z.object({...common, mode: z.literal('revise'), expectedRevisionId: IdSchema}).strict(),
            ]).parse(await body(request));
            if (input.mode === 'revise') return json(response, 202, await service.reviseFromDirector(projectId, input.requestId, input.text, input.expectedRevisionId, input.shotContext));
            return json(response, 202, await service.chat(projectId, input.requestId, input.text, input.shotContext));
          }
          if (route[3] === 'generations' && route.length === 4 && method === 'POST') {
            const input = z.object({requestId, expectedRevisionId: expectedRevision, approvedStoryboardHash: z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict().parse(await body(request));
            return json(response, 202, await service.generate(projectId, input.requestId, input.expectedRevisionId, undefined, input.approvedStoryboardHash));
          }
          if (route[3] === 'comments' && route.length === 4 && method === 'POST') {
            const input = z.object({anchor: FrameAnchorSchema, body: z.string().trim().min(1).max(8000)}).strict().parse(await body(request));
            const result = await service.store.addComment(projectId, input.anchor, input.body);
            service.events.publish(projectId, 'project.updated', {});
            return json(response, 201, result);
          }
          if (route[3] === 'comments' && route[4]) {
            const commentId = IdSchema.parse(route[4]);
            if (route.length === 5 && method === 'PATCH') {
              const input = z.object({status: z.enum(['open', 'resolved'])}).strict().parse(await body(request));
              const result = await service.store.resolveComment(projectId, commentId, input.status);
              service.events.publish(projectId, 'project.updated', {});
              return json(response, 200, result);
            }
            if (route[5] === 'revisions' && route.length === 6 && method === 'POST') {
              const input = z.object({requestId, expectedRevisionId: expectedRevision}).strict().parse(await body(request));
              return json(response, 202, await service.generate(projectId, input.requestId, input.expectedRevisionId, commentId));
            }
          }
          if (route[3] === 'candidates' && route[4]) {
            const candidateId = IdSchema.parse(route[4]);
            if (route.length === 5 && method === 'GET') return json(response, 200, await service.candidateDetails(projectId, candidateId));
            if (route.length === 6 && method === 'POST' && ['apply', 'discard'].includes(route[5])) {
              const input = z.object({expectedRevisionId: expectedRevision}).strict().parse(await body(request));
              service.assertIdle(projectId);
              const result = route[5] === 'apply'
                ? await service.store.applyCandidate(projectId, candidateId, input.expectedRevisionId)
                : await service.store.discardCandidate(projectId, candidateId);
              service.events.publish(projectId, 'project.headChanged', result);
              return json(response, 200, result);
            }
          }
          if (route[3] === 'revisions' && route[4]) {
            const revisionId = IdSchema.parse(route[4]);
            if (route[5] === 'source' && route.length === 6 && method === 'GET') return json(response, 200, await service.revisionSource(projectId, revisionId));
            if (route[5] === 'restore' && route.length === 6 && method === 'POST') {
              const input = z.object({expectedRevisionId: expectedRevision}).strict().parse(await body(request));
              service.assertIdle(projectId);
              const result = await service.store.restoreRevision(projectId, revisionId, input.expectedRevisionId);
              service.events.publish(projectId, 'project.headChanged', result);
              return json(response, 200, result);
            }
          }
        }
        if (route[1] === 'jobs' && route[2] && route[3] === 'cancel' && route.length === 4 && method === 'POST') {
          await service.cancel(IdSchema.parse(route[2]));
          return json(response, 200, {cancelled: true});
        }
        throw new StudioError('NOT_FOUND', 'Endpoint tidak ditemukan.', 404);
      }
      if (request.method !== 'GET') throw new StudioError('METHOD_NOT_ALLOWED', 'Metode tidak diizinkan.', 405);
      const origin = request.headers.origin;
      const fetchSite = request.headers['sec-fetch-site'];
      if ((origin && !acceptedOrigins.has(origin)) || (fetchSite && !['same-origin', 'none'].includes(String(fetchSite)))) throw new StudioError('INVALID_ORIGIN', 'Halaman studio tidak tersedia lintas origin.', 403);
      const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
      const file = await regularFile(options.editorDir, relative);
      if (relative === 'index.html') {
        const html = (await fs.readFile(file, 'utf8')).replace('<!-- STUDIO_BOOTSTRAP -->', `<meta name="studio-session" content="${session}"><meta name="studio-preview-origin" content="http://127.0.0.1:${previewPort}">`);
        response.writeHead(200, {'content-type': mime['.html'], 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'content-security-policy': `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self'; frame-src http://127.0.0.1:${previewPort}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`, 'x-content-type-options': 'nosniff'});
        response.end(html);
      } else {
        response.writeHead(200, {'content-type': mime[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff'});
        response.end(await fs.readFile(file));
      }
    })().catch(error => handleError(response, error));
  });

  const preview = http.createServer((request, response) => {
    void (async () => {
      if (!previewHosts.has(request.headers.host ?? '') || request.method !== 'GET') throw new StudioError('INVALID_REQUEST', 'Preview request tidak diizinkan.', 403);
      const url = new URL(request.url ?? '/', `http://127.0.0.1:${previewPort}`);
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] !== 'p' || parts.length < 4) throw new StudioError('NOT_FOUND', 'Preview tidak ditemukan.', 404);
      const projectId = IdSchema.parse(parts[1]);
      const buildId = IdSchema.parse(parts[2]);
      const relative = decodeURIComponent(parts.slice(3).join('/'));
      validatePreviewPath(url.pathname);
      if (!relative) throw new StudioError('INVALID_PATH', 'Path preview tidak valid.', 403);
      const target = await previewTarget(projectId, buildId);
      if (target) { proxyPreview(request, response, target.socketPath, previewPort); return; }
      const record = await service.store.readJson<{status: string}>(projectId, `builds/${buildId}/build.json`);
      if (record.status !== 'ready') throw new StudioError('BUILD_NOT_READY', 'Build belum siap.', 409);
      const file = await regularFile(path.join(service.store.projectPath(projectId), 'builds', buildId, 'preview'), relative);
      response.writeHead(200, {'content-type': path.extname(file) === '.wav' ? 'audio/wav' : mime[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff', 'access-control-allow-origin': '*', 'content-security-policy': `default-src 'none'; script-src 'self' 'unsafe-inline' http://127.0.0.1:${previewPort} http://localhost:${previewPort}; style-src 'self' 'unsafe-inline' http://127.0.0.1:${previewPort} http://localhost:${previewPort}; img-src 'self' data: blob: http://127.0.0.1:${previewPort} http://localhost:${previewPort}; font-src 'self' http://127.0.0.1:${previewPort} http://localhost:${previewPort}; connect-src 'none'; media-src data: http://127.0.0.1:${previewPort} http://localhost:${previewPort}; object-src 'none'; base-uri 'none'; form-action 'none'; sandbox allow-scripts`});
      response.end(await fs.readFile(file));
    })().catch(error => handleError(response, error));
  });
  const sockets = new Set<import('node:stream').Duplex>();
  preview.on('upgrade', (request, socket, head) => {
    void (async () => {
      if (!previewHosts.has(request.headers.host ?? '')) throw new Error('Invalid preview host.');
      const origin = request.headers.origin;
      if (origin !== 'null' && origin !== `http://127.0.0.1:${previewPort}` && origin !== `http://localhost:${previewPort}`) throw new Error('Invalid preview origin.');
      const url = new URL(request.url ?? '/', `http://127.0.0.1:${previewPort}`);
      validatePreviewPath(url.pathname);
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] !== 'p' || parts.length !== 4 || parts[3] !== 'hmr') throw new Error('Invalid HMR endpoint.');
      const target = await previewTarget(IdSchema.parse(parts[1]), IdSchema.parse(parts[2]));
      if (!target) throw new Error('Preview has no HMR.');
      sockets.add(socket); socket.on('close', () => sockets.delete(socket));
      proxyPreviewSocket(request, socket, head, target.socketPath, previewPort);
    })().catch(() => socket.destroy());
  });
  const listen = (server: http.Server, listenPort: number) => new Promise<void>((resolve, reject) => {
    server.once('error', reject); server.listen(listenPort, '127.0.0.1', () => {server.off('error', reject); resolve();});
  });
  try { await listen(preview, previewPort); await listen(app, port); }
  catch (error) { preview.close(); app.close(); throw error; }
  return {close: async () => {
    for (const socket of sockets) socket.destroy();
    service.events.close();
    await Promise.all([app, preview].map(server => new Promise<void>(resolve => {server.close(() => resolve()); server.closeAllConnections();})));
  }};
}

function handleError(response: ServerResponse, error: unknown): void {
  if (response.headersSent) { response.end(); return; }
  if (error instanceof StudioError) return json(response, error.status, {code: error.code, message: error.message, retryable: error.status >= 500});
  if (error instanceof z.ZodError) return json(response, 400, {code: 'INVALID_INPUT', message: error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ').slice(0, 2000), retryable: false});
  if (error && typeof error === 'object' && 'code' in error && ['ENOENT', 'ENOTDIR'].includes(String(error.code))) return json(response, 404, {code: 'NOT_FOUND', message: 'File tidak ditemukan.', retryable: false});
  const message = error instanceof Error ? error.message : 'Unexpected error.';
  json(response, 500, {code: 'INTERNAL_ERROR', message: message.replace(/Bearer\s+\S+|sk-[A-Za-z0-9_-]+/g, '[redacted]').slice(0, 2400), retryable: true});
}
