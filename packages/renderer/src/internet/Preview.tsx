import React, {useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {Player,type PlayerRef} from '@remotion/player';
import {InternetVideo} from './InternetVideo.js';
import type {InternetProject} from './types.js';
import './preview.css';

declare const __INTERNET_PROJECT__:InternetProject;
const project=__INTERNET_PROJECT__;
function Preview(){const playerRef=useRef<PlayerRef>(null);let start=0;return <main className="internet-preview">
  <header><p>Studi diagram / 01</p><h1>Cara internet bekerja</h1><p>Satu klik, satu perjalanan data. Narasi Indonesia · {(project.durationFrames/project.fps).toFixed(1)} detik.</p><nav className="chapter-links" aria-label="Lompat ke adegan">{project.scenes.map(scene=>{const from=start;start+=scene.durationFrames;return <button key={scene.id} onClick={()=>{playerRef.current?.pause();playerRef.current?.seekTo(from+Math.round(scene.durationFrames*.55));}}>{scene.chapter}<span>{(from/project.fps).toFixed(1)} dtk</span></button>;})}</nav></header>
  <div className="player-wrap"><Player ref={playerRef} component={InternetVideo} inputProps={{project}} durationInFrames={project.durationFrames} compositionWidth={1080} compositionHeight={1920} fps={project.fps} controls style={{width:'100%'}} renderLoading={()=><div className="preview-message">Menyiapkan video dan narasi…</div>} errorFallback={()=><div className="preview-message" role="alert"><p>Preview belum bisa diputar.</p><button onClick={()=>window.location.reload()}>Muat ulang</button></div>}/></div>
  <footer><p>Diagram disederhanakan untuk menjelaskan alur.</p><p>Rujukan: <a href="https://developer.mozilla.org/en-US/docs/Learn_web_development/Getting_started/Web_standards/How_the_web_works" target="_blank" rel="noreferrer">MDN: How the web works</a></p></footer>
</main>;}
createRoot(document.getElementById('root')!).render(<Preview/>);
