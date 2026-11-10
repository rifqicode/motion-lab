import http, {type IncomingMessage, type ServerResponse} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes, timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {IdSchema, FrameAnchorSchema, StyleBriefSchema, StudioError} from '@studio/studio-core';
import {StudioService} from './service.js';
import {DEFAULT_BRIEF} from './prompts.js';

const requestId = z.string().uuid();
const expectedRevision = IdSchema.nullable();
const mime: Record<string, string> = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json; charset=utf-8'};
const safeEqual = (a: string, b: string) => Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff'});
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
          return json(response, 201, await service.store.createProject(input.name, input.brief ?? DEFAULT_BRIEF, input.agentProvider ?? 'codex'));
        }
        if (route[1] === 'projects' && route[2]) {
          const projectId = IdSchema.parse(route[2]);
          if (route.length === 3 && method === 'GET') return json(response, 200, await service.store.getSnapshot(projectId));
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
            const input = z.object({briefHash: z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(await body(request));
            service.assertIdle(projectId);
            const {briefHash} = await import('@studio/studio-core');
            const project = await service.store.getProject(projectId);
            if (briefHash(project.brief, project.style) !== input.briefHash) throw new StudioError('STALE_BRIEF', 'Brief atau style berubah sebelum disetujui.', 409);
            const result = await service.store.approveBrief(projectId);
            service.events.publish(projectId, 'project.updated', {});
            return json(response, 200, result);
          }
          if (route[3] === 'messages' && route.length === 4 && method === 'POST') {
            const input = z.object({requestId, text: z.string().trim().min(1).max(12_000)}).strict().parse(await body(request));
            return json(response, 202, await service.chat(projectId, input.requestId, input.text));
          }
          if (route[3] === 'generations' && route.length === 4 && method === 'POST') {
            const input = z.object({requestId, expectedRevisionId: expectedRevision}).strict().parse(await body(request));
            return json(response, 202, await service.generate(projectId, input.requestId, input.expectedRevisionId));
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
        response.writeHead(200, {'content-type': mime['.html'], 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'content-security-policy': `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; connect-src 'self'; frame-src http://127.0.0.1:${previewPort}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`, 'x-content-type-options': 'nosniff'});
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
      if (!relative || relative.includes('..') || relative.includes('\\')) throw new StudioError('INVALID_PATH', 'Path preview tidak valid.', 403);
      const record = await service.store.readJson<{status: string}>(projectId, `builds/${buildId}/build.json`);
      if (record.status !== 'ready') throw new StudioError('BUILD_NOT_READY', 'Build belum siap.', 409);
      const file = await regularFile(path.join(service.store.projectPath(projectId), 'builds', buildId, 'preview'), relative);
      response.writeHead(200, {'content-type': mime[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff', 'access-control-allow-origin': '*', 'content-security-policy': "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; sandbox allow-scripts"});
      response.end(await fs.readFile(file));
    })().catch(error => handleError(response, error));
  });
  const listen = (server: http.Server, listenPort: number) => new Promise<void>((resolve, reject) => {
    server.once('error', reject); server.listen(listenPort, '127.0.0.1', () => {server.off('error', reject); resolve();});
  });
  try { await listen(preview, previewPort); await listen(app, port); }
  catch (error) { preview.close(); app.close(); throw error; }
  return {close: async () => {
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
