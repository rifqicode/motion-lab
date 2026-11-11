import React, {useEffect, useRef, useState} from 'react';
import type {Job, ShotSpec, VoiceoverState, VoiceoverTrack} from '../api.js';

export interface VoiceoverInput {shotId: string; text: string; volume: number; fitDuration: boolean}
interface VoiceoverDraft {text: string; volume: number; fitDuration: boolean}
export interface VoiceoverPanelProps {
  projectId: string;
  sourceId?: string;
  shots: ShotSpec[];
  active: boolean;
  locked: boolean;
  busy: boolean;
  blockedReason?: string;
  candidateView: boolean;
  job?: Job;
  loadState: (projectId: string, sourceId?: string) => Promise<VoiceoverState>;
  loadAudio: (projectId: string, sourceId: string, assetId: string, signal: AbortSignal) => Promise<Blob>;
  onGenerate: (input: VoiceoverInput) => void;
  onCancel?: () => void;
}

const messageOf = (cause: unknown) => cause instanceof Error ? cause.message : 'Audio gagal dimuat.';
const draftFor = (track?: VoiceoverTrack): VoiceoverDraft => ({text: track?.text ?? '', volume: track?.volume ?? 1, fitDuration: true});

export function VoiceoverPanel({projectId, sourceId, shots, active, locked, busy, blockedReason, candidateView, job, loadState, loadAudio, onGenerate, onCancel}: VoiceoverPanelProps) {
  const [state, setState] = useState<VoiceoverState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedShotId, setSelectedShotId] = useState('');
  const [drafts, setDrafts] = useState<Record<string, VoiceoverDraft>>({});
  const [audioUrl, setAudioUrl] = useState('');
  const [audioError, setAudioError] = useState('');
  const [audioLoading, setAudioLoading] = useState(false);
  const [requestedAudioId, setRequestedAudioId] = useState('');
  const [audioAttempt, setAudioAttempt] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const scope = `${projectId}:${sourceId ?? ''}`;
  const previousScope = useRef(scope);
  const loadedScope = useRef('');
  const audioElement = useRef<HTMLAudioElement>(null);
  const selected = shots.find(shot => shot.id === selectedShotId) ?? shots[0];
  const track = loadedScope.current === scope ? state?.tracks.find(item => item.shotId === selected?.id) : undefined;
  const draft = selected ? drafts[selected.id] ?? draftFor(track) : draftFor();
  const generating = String(job?.kind) === 'voiceover' && (job?.status === 'running' || job?.status === 'queued');

  useEffect(() => {
    if (previousScope.current === scope) return;
    previousScope.current = scope;
    loadedScope.current = '';
    setState(null); setDrafts({}); setRequestedAudioId(''); setAudioUrl(''); setAudioError('');
    setLoading(true); setError('');
  }, [scope]);

  useEffect(() => {
    if (!active || loadedScope.current === scope && refresh === 0) return;
    let stopped = false;
    setLoading(true); setError('');
    void loadState(projectId, sourceId).then(next => {
      if (stopped) return;
      loadedScope.current = scope;
      setState(next);
    }).catch(cause => { if (!stopped) setError(messageOf(cause)); })
      .finally(() => { if (!stopped) setLoading(false); });
    return () => { stopped = true; };
  }, [active, projectId, sourceId, scope, refresh, loadState]);

  useEffect(() => {
    setRequestedAudioId(''); setAudioError('');
  }, [selected?.id, scope]);

  useEffect(() => {
    setAudioUrl('');
    if (!requestedAudioId || requestedAudioId !== track?.assetId || !sourceId) { setAudioLoading(false); return; }
    const controller = new AbortController();
    let url = '';
    setAudioLoading(true); setAudioError('');
    void loadAudio(projectId, sourceId, requestedAudioId, controller.signal).then(blob => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob); setAudioUrl(url);
    }).catch(cause => { if (!controller.signal.aborted) setAudioError(messageOf(cause)); })
      .finally(() => { if (!controller.signal.aborted) setAudioLoading(false); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [projectId, sourceId, requestedAudioId, track?.assetId, audioAttempt, loadAudio]);

  useEffect(() => {
    if (!active) audioElement.current?.pause();
    if (audioElement.current) audioElement.current.volume = track?.volume ?? 1;
  }, [active, audioUrl, track?.volume]);

  const updateDraft = (patch: Partial<VoiceoverDraft>) => {
    if (selected) setDrafts(current => ({...current, [selected.id]: {...(current[selected.id] ?? draftFor(track)), ...patch}}));
  };
  const reason = blockedReason || (!loading && !error && !state?.runtime.available ? state?.runtime.reason ?? 'Runtime Chatterbox belum siap.' : '');
  const canGenerate = Boolean(selected && loadedScope.current === scope && state?.runtime.available && !loading && !error && !locked && !reason && draft.text.trim());

  return <section className="voiceover-panel" aria-label="Voice-over per shot" hidden={!active}>
    <div className="section-head"><h2>Voice-over</h2><span className="muted small">Chatterbox · lokal</span></div>
    <p className="muted">Narasi dibuat di komputer ini. Hasil masuk sebagai kandidat untuk didengarkan sebelum diterapkan.</p>
    {candidateView && <p className="voiceover-context">Audio dari kandidat yang sedang ditampilkan.</p>}
    {loading && <p role="status">Memeriksa audio dan runtime lokal…</p>}
    {error && <div role="alert"><p className="error">{error}</p><button type="button" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Muat ulang audio</button></div>}
    {!loading && !error && <p className="muted small">{state?.runtime.available ? `Runtime siap${state.runtime.device ? ` · ${state.runtime.device}` : ''}` : state?.runtime.reason ?? 'Runtime Chatterbox belum siap.'}</p>}
    {!loading && !error && !state?.runtime.available && <button type="button" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Periksa ulang runtime</button>}
    {!shots.length ? <p className="empty-copy">Terapkan video terlebih dahulu untuk menambahkan narasi per shot.</p> : <>
      <label htmlFor="voiceover-shot">Shot</label>
      <select id="voiceover-shot" value={selected?.id ?? ''} disabled={locked} onChange={event => setSelectedShotId(event.target.value)}>
        {shots.map((shot, index) => <option key={shot.id} value={shot.id}>Shot {String(index + 1).padStart(2, '0')} · {shot.id}</option>)}
      </select>
      <p className="muted small">Durasi shot: {((selected?.durationFrames ?? 0) / 30).toFixed(2)} detik{track ? ` · narasi: ${(track.durationMs / 1000).toFixed(2)} detik` : ' · belum ada narasi'}</p>
      <form onSubmit={event => { event.preventDefault(); if (canGenerate && selected) onGenerate({shotId: selected.id, ...draft, text: draft.text.trim()}); }}>
        <label htmlFor="voiceover-script">Teks narasi</label>
        <textarea id="voiceover-script" rows={6} maxLength={3000} value={draft.text} disabled={locked || !selected || loading} onChange={event => updateDraft({text: event.target.value})} placeholder="Tulis narasi untuk shot ini…" aria-describedby="voiceover-script-count" />
        <p className="muted small" id="voiceover-script-count">{draft.text.length} / 3000 karakter</p>
        <label htmlFor="voiceover-volume">Volume narasi · {Math.round(draft.volume * 100)}%</label>
        <input id="voiceover-volume" type="range" min={0} max={1} step={0.05} value={draft.volume} disabled={locked || loading} onChange={event => updateDraft({volume: Number(event.target.value)})} />
        <label className="voiceover-fit" htmlFor="voiceover-fit"><input id="voiceover-fit" type="checkbox" checked={draft.fitDuration} disabled={locked || loading} onChange={event => updateDraft({fitDuration: event.target.checked})} /><span>Perpanjang shot jika narasi tidak muat</span></label>
        <p className="muted small">Jika durasi tetap, narasi harus selesai sebelum shot berakhir.</p>
        {reason && <p className="muted small">{reason}</p>}
        <button className="primary" disabled={!canGenerate}>{generating ? 'Membuat voice-over…' : track ? 'Buat ulang narasi shot ini' : 'Buat narasi shot ini'}</button>
      </form>
      {track && <div className="voiceover-listen">
        <h3>Narasi tersimpan</h3>
        {!audioUrl && <button type="button" disabled={audioLoading} onClick={() => { setAudioError(''); setRequestedAudioId(track.assetId); setAudioAttempt(value => value + 1); }}>{audioLoading ? 'Memuat audio…' : 'Dengarkan narasi'}</button>}
        {audioUrl && <audio ref={audioElement} controls preload="metadata" src={audioUrl} aria-label={`Narasi shot ${selected?.id}`} />}
        {audioError && <p className="error" role="alert">{audioError}</p>}
      </div>}
    </>}
    {generating && job && <div className="voiceover-job" role="status"><p>{job.message}</p>{onCancel && <button type="button" disabled={busy} onClick={onCancel}>Batalkan voice-over</button>}</div>}
    {String(job?.kind) === 'voiceover' && job?.status === 'failed' && <p className="error" role="alert">{job.error ?? job.message}</p>}
    {String(job?.kind) === 'voiceover' && job?.status === 'cancelled' && <p className="muted">Pembuatan narasi dibatalkan. Versi aktif tetap tersimpan.</p>}
  </section>;
}
