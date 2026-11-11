export function previewConnectionKey(projectId: string, buildId: string | null, sessionId?: string | null): string {
  return `${projectId}/${sessionId ?? buildId ?? 'empty'}`;
}

export function acceptsPreviewMessage(value: unknown, buildId: string | null, sessionId?: string | null): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return data.version === 1 && typeof data.buildId === 'string'
    && (sessionId ? data.sessionId === sessionId : data.buildId === buildId);
}
