import React from 'react';
import { Sequence, Audio } from 'remotion';
import type { Project } from '@studio/schema';
import { getTheme } from '@studio/themes';
import { SceneView } from './SceneView.js';

export interface MainCompositionProps {
  project: Project;
}

export const MainComposition: React.FC<MainCompositionProps> = ({ project }) => {
  const theme = getTheme(project.themeId);
  const TRANSITION_FRAMES = 15;

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
      {/* Background Music Loop */}
      {project.bgmFile ? (
        <Audio
          src={project.bgmFile}
          volume={0.12}
          loop
        />
      ) : null}

      {/* Render Scenes with smooth cross-dissolve & zoom transitions */}
      {project.scenes.map((scene, index) => {
        const fromFrame = currentFrameOffset;
        currentFrameOffset += scene.durationFrames;
        const isLastScene = index === project.scenes.length - 1;
        const sequenceDuration = scene.durationFrames + (isLastScene ? 0 : TRANSITION_FRAMES);

        return (
          <Sequence
            key={scene.id}
            from={fromFrame}
            durationInFrames={sequenceDuration}
            name={scene.title}
          >
            {scene.audioFile ? <Audio src={scene.audioFile} volume={1.0} /> : null}
            <SceneView
              scene={scene}
              theme={theme}
              sceneIndex={index}
              totalScenes={project.scenes.length}
              transitionDuration={TRANSITION_FRAMES}
            />
          </Sequence>
        );
      })}
    </div>
  );
};
