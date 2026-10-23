import React from 'react';
import { Composition, registerRoot } from 'remotion';
import type { Project } from '@studio/schema';
import { MainComposition } from './MainComposition.js';

export interface RootProps {
  project?: Project;
}

export const defaultMockProject: Project = {
  id: 'preview-project',
  title: 'Preview Project',
  language: 'id-ID',
  aspectRatio: '9:16',
  fps: 30,
  themeId: 'midnight-tech',
  sceneIds: ['scene-1'],
  scenes: [
    {
      id: 'scene-1',
      order: 1,
      type: 'data-flow',
      title: 'Preview Scene',
      narrationText: 'Ini adalah preview scene untuk verifikasi visual.',
      durationFrames: 90,
      nodes: [
        { id: 'db', kind: 'database', label: 'PostgreSQL' },
        { id: 'wal', kind: 'log', label: 'WAL' },
      ],
      edges: [{ id: 'e1', from: 'db', to: 'wal', kind: 'data-flow' }],
      animationCues: [
        { id: 'c1', preset: 'node-reveal', targetId: 'db', startFrame: 0, durationFrames: 20, easing: 'spring' },
        { id: 'c2', preset: 'connector-draw', targetId: 'e1', startFrame: 15, durationFrames: 25, easing: 'ease-out' },
        { id: 'c3', preset: 'node-reveal', targetId: 'wal', startFrame: 30, durationFrames: 20, easing: 'spring' },
      ],
      cameraCues: [],
      subtitleSettings: { enabled: true, position: 'bottom', fontSize: 38, highlightColor: '#38bdf8' },
      revision: 1,
    },
  ],
  revision: 1,
};

export const RemotionRoot: React.FC<RootProps> = ({ project = defaultMockProject }) => {
  const totalDurationFrames = project.scenes.reduce(
    (acc, scene) => acc + scene.durationFrames,
    0
  );

  return (
    <>
      <Composition
        id="Main"
        component={MainComposition as any}
        durationInFrames={Math.max(1, totalDurationFrames)}
        fps={project.fps || 30}
        width={1080}
        height={1920}
        defaultProps={{
          project,
        }}
        calculateMetadata={({ props }) => {
          const currentProject = props?.project || project;
          const duration = currentProject.scenes.reduce(
            (acc, s) => acc + s.durationFrames,
            0
          );
          return {
            durationInFrames: Math.max(1, duration),
            fps: currentProject.fps || 30,
            width: 1080,
            height: 1920,
            props: currentProject ? { project: currentProject } : undefined,
          };
        }}
      />
    </>
  );
};

// Auto-register when imported by Remotion CLI or bundler
registerRoot(RemotionRoot);

export default RemotionRoot;
