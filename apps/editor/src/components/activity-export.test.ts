import React, {type ComponentProps} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it, vi} from 'vitest';
import {ActivityPanel} from './ActivityPanel.js';
import {ExportPanel} from './ExportPanel.js';

const activity: ComponentProps<typeof ActivityPanel> = {
  run: {candidateId: 'candidate', shots: [{shotId: 'one', status: 'preview_ready', attempt: 1, workerId: 'worker-1', changedFiles: ['src/shots/one.tsx']}, {shotId: 'two', status: 'failed', attempt: 1, error: 'Invalid TSX'}]},
  reports: [], busy: false, locked: false, canRetry: true, canReview: true,
  onRetry: vi.fn(), onCancel: vi.fn(), onReview: vi.fn(),
};
const renderActivity = (overrides: Partial<typeof activity> = {}) => renderToStaticMarkup(React.createElement(ActivityPanel, {...activity, ...overrides}));
const retryButton = (html: string) => html.match(/<button[^>]*>Coba ulang shot<\/button>/)?.[0];

describe('per-shot activity and QA evidence', () => {
  it('reports actual completed-shot counts, worker/files, failure and retry', () => {
    const html = renderActivity();
    expect(html).toContain('1 dari 2 shot tersedia');
    expect(html).toContain('worker-1');
    expect(html).toContain('src/shots/one.tsx');
    expect(html).toContain('Invalid TSX');
    expect(retryButton(html)).not.toContain('disabled');
    expect(html).not.toContain('%');
  });
  it('blocks retry during an active parent job but keeps per-shot cancellation available', () => {
    expect(retryButton(renderActivity({locked: true}))).toContain('disabled');
    const html = renderActivity({locked: true, run: {candidateId: 'candidate', shots: [{shotId: 'one', status: 'generating', attempt: 1}]}});
    expect(html.match(/<button[^>]*>Batalkan shot<\/button>/)?.[0]).not.toContain('disabled');
  });
  it('does not treat absent semantic QA as a passing visual review', () => {
    expect(renderActivity()).toContain('Belum ada laporan QA.');
    const html = renderActivity({reports: [{id: 'report', buildId: 'build', sourceHash: 'hash', issues: [], checks: [{kind: 'visual consistency', status: 'inconclusive', details: 'Review AI belum dijalankan.'}]}]});
    expect(html).toContain('Belum dapat disimpulkan');
    expect(html).toContain('Review AI belum dijalankan.');
    expect(html).not.toContain('>Lulus<');
  });
});

const exporter: ComponentProps<typeof ExportPanel> = {
  exports: [], locked: false, busy: false, hasCandidate: false, runnerReady: true,
  onExport: vi.fn(), onDownload: vi.fn(),
};
const renderExport = (overrides: Partial<typeof exporter> = {}) => renderToStaticMarkup(React.createElement(ExportPanel, {...exporter, ...overrides}));
const exportButton = (html: string) => html.match(/<button[^>]*>Export versi aktif ke MP4<\/button>/)?.[0];
const revision = {id: 'revision', parentRevisionId: null, sourceId: 'source', buildId: 'build', summary: 'Approved', createdAt: '2026-11-11T00:00:00.000Z', shots: [{id: 'one', durationFrames: 90, intent: 'Intro', visualDirection: 'Text'}]};

describe('explicit final export', () => {
  it('requires an accepted revision and resolved candidate before export', () => {
    expect(exportButton(renderExport())).toContain('disabled');
    expect(exportButton(renderExport({revision, hasCandidate: true}))).toContain('disabled');
    expect(exportButton(renderExport({revision}))).not.toContain('disabled');
  });
  it('offers downloads only for verified ready artifacts and displays real metadata', () => {
    const html = renderExport({revision, exports: [{id: 'runtime-id', jobId: 'job-id', status: 'ready', width: 720, height: 1280, fps: 30, durationFrames: 90}]});
    expect(html).toContain('Terverifikasi');
    expect(html).toContain('720 × 1280');
    expect(html).toContain('3.00 detik');
    expect(html).toContain('Unduh MP4');
    expect(renderExport({exports: [{id: 'pending', jobId: 'job', status: 'running'}]})).not.toContain('Unduh MP4');
  });
});
