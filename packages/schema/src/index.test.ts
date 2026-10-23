import { describe, it, expect } from 'vitest';
import {
  validateProject,
  safeValidateProject,
  validateScene,
  safeValidateScene,
} from './index.js';
import fs from 'node:fs';
import path from 'node:path';

describe('Project and Scene Schema Validation', () => {
  it('validates golden sample postgres-cdc correctly', () => {
    const goldenSamplePath = path.resolve(
      __dirname,
      '../../../examples/postgres-cdc/project.json'
    );
    const raw = fs.readFileSync(goldenSamplePath, 'utf-8');
    const data = JSON.parse(raw);

    const project = validateProject(data);
    expect(project.id).toBe('postgres-cdc');
    expect(project.scenes.length).toBe(3);
    expect(project.aspectRatio).toBe('9:16');
    expect(project.fps).toBe(30);
  });

  it('rejects scene with duplicate node IDs', () => {
    const invalidScene = {
      id: 's1',
      order: 1,
      type: 'data-flow',
      title: 'Test',
      narrationText: 'Test narration',
      durationFrames: 60,
      nodes: [
        { id: 'node-1', kind: 'database', label: 'DB 1' },
        { id: 'node-1', kind: 'service', label: 'DB 2' },
      ],
      edges: [],
      animationCues: [],
    };

    const res = safeValidateScene(invalidScene);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.message.includes('Duplicate node ID'))).toBe(true);
    }
  });

  it('rejects edges with missing source or target node', () => {
    const invalidScene = {
      id: 's1',
      order: 1,
      type: 'data-flow',
      title: 'Test',
      narrationText: 'Test narration',
      durationFrames: 60,
      nodes: [{ id: 'node-1', kind: 'database', label: 'DB 1' }],
      edges: [{ id: 'e1', from: 'node-1', to: 'non-existent', kind: 'data-flow' }],
      animationCues: [],
    };

    const res = safeValidateScene(invalidScene);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(
        res.error.issues.some((i) =>
          i.message.includes('does not exist in scene nodes')
        )
      ).toBe(true);
    }
  });

  it('rejects animation cues exceeding scene duration', () => {
    const invalidScene = {
      id: 's1',
      order: 1,
      type: 'data-flow',
      title: 'Test',
      narrationText: 'Test narration',
      durationFrames: 60,
      nodes: [{ id: 'node-1', kind: 'database', label: 'DB 1' }],
      edges: [],
      animationCues: [
        {
          id: 'cue-1',
          preset: 'node-reveal',
          targetId: 'node-1',
          startFrame: 45,
          durationFrames: 25, // ends at frame 70 > 60!
        },
      ],
    };

    const res = safeValidateScene(invalidScene);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(
        res.error.issues.some((i) =>
          i.message.includes('exceeds scene duration')
        )
      ).toBe(true);
    }
  });

  it('rejects scenes with more than 8 nodes (9:16 mobile safety cap)', () => {
    const invalidScene = {
      id: 's1',
      order: 1,
      type: 'data-flow',
      title: 'Overcrowded',
      narrationText: 'Overcrowded scene test',
      durationFrames: 60,
      nodes: Array.from({ length: 9 }).map((_, i) => ({
        id: `node-${i}`,
        kind: 'service',
        label: `Service ${i}`,
      })),
      edges: [],
      animationCues: [],
    };

    const res = safeValidateScene(invalidScene);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(
        res.error.issues.some((i) =>
          i.message.includes('Maximum 8 nodes allowed')
        )
      ).toBe(true);
    }
  });

  it('rejects project when sceneIds mismatch scenes array', () => {
    const invalidProject = {
      id: 'p1',
      title: 'Mismatch Test',
      sceneIds: ['s1', 's2'],
      scenes: [
        {
          id: 's1',
          order: 1,
          type: 'data-flow',
          title: 'S1',
          narrationText: 'T1',
          durationFrames: 60,
          nodes: [],
          edges: [],
          animationCues: [],
        },
      ],
    };

    const res = safeValidateProject(invalidProject);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.message.includes('does not match'))).toBe(true);
    }
  });
});
