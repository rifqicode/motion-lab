import { Easing, spring, interpolateColors } from 'remotion';
import type { Track, IllustrationNode, Illustration, ColorTrack } from './schema';
const clamp = (n: number) => Math.max(0, Math.min(1, n));
export const smooth = (n: number) => Easing.inOut(Easing.cubic)(clamp(n));
export const sampleTrack = (track: Track, time: number, fps: number) => {
  const keys = track.keys;
  if (time <= keys[0].time) return keys[0].value;
  if (time >= keys[keys.length - 1].time) return keys[keys.length - 1].value;
  const i = keys.findIndex((k) => k.time > time);
  const a = keys[i - 1],
    b = keys[i];
  const p = (time - a.time) / (b.time - a.time);
  const q =
    track.easing === 'spring'
      ? spring({
          frame: (time - a.time) * fps,
          fps,
          durationInFrames: Math.max(1, Math.round((b.time - a.time) * fps)),
          config: { damping: 15, stiffness: 130 },
        })
      : track.easing === 'smooth'
        ? smooth(p)
        : p;
  return a.value + (b.value - a.value) * q;
};
export const bezier = (points: [number, number][], p: number): [number, number] => {
  const q = 1 - p;
  return [0, 1].map(
    (i) =>
      q * q * q * points[0][i] +
      3 * q * q * p * points[1][i] +
      3 * q * p * p * points[2][i] +
      p * p * p * points[3][i],
  ) as [number, number];
};
export const nodePose = (n: IllustrationNode, time: number, fps: number) => {
  const pose = {
    x: n.x,
    y: n.y,
    scaleX: n.scaleX,
    scaleY: n.scaleY,
    rotation: n.rotation,
    skewX: n.skewX,
    skewY: n.skewY,
    opacity: n.opacity,
    draw: 1,
  };
  for (const t of n.tracks) pose[t.property] = sampleTrack(t, time, fps);
  if (n.follow) {
    const p = smooth((time - n.follow.start) / n.follow.duration),
      v = bezier(n.follow.points, p);
    pose.x += v[0];
    pose.y += v[1];
    if (n.follow.orient) {
      const a = bezier(n.follow.points, Math.max(0, p - 0.001)),
        b = bezier(n.follow.points, Math.min(1, p + 0.001));
      pose.rotation += (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
    }
  }
  pose.opacity = clamp(pose.opacity);
  pose.draw = clamp(pose.draw);
  return pose;
};
export const cameraPose = (keys: Illustration['camera'], time: number) => {
  const i = keys.findIndex((k) => k.time > time);
  if (i === 0) return keys[0];
  if (i === -1) return keys[keys.length - 1];
  const a = keys[i - 1],
    b = keys[i],
    p = smooth((time - a.time) / (b.time - a.time));
  return {
    x: a.x + (b.x - a.x) * p,
    y: a.y + (b.y - a.y) * p,
    zoom: a.zoom + (b.zoom - a.zoom) * p,
  };
};
// Factories return ordinary, serializable keyframe tracks. Later tracks replace earlier properties.
export const tween = (
  property: Track['property'],
  start: number,
  duration: number,
  from: number,
  to: number,
  easing: Track['easing'] = 'smooth',
): Track => ({
  property,
  easing,
  keys: [
    { time: start, value: from },
    { time: start + duration, value: to },
  ],
});
export const reveal = (start = 0, duration = 0.4) => [tween('opacity', start, duration, 0, 1)];
export const slide = (x: number, y: number, start = 0, duration = 0.6) => [
  tween('x', start, duration, x, 0),
  tween('y', start, duration, y, 0),
];
export const scale = (start = 0, duration = 0.55, from = 0.7, to = 1) => [
  tween('scaleX', start, duration, from, to, 'spring'),
  tween('scaleY', start, duration, from, to, 'spring'),
];
export const rotate = (start: number, duration: number, from: number, to: number) => [
  tween('rotation', start, duration, from, to),
];
export const draw = (start = 0, duration = 0.7) => [tween('draw', start, duration, 0, 1, 'linear')];
export const squash = (start = 0, duration = 0.45, amount = 0.2): Track[] =>
  ['scaleX', 'scaleY'].map((p, i) => ({
    property: p as Track['property'],
    easing: 'smooth',
    keys: [
      { time: start, value: 1 },
      { time: start + duration * 0.35, value: 1 + (i ? -amount : amount) },
      { time: start + duration * 0.7, value: 1 + (i ? amount : -amount) * 0.35 },
      { time: start + duration, value: 1 },
    ],
  }));
export const anticipate = (
  property: Track['property'],
  start: number,
  duration: number,
  from: number,
  to: number,
): Track[] => [
  {
    property,
    easing: 'smooth',
    keys: [
      { time: start, value: from },
      { time: start + duration * 0.2, value: from - (to - from) * 0.1 },
      { time: start + duration * 0.8, value: to + (to - from) * 0.06 },
      { time: start + duration, value: to },
    ],
  },
];
export const stagger = <T>(
  count: number,
  spacing: number,
  factory: (start: number, index: number) => T,
  start = 0,
) => Array.from({ length: count }, (_, i) => factory(start + i * spacing, i));

export const sampleColorTrack = (
  track: ColorTrack,
  time: number,
  resolve: (c: string) => string,
) => {
  const keys = track.keys;
  if (time <= keys[0].time) return resolve(keys[0].value);
  if (time >= keys[keys.length - 1].time) return resolve(keys[keys.length - 1].value);
  const i = keys.findIndex((k) => k.time > time),
    a = keys[i - 1],
    b = keys[i];
  const p = (time - a.time) / (b.time - a.time);
  return interpolateColors(
    track.easing === 'smooth' ? smooth(p) : p,
    [0, 1],
    [resolve(a.value), resolve(b.value)],
  );
};
