import React, {useEffect, useState} from 'react';
import type {Job} from './api.js';

const stages = ['Codex menulis kode', 'Validasi kode', 'Build preview', 'Build render', 'Cek frame', 'Siapkan kandidat'];
function stageOf(message: string): number {
  if (/menyiapkan kandidat/i.test(message)) return 5;
  if (/memeriksa frame|smoke/i.test(message)) return 4;
  if (/membangun render/i.test(message)) return 3;
  if (/membangun preview/i.test(message)) return 2;
  if (/memvalidasi|memeriksa tipe|typecheck/i.test(message)) return 1;
  return 0;
}

export function JobProgress({job}: {job: Job}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [job.id]);
  const elapsed = Math.max(0, Math.floor((now - Date.parse(job.createdAt)) / 1000));
  const duration = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
  const generation = job.kind === 'generate' || job.kind === 'revise' || job.kind === 'build';
  const labels = job.kind === 'build' ? stages.slice(1) : stages;
  const stage = Math.max(0, stageOf(job.message) - (job.kind === 'build' ? 1 : 0));
  const legacyBuild = job.message === 'Typecheck, build, dan cek frame terisolasi';
  return <div className="job-progress">
    <div className="progress-heading"><span>{generation ? job.kind === 'revise' ? 'Merevisi komposisi' : job.kind === 'build' ? 'Membangun komposisi' : 'Membuat komposisi' : 'Codex merespons'}</span><span className="progress-elapsed">{duration} berjalan</span></div>
    <p role="status">{job.message}</p>
    <div className="progress-track" role="progressbar" aria-label={generation ? 'Proses pembuatan komposisi' : 'Menunggu respons Codex'} aria-valuetext={job.message}><span className="progress-sweep" /></div>
    {generation && <ol className="progress-stages" aria-label="Tahapan generation">{labels.map((label, index) => <li key={label} className={index < stage ? 'complete' : index === stage ? 'current' : ''} aria-current={index === stage ? 'step' : undefined}><span aria-hidden="true">{index < stage ? '✓' : index + 1}</span>{label}</li>)}</ol>}
    <span className="progress-help">{legacyBuild ? 'Build dan pemeriksaan frame sedang diproses.' : 'Durasi tiap tahap bisa berbeda; bar bergerak selama proses berlangsung.'}</span>
  </div>;
}
