import React, {forwardRef, useEffect, useImperativeHandle, useRef, useState} from 'react';
import {previewOrigin, type Job, type ShotSpec} from './api.js';
import {JobProgress} from './JobProgress.js';

export interface PreviewHandle {seek: (frame: number) => void; pause: () => void}
interface Props {
  projectId: string;
  buildId: string | null;
  shots: ShotSpec[];
  label: string;
  onFrame: (frame: number) => void;
  seekTarget: {frame: number; nonce: number} | null;
  activeJob?: Job | null;
  onCancelJob?: () => void;
}

export const Preview = forwardRef<PreviewHandle, Props>(function Preview(
  {projectId, buildId, shots, label, onFrame, seekTarget, activeJob, onCancelJob},
  ref
) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const port = useRef<MessagePort | null>(null);
  const [ready, setReady] = useState(false);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const total = shots.reduce((sum, shot) => sum + shot.durationFrames, 0);
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  const isGenerating = Boolean(
    activeJob && (activeJob.kind === 'generate' || activeJob.kind === 'revise' || activeJob.kind === 'build')
  );

  const send = (type: string, frame?: number) => port.current?.postMessage({type, frame, buildId});
  useImperativeHandle(ref, () => ({seek: target => send('seek', target), pause: () => send('pause')}), [buildId]);

  useEffect(() => {
    setReady(false); setFrame(0); setPlaying(false); setError(''); onFrameRef.current(0);
    return () => { port.current?.close(); port.current = null; };
  }, [buildId, reload]);

  useEffect(() => {
    if (ready && seekTarget) send('seek', Math.min(total - 1, seekTarget.frame));
  }, [ready, seekTarget]);

  useEffect(() => {
    if (!buildId || ready || error) return;
    const timer = setTimeout(() => setError('Preview belum merespons. Periksa build atau muat ulang preview.'), 12000);
    return () => clearTimeout(timer);
  }, [buildId, reload, ready, error]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement && document.fullscreenElement === stageRef.current));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      void stageRef.current?.requestFullscreen?.().catch(() => {});
    } else {
      void document.exitFullscreen?.().catch(() => {});
    }
  };

  const connect = () => {
    if (!buildId || !iframe.current?.contentWindow) return;
    port.current?.close();
    const channel = new MessageChannel();
    port.current = channel.port1;
    channel.port1.onmessage = event => {
      const data = event.data;
      if (!data || data.version !== 1 || data.buildId !== buildId) return;
      if (data.type === 'error') { setError(String(data.message ?? 'Preview gagal.')); setPlaying(false); return; }
      if (data.type === 'ready') setReady(true);
      if (Number.isInteger(data.frame) && data.frame >= 0 && data.frame < total) {
        setFrame(data.frame); onFrameRef.current(data.frame);
      }
      if (typeof data.playing === 'boolean') setPlaying(data.playing);
    };
    channel.port1.start();
    // The preview has an opaque sandbox origin; ownership is checked by window and the transferred port.
    iframe.current.contentWindow.postMessage({type: 'studio:connect', version: 1, buildId}, '*', [channel.port2]);
  };

  return (
    <section className="preview-column" aria-label="Preview dan timeline">
      <div className="section-head">
        <h2>Preview</h2>
        <div className="preview-head-actions">
          <span className="muted">{label}</span>
          <button
            type="button"
            className="fullscreen-toggle-button"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Perkecil layar' : 'Tampilkan layar penuh'}
          >
            {isFullscreen ? '⤓ Perkecil' : '⛶ Fullscreen'}
          </button>
        </div>
      </div>
      <div className="preview-stage" ref={stageRef}>
        <div className="portrait">
          {buildId ? (
            <iframe
              key={`${buildId}-${reload}`}
              ref={iframe}
              title="Preview komposisi Remotion"
              sandbox="allow-scripts"
              src={`${previewOrigin}/p/${projectId}/${buildId}/index.html`}
              onLoad={connect}
            />
          ) : (
            <div className="preview-empty">
              <span className="empty-mark">01</span>
              <h3>Mulai dari satu shot.</h3>
              <p>Simpan dan setujui brief, lalu generate untuk melihat komposisi di sini.</p>
              <span>720 × 1280 · 30 fps · tanpa audio</span>
            </div>
          )}
        </div>
        {buildId && !ready && !error && (
          <p className="preview-note" role="status">Menghubungkan preview…</p>
        )}
        {error && (
          <div className="preview-note error" role="alert">
            {error} <button onClick={() => setReload(value => value + 1)}>Muat ulang preview</button>
          </div>
        )}
        {isFullscreen && (
          <button
            type="button"
            className="fullscreen-exit-button"
            onClick={toggleFullscreen}
            title="Keluar dari Fullscreen (Esc)"
            aria-label="Keluar dari mode layar penuh"
          >
            ⤓ Perkecil
          </button>
        )}
      </div>
      <div className="timeline">
        <div className="transport">
          <div className="button-row">
            <button aria-label="Mundur satu frame" disabled={!ready} onClick={() => send('step', -1)}>−1</button>
            <button className="play-button" disabled={!ready} onClick={() => send(playing ? 'pause' : 'play')}>
              {playing ? 'Jeda' : 'Putar'}
            </button>
            <button aria-label="Maju satu frame" disabled={!ready} onClick={() => send('step', 1)}>+1</button>
            <button
              type="button"
              className="fullscreen-button"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Perkecil' : 'Fullscreen'}
              aria-label={isFullscreen ? 'Perkecil layar' : 'Tampilkan layar penuh'}
            >
              {isFullscreen ? '⤓' : '⛶'}
            </button>
          </div>
          <output className="timecode">{(frame / 30).toFixed(2)}s <span>/ {(total / 30).toFixed(2)}s</span></output>
        </div>
        <label className="scrubber-label" htmlFor="frame-seek">
          Frame {frame}<span>{total ? `${total} frame` : 'Belum ada timeline'}</span>
        </label>
        <input
          id="frame-seek"
          aria-label="Posisi frame"
          type="range"
          min="0"
          max={Math.max(0, total - 1)}
          value={frame}
          disabled={!ready}
          onChange={event => send('seek', Number(event.target.value))}
        />
        {shots.map(shot => (
          <div className="shot-track" key={shot.id}>
            <span>{shot.id}</span>
            <span>{(shot.durationFrames / 30).toFixed(1)} dtk</span>
          </div>
        ))}
        <p className="timeline-foot">{shots[0]?.intent ?? 'Shot yang dihasilkan akan muncul di timeline.'}</p>
        {isGenerating && activeJob && (
          <div className="timeline-job-progress">
            <JobProgress job={activeJob} />
            {onCancelJob && (
              <div className="timeline-job-actions">
                <button type="button" className="cancel-job-button" onClick={onCancelJob}>
                  Batalkan proses
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
});
