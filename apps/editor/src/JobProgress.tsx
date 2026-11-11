import React, {useEffect, useState} from 'react';
import type {Job} from './api.js';

export function JobProgress({job}: {job: Job}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [job.id]);
  const elapsed = Math.max(0, Math.floor((now - Date.parse(job.createdAt)) / 1000));
  const duration = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
  const generation = job.kind === 'generate' || job.kind === 'revise' || job.kind === 'build';
  const voiceover = job.kind === 'voiceover';
  return <div className="job-progress">
    <div className="progress-heading"><span>{voiceover ? 'Membuat voice-over lokal' : generation ? job.kind === 'revise' ? 'Merevisi komposisi' : job.kind === 'build' ? 'Membangun komposisi' : 'Membuat komposisi' : 'AI sedang bekerja'}</span><span className="progress-elapsed">{duration} berjalan</span></div>
    <p role="status">{job.message}</p>
    <div className="progress-track" role="progressbar" aria-label={voiceover ? 'Pembuatan narasi lokal' : generation ? 'Proses pembuatan komposisi' : 'Menunggu respons AI'} aria-valuetext={job.message}><span className="progress-sweep" /></div>
    <span className="progress-help">{voiceover ? 'Buka Audio untuk status dan hasil narasi. Hasil tetap perlu diterapkan.' : 'Lihat Activity untuk status worker, file berubah, dan hasil validasi per shot.'}</span>
  </div>;
}
