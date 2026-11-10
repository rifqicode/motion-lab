import type {StyleBrief} from '@studio/studio-core';
import {serializeBrief} from '@studio/studio-core/brief';
export type {Project, ProjectSnapshot, Revision, Candidate, ShotSpec, Job, Comment, StyleBrief, AgentProvider} from '@studio/studio-core';

const session = document.querySelector<HTMLMetaElement>('meta[name="studio-session"]')?.content ?? '';
export const previewOrigin = document.querySelector<HTMLMetaElement>('meta[name="studio-preview-origin"]')?.content ?? '';
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {method, headers: {'x-studio-session': session, ...(body === undefined ? {} : {'content-type': 'application/json'})}, body: body === undefined ? undefined : JSON.stringify(body)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.message ?? `Request gagal (${response.status})`);
  return result as T;
}
export async function hashBrief(brief: string, style?: StyleBrief): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serializeBrief(brief, style)));
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}
export interface StudioEvent {id: number; kind: string; jobId?: string; payload: {text?: string; message?: string}}
export async function events(projectId: string, signal: AbortSignal, onEvent: (event: StudioEvent) => void, after = 0): Promise<void> {
  const response = await fetch(`/api/projects/${projectId}/events?after=${after}`, {headers: {'x-studio-session': session}, signal});
  if (!response.ok || !response.body) throw new Error('Koneksi pembaruan studio terputus.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, {stream: true});
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = block.split('\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6)).join('\n');
        if (data) onEvent(JSON.parse(data) as StudioEvent);
      }
    }
  } finally { reader.releaseLock(); }
}
