import React, {useEffect, useMemo, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Player, type PlayerRef, type CallbackListener} from '@remotion/player';
import {plan, type CameraView} from './Pilot.js';
import {scenarios, type ScenarioId, type Scenario} from './scenarios.js';
import './preview.css';

function Transport({playerRef, scenario}: {playerRef: React.RefObject<PlayerRef>; scenario: Scenario}) {
  const frames = scenario.duration * plan.fps;
  const beats = scenario.beats;
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onFrame: CallbackListener<'frameupdate'> = ({detail}) => setFrame(detail.frame);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    player.addEventListener('frameupdate', onFrame);
    player.addEventListener('play', onPlay);
    player.addEventListener('pause', onPause);
    player.addEventListener('ended', onPause);
    return () => {
      player.removeEventListener('frameupdate', onFrame);
      player.removeEventListener('play', onPlay);
      player.removeEventListener('pause', onPause);
      player.removeEventListener('ended', onPause);
    };
  }, [playerRef]);
  const activeBeat = beats.reduce((active, beat, index) => frame >= Math.round(beat.time * plan.fps) ? index : active, 0);
  return <>
    <section className="transport" aria-label="Kontrol animasi">
      <div className="transport-heading"><label htmlFor="timeline">Timeline</label><output htmlFor="timeline" aria-live="off">{(frame / plan.fps).toFixed(2)} <span>/ {scenario.duration.toFixed(2)} dtk</span></output></div>
      <input id="timeline" type="range" min="0" max={frames - 1} value={frame} onChange={event => {playerRef.current?.pause(); playerRef.current?.seekTo(Number(event.target.value));}} aria-valuetext={`${(frame / plan.fps).toFixed(2)} detik`} />
      <div className="timeline-ruler"><span>0 dtk</span><span>{(scenario.duration/3).toFixed(1)}</span><span>{(scenario.duration*2/3).toFixed(1)}</span><span>{scenario.duration} dtk</span></div>
      <div className="playback-buttons">
        <button className="primary" onClick={event => playerRef.current?.toggle(event)} aria-pressed={playing}><span aria-hidden="true">{playing ? 'Ⅱ' : '▶'}</span>{playing ? 'Jeda' : 'Putar adegan'}</button>
        <button onClick={() => {playerRef.current?.pause(); playerRef.current?.seekTo(0);}}>Ulang dari awal</button>
      </div>
    </section>
    <section className="storyboard" aria-labelledby="storyboard-title">
      <h2 id="storyboard-title">Urutan adegan</h2>
      <div className="beat-list">{beats.map((beat, index) => <button key={beat.time} className={`beat ${activeBeat === index ? 'active' : ''}`} aria-current={activeBeat === index ? 'step' : undefined} onClick={() => {playerRef.current?.pause(); playerRef.current?.seekTo(Math.round(beat.time * plan.fps));}}>
        <span className="beat-time">{beat.time.toFixed(1)} dtk</span>
        <span><strong>{beat.title}</strong><small>{beat.description}</small></span>
        <span className="beat-jump" aria-hidden="true">↗</span>
      </button>)}</div>
    </section>
  </>;
}

class PreviewBoundary extends React.Component<React.PropsWithChildren, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() {return {failed: true};}
  render() {
    if (this.state.failed) return <div className="scene-error" role="alert"><h2>Preview 3D belum bisa dibuka</h2><p>Aktifkan akselerasi grafis di browser atau coba Chrome / Edge terbaru.</p><button onClick={() => window.location.reload()}>Muat ulang preview</button></div>;
    return this.props.children;
  }
}

function App() {
  const playerRef = useRef<PlayerRef>(null);
  const [scenarioId, setScenarioId] = useState<ScenarioId>('run');
  const scenario = scenarios[scenarioId];
  const [view, setView] = useState<CameraView>('scene');
  const [shirt, setShirt] = useState(plan.palette.shirt);
  const [cameraMotion, setCameraMotion] = useState(true);
  const [loop, setLoop] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [ready, setReady] = useState(false);
  const [sceneError, setSceneError] = useState(false);
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onError = () => setSceneError(true);
    player.addEventListener('error', onError);
    return () => player.removeEventListener('error', onError);
  }, [scenarioId]);
  const inputProps = useMemo(() => ({scenePlan: {...plan, id: scenarioId, durationSeconds: scenario.duration, palette: {...plan.palette, shirt}, camera: {...plan.camera, pushIn: cameraMotion ? plan.camera.pushIn : 0}}, cameraView: view, onReady: () => setReady(true)}), [shirt, cameraMotion, view, scenarioId, scenario.duration]);
  return <div className="workspace">
    <header className="page-header"><div className="wordmark">Studio karakter</div><p>Eksperimen visual / {scenarioId === 'run' ? '02' : '01'}</p></header>
    <main>
      <section className="preview-column" aria-labelledby="preview-title">
        <div className="section-heading"><h1 id="preview-title">Preview karakter</h1><span>9:16</span></div>
        <div className="stage-shell">
          <div className="stage">
            <PreviewBoundary key={scenarioId}>
              <Player
                ref={playerRef}
                component={scenario.component}
                inputProps={inputProps}
                durationInFrames={scenario.duration * plan.fps}
                compositionWidth={720}
                compositionHeight={1280}
                fps={plan.fps}
                style={{width: '100%', height: '100%'}}
                loop={loop}
                playbackRate={speed}
                controls={false}
                clickToPlay={false}
                initiallyMuted
                renderLoading={() => <div className="scene-loading">Menyiapkan scene 3D…</div>}
                errorFallback={() => <div className="scene-error" role="alert"><p>Scene 3D gagal dimuat. Aktifkan akselerasi grafis lalu muat ulang.</p><button onClick={() => window.location.reload()}>Muat ulang</button></div>}
              />
            </PreviewBoundary>
            {!ready && !sceneError && <div className="scene-loading" role="status">Menyiapkan karakter 3D…</div>}
          </div>
        </div>
        <div className="preview-caption"><span className="live-state"><i aria-hidden="true" />{sceneError ? 'Preview bermasalah' : ready ? 'Preview langsung' : 'Menyiapkan preview'}</span><span>Tanpa audio · {plan.fps} fps</span></div>
      </section>
      <aside className="director-panel" aria-labelledby="scene-title">
        <div className="scenario-picker"><label htmlFor="scenario">Pilih skenario</label><select id="scenario" value={scenarioId} onChange={event => {playerRef.current?.pause(); setReady(false);setSceneError(false);setView('scene');setScenarioId(event.target.value as ScenarioId);}}>{Object.entries(scenarios).map(([id,item]) => <option key={id} value={id}>{item.label}</option>)}</select></div>
        <div className="scene-intro"><span className="scene-number">{scenario.duration} detik / Uji skenario</span><h2 id="scene-title">{scenario.title}</h2><p>{scenario.description}</p></div>
        <Transport key={scenarioId} playerRef={playerRef} scenario={scenario} />
        <section className="settings" aria-labelledby="settings-title">
          <h2 id="settings-title">Lihat lebih dekat</h2>
          <fieldset><legend>Sudut kamera</legend><div className="view-options">{([['scene', 'Adegan'], ['portrait', scenarioId === 'run' ? 'Dekat' : 'Wajah'], ['side', 'Samping']] as const).map(([key,label]) => <button key={key} aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}</div></fieldset>
          <div className="setting-row"><label htmlFor="shirt">Warna kaus</label><div className="color-control"><span>{shirt.toUpperCase()}</span><input id="shirt" type="color" value={shirt} onChange={event => setShirt(event.target.value)} /></div></div>
          <div className="setting-row"><label htmlFor="speed">Kecepatan preview</label><select id="speed" value={speed} onChange={event => setSpeed(Number(event.target.value))}><option value="0.5">0.5×</option><option value="1">1× normal</option><option value="1.5">1.5×</option></select></div>
          <div className="check-options"><label><input type="checkbox" checked={cameraMotion} onChange={event => setCameraMotion(event.target.checked)} />Zoom perlahan</label><label><input type="checkbox" checked={loop} onChange={event => setLoop(event.target.checked)} />Putar berulang</label></div>
        </section>
        <p className="work-note">{scenario.note}</p>
      </aside>
    </main>
    <footer><span>Dibuat untuk ditinjau, sebelum dirender.</span><span>Three.js + Remotion</span></footer>
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
