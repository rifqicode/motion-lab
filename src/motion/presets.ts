import { Easing, interpolate, spring } from 'remotion';
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const smooth = (v: number) => Easing.inOut(Easing.cubic)(clamp01(v));
export const reveal = (time: number, start: number, duration: number) =>
  smooth((time - start) / duration);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const float = (time: number, frequency = 1, amplitude = 1, phase = 0) =>
  Math.sin(time * frequency + phase) * amplitude;
export const cameraPush = (
  time: number,
  start: number,
  duration: number,
  from: number,
  to: number,
) => lerp(from, to, reveal(time, start, duration));
export const staggerSeconds = (index: number, interval = 0.14) => index * interval;
export const secondsToFrames = (seconds: number, fps: number) => Math.round(seconds * fps);
export const ease = (frame: number, start: number, duration: number) =>
  interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });
export const pop = (frame: number, fps: number, delay = 0) =>
  spring({ frame: frame - delay, fps, config: { damping: 16, stiffness: 110, mass: 0.8 } });
export const stagger = (index: number, spacing = 8) => index * spacing;
