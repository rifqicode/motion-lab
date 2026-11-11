import React, {useEffect, useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {Player, type PlayerRef, type CallbackListener} from '@remotion/player';
// The immutable preview is served under a project/build prefix.
(window as unknown as {remotion_staticBase: string}).remotion_staticBase = new URL('.', window.location.href).pathname.replace(/\/$/, '');
import {StudioComposition} from 'studio:composition';

const meta = __STUDIO_META__;
let channel: MessagePort | null = null;
let currentPlayer: PlayerRef | null = null;
const emit = (type: string, extra: Record<string, unknown> = {}) => channel?.postMessage({type, version: 1, buildId: meta.buildId,
  frame: currentPlayer?.getCurrentFrame() ?? 0, playing: currentPlayer?.isPlaying() ?? false, ...extra});

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window.parent || event.data?.type !== 'studio:connect' || event.data?.version !== 1
      || event.data?.buildId !== meta.buildId || event.ports.length !== 1 || channel) return;
  channel = event.ports[0];
  channel.onmessage = (message: MessageEvent) => {
    const command = message.data;
    if (!command || typeof command !== 'object' || (command.buildId !== undefined && command.buildId !== meta.buildId)) return;
    const player = currentPlayer;
    if (!player) return;
    if (command.type === 'play') {
      Promise.resolve(player.play()).catch((error: unknown) => emit('error', {message: String(error)}));
    } else if (command.type === 'pause') player.pause();
    else if (command.type === 'seek') {
      if (!Number.isInteger(command.frame) || command.frame < 0 || command.frame >= meta.durationFrames) return;
      player.pause();
      player.seekTo(command.frame);
    } else if (command.type === 'step') {
      const delta = command.frame ?? 1;
      if (!Number.isInteger(delta) || Math.abs(delta) > meta.durationFrames) return;
      player.pause();
      player.seekTo(Math.max(0, Math.min(meta.durationFrames - 1, player.getCurrentFrame() + delta)));
    } else if (command.type === 'getState') emit('frame');
  };
  channel.start();
  if (currentPlayer) emit('ready', meta);
});

class PreviewBoundary extends React.Component<React.PropsWithChildren, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  componentDidCatch(error: Error) { emit('error', {message: error.message}); }
  render() { return this.state.failed ? <p role="alert">Preview gagal dijalankan.</p> : this.props.children; }
}

function App() {
  const playerRef = useRef<PlayerRef>(null);
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    currentPlayer = player;
    const onFrame: CallbackListener<'frameupdate'> = () => emit('frame');
    const onPlayback = () => emit('playback');
    const onError: CallbackListener<'error'> = (event) => emit('error', {message: event.detail.error.message});
    player.addEventListener('frameupdate', onFrame);
    player.addEventListener('play', onPlayback);
    player.addEventListener('pause', onPlayback);
    player.addEventListener('ended', onPlayback);
    player.addEventListener('error', onError);
    emit('ready', meta);
    return () => {
      currentPlayer = null;
      player.removeEventListener('frameupdate', onFrame);
      player.removeEventListener('play', onPlayback);
      player.removeEventListener('pause', onPlayback);
      player.removeEventListener('ended', onPlayback);
      player.removeEventListener('error', onError);
    };
  }, []);
  return <PreviewBoundary><Player ref={playerRef} component={StudioComposition}
    durationInFrames={meta.durationFrames} compositionWidth={meta.width} compositionHeight={meta.height}
    fps={meta.fps} controls={false} clickToPlay={false} numberOfSharedAudioTags={2}
    style={{width: '100%', height: '100%'}}
    errorFallback={({error}) => { emit('error', {message: error.message}); return <p role="alert">Preview gagal dijalankan.</p>; }}
  /></PreviewBoundary>;
}

createRoot(document.getElementById('root')!).render(<App />);
