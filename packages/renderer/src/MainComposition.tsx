import React from 'react';
import { Sequence } from 'remotion';
import type { Project } from '@studio/schema';
import { getTheme } from '@studio/themes';
import { SceneView } from './SceneView.js';

export interface MainCompositionProps {
  project: Project;
}

export const MainComposition: React.FC<MainCompositionProps> = ({ project }) => {
  const theme = getTheme(project.themeId);

  let currentFrameOffset = 0;

  return (
    <div
      style={{
        width: 1080,
        height: 1920,
        position: 'relative',
        backgroundColor: theme.background,
      }}
    >
      {project.scenes.map((scene, index) => {
        const fromFrame = currentFrameOffset;
        currentFrameOffset += scene.durationFrames;

        return (
          <Sequence
            key={scene.id}
            from={fromFrame}
            durationInFrames={scene.durationFrames}
            name={scene.title}
          >
            <SceneView
              scene={scene}
              theme={theme}
              sceneIndex={index}
              totalScenes={project.scenes.length}
            />
          </Sequence>
        );
      })}
    </div>
  );
};
