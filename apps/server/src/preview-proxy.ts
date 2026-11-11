import http, {type IncomingMessage, type ServerResponse} from 'node:http';
import type {Duplex} from 'node:stream';
import {StudioError} from '@studio/studio-core';

export function validatePreviewPath(pathname: string): string {
  let decoded: string;
  try { decoded = decodeURIComponent(pathname); }
  catch { throw new StudioError('INVALID_PATH', 'Path preview tidak valid.', 403); }
  if (decoded.includes('..') || /[\\\0]/.test(decoded)
      || decoded.split('/').some(part => (part.startsWith('.') && !['.vite', '.pnpm', '.remotion', '.cache'].includes(part)) || part === '__studio' || part === 'session.json')) {
    throw new StudioError('INVALID_PATH', 'Path preview tidak diizinkan.', 403);
  }
  return decoded;
}

export function proxyPreview(request: IncomingMessage, response: ServerResponse, socketPath: string, previewPort: number): void {
  const upstream = http.request({socketPath, path: request.url, method: 'GET',
    headers: {host: `127.0.0.1:${previewPort}`, accept: request.headers.accept ?? '*/*'}}, result => {
    response.writeHead(result.statusCode ?? 502, {
      'content-type': result.headers['content-type'] ?? 'application/octet-stream',
      'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
      'access-control-allow-origin': '*',
      'content-security-policy': `default-src 'none'; script-src 'self' 'unsafe-inline' http://127.0.0.1:${previewPort} http://localhost:${previewPort}; style-src 'self' 'unsafe-inline' http://127.0.0.1:${previewPort} http://localhost:${previewPort}; img-src 'self' data: blob: http://127.0.0.1:${previewPort} http://localhost:${previewPort}; font-src 'self' http://127.0.0.1:${previewPort} http://localhost:${previewPort}; connect-src http://127.0.0.1:${previewPort} ws://127.0.0.1:${previewPort} http://localhost:${previewPort} ws://localhost:${previewPort}; media-src data: http://127.0.0.1:${previewPort} http://localhost:${previewPort}; object-src 'none'; base-uri 'none'; form-action 'none'; sandbox allow-scripts`,
    });
    result.pipe(response);
  });
  upstream.setTimeout(30_000, () => upstream.destroy(new Error('Preview request timed out.')));
  upstream.on('error', () => {
    if (!response.headersSent) response.writeHead(502, {'content-type': 'text/plain'});
    response.end('Runtime preview tidak tersedia.');
  });
  response.on('close', () => upstream.destroy());
  upstream.end();
}

export function proxyPreviewSocket(request: IncomingMessage, socket: Duplex, head: Buffer, socketPath: string, previewPort: number): void {
  const upstream = http.request({socketPath, path: request.url, headers: {
    host: `127.0.0.1:${previewPort}`, connection: 'Upgrade', upgrade: 'websocket',
    'sec-websocket-key': request.headers['sec-websocket-key'],
    'sec-websocket-version': request.headers['sec-websocket-version'],
    ...(request.headers['sec-websocket-protocol'] ? {'sec-websocket-protocol': request.headers['sec-websocket-protocol']} : {}),
  }});
  upstream.on('upgrade', (response, peer, upstreamHead) => {
    const headers = Object.entries(response.headers).flatMap(([key, value]) => value === undefined ? [] : [`${key}: ${Array.isArray(value) ? value.join(', ') : value}`]);
    socket.write(`HTTP/1.1 101 Switching Protocols\r\n${headers.join('\r\n')}\r\n\r\n`);
    if (upstreamHead.length) socket.write(upstreamHead);
    if (head.length) peer.write(head);
    peer.pipe(socket); socket.pipe(peer);
    const cleanup = () => {peer.destroy(); socket.destroy();};
    peer.on('error', cleanup); socket.on('error', cleanup);
    socket.on('close', () => peer.destroy()); peer.on('close', () => socket.destroy());
  });
  upstream.on('response', () => socket.destroy());
  upstream.on('error', () => socket.destroy());
  upstream.setTimeout(30_000, () => upstream.destroy());
  upstream.end();
}
