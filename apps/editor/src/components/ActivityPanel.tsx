import React from 'react';
import type {Job} from '../api.js';
import type {GenerationRun, QaReport} from '../studio-state.js';

const labels: Record<string, string> = {
  queued: 'Antre', generating: 'Menulis kode', validating: 'Validasi', preview_ready: 'Preview tersedia',
  failed: 'Gagal', cancelled: 'Dibatalkan', running: 'Berjalan', succeeded: 'Selesai',
  passed: 'Lulus', failed_check: 'Gagal', inconclusive: 'Belum dapat disimpulkan', skipped: 'Belum diperiksa',
};

interface ActivityPanelProps {
  job?: Job;
  run?: GenerationRun;
  reports: QaReport[];
  busy: boolean;
  locked: boolean;
  canRetry: boolean;
  onRetry: (candidateId: string, shotId: string) => void;
  onCancel: (candidateId: string, shotId: string) => void;
  canReview: boolean;
  onReview: () => void;
}

export function ActivityPanel({job, run, reports, busy, locked, canRetry, onRetry, onCancel, canReview, onReview}: ActivityPanelProps) {
  return <div className="activity-panel">
    <div className="section-head"><h2>AI Activity</h2><span className="muted">Milestone aktual</span></div>
    {job ? <div className="activity-current" role="status"><strong>{labels[job.status] ?? job.status}</strong><p>{job.message}</p>{job.error && <p className="error">{job.error}</p>}</div> : <p className="empty-copy">Aktivitas muncul saat Director atau worker mulai bekerja.</p>}
    {run && <>
      <p className="muted small">{run.shots.filter(shot => shot.status === 'preview_ready').length} dari {run.shots.length} shot tersedia di preview.</p>
      <ol className="activity-shots" aria-label="Progress per shot">
        {run.shots.map(shot => <li className={`activity-shot activity-${shot.status}`} key={shot.shotId}>
          <div className="activity-shot-heading"><strong>{shot.shotId}</strong><span>{labels[shot.status] ?? shot.status}</span></div>
          <p className="muted small">Percobaan {shot.attempt}{shot.workerId ? ` · ${shot.workerId}` : ''}</p>
          {shot.changedFiles?.length ? <details><summary>File berubah ({shot.changedFiles.length})</summary><ul className="activity-files">{shot.changedFiles.map(file => <li key={file}><code>{file}</code></li>)}</ul></details> : null}
          {shot.status === 'preview_ready' && <p className="muted small">Source tervalidasi dan frame terpilih lolos pemeriksaan runtime.</p>}
          {shot.error && <p className="error" role="alert">{shot.error}</p>}
          <div className="button-row">
            {(shot.status === 'failed' || shot.status === 'cancelled') && <button type="button" disabled={busy || locked || !canRetry} onClick={() => onRetry(run.candidateId, shot.shotId)}>Coba ulang shot</button>}
            {(['queued', 'generating', 'validating'] as string[]).includes(shot.status) && <button type="button" disabled={busy} onClick={() => onCancel(run.candidateId, shot.shotId)}>Batalkan shot</button>}
          </div>
        </li>)}
      </ol>
    </>}
    <section className="qa-panel" aria-label="Laporan visual QA">
      <h3>Pemeriksaan visual</h3>
      <p className="muted small">Minta reviewer memeriksa screenshot terhadap arahan Director. Hasilnya terpisah dari compile dan runtime checks.</p>
      <button type="button" disabled={locked || busy || !canReview} onClick={onReview}>Jalankan visual QA</button>
      {!reports.length ? <p className="empty-copy">Belum ada laporan QA. Preview tersedia belum berarti kualitas visual sudah disetujui.</p> : reports.slice().reverse().map(report => <article className="qa-report" key={report.id}>
        <h4>Laporan {report.id.slice(0, 7)}</h4>
        <ul className="qa-checks">{report.checks.map((check, index) => <li key={`${check.kind}-${index}`}><strong>{check.kind}</strong><span>{labels[check.status] ?? check.status}</span><p className="muted small">{check.details}</p></li>)}</ul>
        {report.issues.length ? <ul className="qa-issues">{report.issues.map((issue, index) => <li key={index}><strong>{issue.severity} · {issue.shotId} · F{issue.globalFrame}</strong><p>{issue.message}</p><span className="muted small">Frame lokal {issue.localFrame} · {issue.category}</span></li>)}</ul> : <p className="muted small">Tidak ada issue yang dilaporkan pada pemeriksaan ini. Cakupan dan status setiap check tetap berlaku.</p>}
      </article>)}
    </section>
  </div>;
}
