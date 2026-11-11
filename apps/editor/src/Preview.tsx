import React, {forwardRef, useEffect, useImperativeHandle, useRef, useState} from 'react';
import {api, previewOrigin, type Job, type ShotSpec} from './api.js';
import {JobProgress} from './JobProgress.js';
import {acceptsPreviewMessage, previewConnectionKey} from './preview-connection.js';

export interface PreviewHandle {seek: (frame: number) => void; pause: () => void}
interface Props {
  projectId: string;
  buildId: string | null;
  previewSessionId?: string | null;
  shots: ShotSpec[];
  label: string;
  onFrame: (frame: number) => void;
  seekTarget: {frame: number; nonce: number} | null;
  activeJob?: Job | null;
  onCancelJob?: () => void;
}

export const Preview = forwardRef<PreviewHandle, Props>(function Preview(
  {projectId, buildId, previewSessionId, shots, label, onFrame, seekTarget, activeJob, onCancelJob},
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
  const [runtimeTotal, setRuntimeTotal] = useState<number | null>(null);
  const [recovered, setRecovered] = useState(false);
  const errorBuild = useRef<string | null>(null);

  const total = runtimeTotal ?? shots.reduce((sum, shot) => sum + shot.durationFrames, 0);
  let shotStart = 0;
  const timelineShots = shots.map(shot => {
    const start = shotStart;
    shotStart += shot.durationFrames;
    return {...shot, start, end: shotStart};
  });
  const activeShotIndex = timelineShots.findIndex(shot => frame >= shot.start && frame < shot.end);
  const activeShot = timelineShots[activeShotIndex];
  const totalRef = useRef(total); totalRef.current = total;
  const connectionKey = previewConnectionKey(projectId, buildId, previewSessionId);
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  const isGenerating = Boolean(
    activeJob && (activeJob.kind === 'generate' || activeJob.kind === 'revise' || activeJob.kind === 'build')
  );

  const send = (type: string, frame?: number) => port.current?.postMessage({type, frame, ...(previewSessionId ? {sessionId: previewSessionId} : {buildId})});
  useImperativeHandle(ref, () => ({seek: target => send('seek', target), pause: () => send('pause')}), [connectionKey]);

  useEffect(() => {
    setReady(false); setFrame(0); setPlaying(false); setError(''); setRecovered(false); setRuntimeTotal(null); errorBuild.current = null; onFrameRef.current(0);
    return () => { port.current?.close(); port.current = null; };
  }, [connectionKey, reload]);

  useEffect(() => {
    if (ready && seekTarget && total > 0) send('seek', Math.min(total - 1, seekTarget.frame));
  }, [ready, seekTarget]);

  const connect = () => {
    if (!buildId || !iframe.current?.contentWindow) return;
    port.current?.close();
    const channel = new MessageChannel();
    port.current = channel.port1;
    channel.port1.onmessage = event => {
      const data = event.data;
      if (!acceptsPreviewMessage(data, buildId, previewSessionId)) return;
      if (data.type === 'error') {
        errorBuild.current = data.buildId as string;
        setError(String(data.message ?? 'Preview gagal.')); setPlaying(false); setRecovered(data.recovered === true);
        if (data.recovered === true && typeof data.failedBuildId === 'string' && typeof data.fallbackBuildId === 'string') {
          void api(`/projects/${projectId}/preview/recover`, 'POST', {failedBuildId: data.failedBuildId, fallbackBuildId: data.fallbackBuildId,
            ...(typeof data.frame === 'number' && Number.isSafeInteger(data.frame) && data.frame >= 0 ? {frame: data.frame} : {})})
            .catch(cause => setError(`Preview dipulihkan di browser; pemulihan workspace gagal: ${cause instanceof Error ? cause.message : String(cause)}`));
        }
        if (data.recovered !== true) setReady(false);
        return;
      }
      if (data.type === 'ready' || data.type === 'updated') {
        setReady(true);
        setError(''); setRecovered(false); errorBuild.current = null;
        if (typeof data.durationFrames === 'number' && Number.isSafeInteger(data.durationFrames) && data.durationFrames > 0) {
          totalRef.current = data.durationFrames; setRuntimeTotal(data.durationFrames);
        }
      }
      if (typeof data.frame === 'number' && Number.isInteger(data.frame) && data.frame >= 0 && data.frame < totalRef.current) {
        setFrame(data.frame); onFrameRef.current(data.frame);
      }
      if (typeof data.playing === 'boolean') setPlaying(data.playing);
    };
    channel.port1.start();
    // The preview has an opaque sandbox origin; ownership is checked by window and the transferred port.
    iframe.current.contentWindow.postMessage({type: 'studio:connect', version: 1, buildId, ...(previewSessionId ? {sessionId: previewSessionId} : {})}, '*', [channel.port2]);
  };

  useEffect(() => {
    if (!buildId || ready || error) return;
    const interval = setInterval(() => {
      connect();
    }, 1200);
    const timer = setTimeout(() => setError('Preview belum merespons. Periksa build atau muat ulang preview.'), 30000);
    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [connectionKey, reload, ready, error, buildId, previewSessionId]);

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
              key={`${connectionKey}-${reload}`}
              ref={iframe}
              title="Preview komposisi Remotion"
              sandbox="allow-scripts allow-same-origin"
              allow="autoplay *"
              src={`${previewOrigin}/p/${projectId}/${previewSessionId ?? buildId}/index.html`}
              onLoad={connect}
            />
          ) : (
            <div className="preview-empty">
              <span className="empty-mark">01</span>
              <h3>Dari storyboard ke shot.</h3>
              <p>Setujui storyboard, lalu shot yang lolos validasi akan muncul di sini selama generation berlangsung.</p>
              <span>720 × 1280 · 30 fps</span>
            </div>
          )}
        </div>
        {buildId && !ready && !error && (
          <p className="preview-note" role="status">Menghubungkan preview…</p>
        )}
        {error && (
          <div className="preview-note error" role="alert">
            {recovered ? `Preview kembali ke versi valid terakhir. ${error}` : error} <button onClick={() => { setError(''); setRecovered(false); setReload(value => value + 1); }}>Muat ulang preview</button>
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
            <button aria-label="Ke awal video" disabled={!ready} onClick={() => send('seek', 0)}>Ⅰ◁</button>
            <button aria-label="Mundur satu frame" disabled={!ready} onClick={() => send('step', -1)}>−1</button>
            <button className="play-button" disabled={!ready} onClick={() => send(playing ? 'pause' : 'play')}>
              {playing ? 'Jeda' : 'Putar'}
            </button>
            <button aria-label="Maju satu frame" disabled={!ready} onClick={() => send('step', 1)}>+1</button>
            <button aria-label="Ke akhir video" disabled={!ready} onClick={() => send('seek', Math.max(0, total - 1))}>▷Ⅰ</button>
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
        <div className="shot-navigation" role="group" aria-label="Navigasi shot">
          {timelineShots.map((shot, index) => <button
            key={shot.id}
            type="button"
            aria-label={`Shot ${index + 1}: ${shot.id}, ${(shot.durationFrames / 30).toFixed(1)} detik`}
            aria-pressed={activeShotIndex === index}
            disabled={!ready}
            title={`${shot.id} · ${(shot.durationFrames / 30).toFixed(1)} detik`}
            onClick={() => { send('pause'); send('seek', shot.start); }}
          >{index + 1}</button>)}
        </div>
        {activeShot ? <div className="current-shot">
          <div><span className="current-shot-label">Sedang tampil · Shot {activeShotIndex + 1} dari {shots.length}</span><span className="shot-id">{activeShot.id} · {(activeShot.durationFrames / 30).toFixed(1)} dtk</span></div>
          <h3>{activeShot.id.replace(/^shot-/, '').replace(/-/g, ' ')}</h3>
          <p>{activeShot.intent}</p>
        </div> : <p className="timeline-foot">Shot yang dihasilkan akan muncul di timeline.</p>}
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
