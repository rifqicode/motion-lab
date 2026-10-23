import { describe, it, expect } from 'vitest';
import { computeLayout, SAFE_MARGIN_H, SAFE_MARGIN_TOP, SAFE_MARGIN_BOTTOM, VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from './layout.js';
import type { Scene } from '@studio/schema';

describe('Layout Algorithms and Safe Bounds', () => {
  const baseScene: Scene = {
    id: 's1',
    order: 1,
    type: 'data-flow',
    title: 'Test Flow',
    narrationText: 'Test Narration',
    durationFrames: 60,
    nodes: [
      { id: 'n1', kind: 'database', label: 'DB' },
      { id: 'n2', kind: 'service', label: 'Service' },
      { id: 'n3', kind: 'queue', label: 'Queue' },
    ],
    edges: [
      { id: 'e1', from: 'n1', to: 'n2', kind: 'data-flow' },
      { id: 'e2', from: 'n2', to: 'n3', kind: 'data-flow' },
    ],
    animationCues: [],
    cameraCues: [],
    subtitleSettings: { enabled: true, position: 'bottom', fontSize: 36, highlightColor: '#38bdf8' },
    revision: 1,
  };

  it('keeps all nodes within 9:16 safe area bounds in data-flow layout', () => {
    const layout = computeLayout(baseScene);
    for (const nodeId of ['n1', 'n2', 'n3']) {
      const b = layout.nodes[nodeId];
      expect(b).toBeDefined();
      expect(b.x).toBeGreaterThanOrEqual(SAFE_MARGIN_H);
      expect(b.x + b.width).toBeLessThanOrEqual(VIEWPORT_WIDTH - SAFE_MARGIN_H);
      expect(b.y).toBeGreaterThanOrEqual(SAFE_MARGIN_TOP);
      expect(b.y + b.height).toBeLessThanOrEqual(VIEWPORT_HEIGHT - SAFE_MARGIN_BOTTOM);
    }
  });

  it('computes edge paths with valid bezier and endpoint anchors', () => {
    const layout = computeLayout(baseScene);
    expect(layout.edges['e1']).toBeDefined();
    expect(layout.edges['e1'].path).toMatch(/^M [\d.-]+ [\d.-]+ C [\d.-]+/);
    expect(layout.edges['e1'].fromPoint).toBeDefined();
    expect(layout.edges['e1'].toPoint).toBeDefined();
  });

  it('correctly computes comparison layout', () => {
    const compScene: Scene = {
      ...baseScene,
      type: 'comparison',
      nodes: [
        { id: 'a', kind: 'database', label: 'Postgres' },
        { id: 'b', kind: 'database', label: 'MySQL' },
      ],
      edges: [],
    };
    const layout = computeLayout(compScene);
    expect(layout.nodes['a']).toBeDefined();
    expect(layout.nodes['b']).toBeDefined();
    // Top node should be above bottom node
    expect(layout.nodes['a'].y).toBeLessThan(layout.nodes['b'].y);
  });

  it('correctly computes focus-explain layout with central hero and satellites', () => {
    const focusScene: Scene = {
      ...baseScene,
      type: 'focus-explain',
      nodes: [
        { id: 'hero', kind: 'service', label: 'Core Engine' },
        { id: 'sat1', kind: 'queue', label: 'Worker 1' },
        { id: 'sat2', kind: 'queue', label: 'Worker 2' },
      ],
      edges: [],
    };
    const layout = computeLayout(focusScene);
    const hero = layout.nodes['hero'];
    expect(hero).toBeDefined();
    // Hero node center should be at center of viewport
    expect(hero.centerX).toBeCloseTo(VIEWPORT_WIDTH / 2, 0);
  });
});
