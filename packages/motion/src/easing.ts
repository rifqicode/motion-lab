export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function interpolate(
  value: number,
  inputRange: [number, number],
  outputRange: [number, number],
  extrapolate: 'clamp' | 'identity' = 'clamp'
): number {
  const [inMin, inMax] = inputRange;
  const [outMin, outMax] = outputRange;

  if (inMin === inMax) {
    return outMin;
  }

  let progress = (value - inMin) / (inMax - inMin);

  if (extrapolate === 'clamp') {
    progress = clamp(progress, 0, 1);
  }

  return outMin + progress * (outMax - outMin);
}

export function applyEasing(t: number, easing: string = 'spring'): number {
  const clampedT = clamp(t, 0, 1);
  switch (easing) {
    case 'linear':
      return clampedT;
    case 'ease-in':
      return clampedT * clampedT;
    case 'ease-out':
      return clampedT * (2 - clampedT);
    case 'ease-in-out':
      return clampedT < 0.5 ? 2 * clampedT * clampedT : -1 + (4 - 2 * clampedT) * clampedT;
    case 'spring':
    default:
      // Damped harmonic oscillation curve: starts at 0, overshoots to ~1.05 around 0.6, settles cleanly at 1.0
      if (clampedT === 0) return 0;
      if (clampedT === 1) return 1;
      return 1 - Math.exp(-6 * clampedT) * Math.cos(6.5 * clampedT);
  }
}
