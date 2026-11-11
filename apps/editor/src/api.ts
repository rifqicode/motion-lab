import type {StyleBrief} from '@studio/studio-core';
import {serializeBrief} from '@studio/studio-core/brief';
export type {Project, ProjectSnapshot, Revision, Candidate, ShotSpec, Job, Comment, StyleBrief, AgentProvider} from '@studio/studio-core';
export type {Storyboard, StoryboardState} from '@studio/studio-core/storyboard';

const session = document.querySelector<HTMLMetaElement>('meta[name="studio-session"]')?.content ?? '';
export const previewOrigin = document.querySelector<HTMLMetaElement>('meta[name="studio-preview-origin"]')?.content ?? '';
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {method, headers: {'x-studio-session': session, ...(body === undefined ? {} : {'content-type': 'application/json'})}, body: body === undefined ? undefined : JSON.stringify(body)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.message ?? `Request gagal (${response.status})`);
  return result as T;
}
export async function downloadExport(projectId: string, exportId: string): Promise<void> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/exports/${encodeURIComponent(exportId)}/file`, {headers: {'x-studio-session': session}});
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.message ?? `Unduhan gagal (${response.status}).`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `motionlab-${exportId}.mp4`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
export interface VoiceoverTrack {
  shotId: string;
  assetId: string;
  text: string;
  durationMs: number;
  volume: number;
}
export interface VoiceoverState {
  runtime: {available: boolean; reason?: string; device?: string};
  tracks: VoiceoverTrack[];
}
export function loadVoiceovers(projectId: string, sourceId?: string): Promise<VoiceoverState> {
  return api(`/projects/${encodeURIComponent(projectId)}/voiceovers${sourceId ? `?sourceId=${encodeURIComponent(sourceId)}` : ''}`);
}
export async function voiceoverAudioBlob(projectId: string, sourceId: string, assetId: string, signal: AbortSignal): Promise<Blob> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/voiceovers/${encodeURIComponent(assetId)}/audio?sourceId=${encodeURIComponent(sourceId)}`, {headers: {'x-studio-session': session}, signal});
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.message ?? `Audio gagal dimuat (${response.status}).`);
  }
  return response.blob();
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
