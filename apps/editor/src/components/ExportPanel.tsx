import React from 'react';
import type {Job, Revision} from '../api.js';
import type {ExportArtifact} from '../studio-state.js';

interface ExportPanelProps {
  revision?: Revision;
  exports: ExportArtifact[];
  job?: Job;
  locked: boolean;
  busy: boolean;
  hasCandidate: boolean;
  runnerReady: boolean;
  onExport: () => void;
  onDownload: (id: string) => void;
  onCancel?: () => void;
}

export function ExportPanel({revision, exports, job, locked, busy, hasCandidate, runnerReady, onExport, onDownload, onCancel}: ExportPanelProps) {
  const exporting = String(job?.kind) === 'export' && (job?.status === 'running' || job?.status === 'queued');
  return <section className="export-panel" aria-label="Export MP4">
    <h2>Final MP4</h2>
    <p className="muted">Export memakai versi yang sudah diterapkan. Production build dan render MP4 baru dijalankan saat memilih Export.</p>
    {revision ? <p>Versi {revision.id.slice(0, 7)} · {(revision.shots.reduce((sum, shot) => sum + shot.durationFrames, 0) / 30).toFixed(1)} detik</p> : <p className="empty-copy">Terapkan kandidat yang sudah direview sebelum export.</p>}
    {hasCandidate && <p className="muted small">Terapkan atau buang kandidat terbuka terlebih dahulu.</p>}
    <button type="button" className="primary" disabled={locked || !revision || hasCandidate || !runnerReady} onClick={onExport}>{exporting ? 'Export sedang berjalan…' : 'Export versi aktif ke MP4'}</button>
    {exporting && job && <div role="status"><p>{job.message}</p>{onCancel && <button type="button" disabled={busy} onClick={onCancel}>Batalkan export</button>}</div>}
    <h3>Hasil export</h3>
    {!exports.length && <p className="empty-copy">Belum ada hasil export.</p>}
    {exports.slice().reverse().map(item => <article className="export-artifact" key={item.id}>
      <div className="section-head"><strong>MP4 · {item.id.slice(0, 7)}</strong><span>{item.status === 'ready' ? 'Terverifikasi' : item.status}</span></div>
      {item.revisionId && <p className="muted small">Versi {item.revisionId.slice(0, 7)}</p>}
      {item.width && item.height && item.fps ? <p className="muted small">{item.width} × {item.height} · {item.fps} fps{item.durationFrames ? ` · ${(item.durationFrames / item.fps).toFixed(2)} detik` : ''}</p> : null}
      {item.status === 'ready' && <button type="button" disabled={busy} onClick={() => onDownload(item.jobId)}>Unduh MP4</button>}
    </article>)}
  </section>;
}
