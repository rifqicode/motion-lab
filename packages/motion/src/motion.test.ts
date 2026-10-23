import { describe, it, expect } from 'vitest';
import {
  evaluateNodeReveal,
  evaluateConnectorDraw,
  evaluateEventTravel,
  evaluateNodePulse,
  resolveMotionState,
} from './presets.js';
import { computeLayout } from '@studio/diagrams';
import type { Scene, AnimationCue } from '@studio/schema';

describe('Pure Frame Motion Math & Determinism', () => {
  const cueReveal: AnimationCue = {
    id: 'c1',
    preset: 'node-reveal',
    targetId: 'db',
    startFrame: 20,
    durationFrames: 30,
    easing: 'spring',
  };

  it('evaluates node-reveal with deterministic boundaries', () => {
    // Before cue start
    const before = evaluateNodeReveal(10, cueReveal);
    expect(before.opacity).toBe(0);

    // After cue end
    const after = evaluateNodeReveal(60, cueReveal);
    expect(after.opacity).toBe(1);
    expect(after.scale).toBe(1);

    // During cue
    const mid = evaluateNodeReveal(35, cueReveal);
    expect(mid.opacity).toBeGreaterThan(0);
    expect(mid.opacity).toBeLessThanOrEqual(1);
    expect(mid.scale).toBeGreaterThan(0.7);

    // Re-evaluating frame 35 returns exact same numbers
    const midAgain = evaluateNodeReveal(35, cueReveal);
    expect(midAgain.opacity).toBe(mid.opacity);
    expect(midAgain.scale).toBe(mid.scale);
  });

  it('evaluates connector-draw with deterministic boundaries', () => {
    const cueDraw: AnimationCue = {
      id: 'c2',
      preset: 'connector-draw',
      targetId: 'e1',
      startFrame: 10,
      durationFrames: 20,
      easing: 'ease-out',
    };

    expect(evaluateConnectorDraw(5, cueDraw).drawProgress).toBe(0);
    expect(evaluateConnectorDraw(35, cueDraw).drawProgress).toBe(1);

    const mid = evaluateConnectorDraw(20, cueDraw);
    expect(mid.drawProgress).toBeGreaterThan(0);
    expect(mid.drawProgress).toBeLessThan(1);
  });

  it('evaluates event-travel particle calculation', () => {
    const cueTravel: AnimationCue = {
      id: 'c3',
      preset: 'event-travel',
      targetId: 'e1',
      startFrame: 10,
      durationFrames: 40,
    };

    const edgeLayout = {
      id: 'e1',
      from: 'db',
      to: 'wal',
      path: 'M 100 200 C 100 400, 500 400, 500 600',
      fromPoint: { x: 100, y: 200 },
      toPoint: { x: 500, y: 600 },
      labelPoint: { x: 300, y: 400 },
    };

    // Before cue
    expect(evaluateEventTravel(5, cueTravel, edgeLayout).particlePosition).toBeNull();
    // After cue
    expect(evaluateEventTravel(60, cueTravel, edgeLayout).particlePosition).toBeNull();

    // During cue
    const mid = evaluateEventTravel(30, cueTravel, edgeLayout);
    expect(mid.particlePosition).not.toBeNull();
    expect(mid.isActive).toBe(true);
    expect(mid.particlePosition!.x).toBeGreaterThan(100);
    expect(mid.particlePosition!.x).toBeLessThan(500);
  });

  it('evaluates node-pulse scale and glow', () => {
    const cuePulse: AnimationCue = {
      id: 'c4',
      preset: 'node-pulse',
      targetId: 'db',
      startFrame: 10,
      durationFrames: 20,
    };

    expect(evaluateNodePulse(5, cuePulse).pulseGlow).toBe(0);
    expect(evaluateNodePulse(35, cuePulse).pulseGlow).toBe(0);

    const mid = evaluateNodePulse(20, cuePulse);
    expect(mid.pulseGlow).toBeGreaterThan(0.9);
    expect(mid.scale).toBeGreaterThan(1.05);
  });

  it('resolves complete frame motion state deterministically', () => {
    const scene: Scene = {
      id: 's1',
      order: 1,
      type: 'data-flow',
      title: 'CDC Test',
      narrationText: 'Test text',
      durationFrames: 90,
      nodes: [
        { id: 'db', kind: 'database', label: 'PostgreSQL' },
        { id: 'wal', kind: 'log', label: 'WAL' },
      ],
      edges: [{ id: 'e1', from: 'db', to: 'wal', kind: 'data-flow' }],
      animationCues: [
        { id: 'r1', preset: 'node-reveal', targetId: 'db', startFrame: 0, durationFrames: 20 },
        { id: 'd1', preset: 'connector-draw', targetId: 'e1', startFrame: 10, durationFrames: 20 },
      ],
      cameraCues: [],
      subtitleSettings: { enabled: true, position: 'bottom', fontSize: 36, highlightColor: '#38bdf8' },
      revision: 1,
    };

    const layout = computeLayout(scene);
    const stateFrame15 = resolveMotionState(15, 30, scene, layout);

    expect(stateFrame15.nodes['db'].opacity).toBeGreaterThan(0);
    expect(stateFrame15.edges['e1'].drawProgress).toBeGreaterThan(0);

    // Call again to verify exact referential equality of computed values
    const stateFrame15_again = resolveMotionState(15, 30, scene, layout);
    expect(stateFrame15).toEqual(stateFrame15_again);
  });
});
