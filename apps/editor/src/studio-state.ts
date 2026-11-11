import type {ProjectSnapshot} from '@studio/studio-core';

export interface ShotActivity {
  shotId: string;
  status: 'queued' | 'generating' | 'validating' | 'preview_ready' | 'failed' | 'cancelled';
  attempt: number;
  workerId?: string;
  changedFiles?: string[];
  error?: string;
}
export interface GenerationRun {
  candidateId: string;
  shots: ShotActivity[];
  buildId?: string | null;
  sourceId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  baseRevisionId?: string | null;
}

export function sortGenerationRuns(runs: readonly GenerationRun[]): GenerationRun[] {
  return [...runs].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')
    || (a.updatedAt ?? '').localeCompare(b.updatedAt ?? '') || a.candidateId.localeCompare(b.candidateId));
}
export interface QaReport {
  id: string;
  buildId: string;
  sourceHash: string;
  issues: {shotId: string; globalFrame: number; localFrame: number; severity: string; message: string; category: string}[];
  checks: {kind: string; status: string; details: string}[];
  createdAt?: string;
}
export interface ExportArtifact {
  id: string;
  jobId: string;
  revisionId?: string;
  status: string;
  durationFrames?: number;
  fps?: number;
  width?: number;
  height?: number;
  createdAt?: string;
}
export type StudioSnapshot = ProjectSnapshot & {
  preview?: {buildId: string; sessionId: string; candidateId: string} | null;
  generationRuns?: GenerationRun[];
  qaReports?: QaReport[];
  exports?: ExportArtifact[];
};
