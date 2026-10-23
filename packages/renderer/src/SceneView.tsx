import React, { useMemo } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import type { Scene } from '@studio/schema';
import type { ThemeTokens } from '@studio/themes';
import { computeLayout, DiagramCanvas } from '@studio/diagrams';
import { resolveMotionState } from '@studio/motion';
import { HeaderOverlay } from './HeaderOverlay.js';
import { SubtitleOverlay } from './SubtitleOverlay.js';

export interface SceneViewProps {
  scene: Scene;
  theme: ThemeTokens;
  sceneIndex: number;
  totalScenes: number;
}

export const SceneView: React.FC<SceneViewProps> = ({
  scene,
  theme,
  sceneIndex,
  totalScenes,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // Layout is pure and depends only on scene and viewport dimensions
  const layout = useMemo(
    () => computeLayout(scene, width, height),
    [scene, width, height]
  );

  // Motion state is a pure frame calculation
  const motionState = resolveMotionState(frame, fps, scene, layout);

  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        backgroundColor: theme.background,
        overflow: 'hidden',
      }}
    >
      <HeaderOverlay
        scene={scene}
        theme={theme}
        sceneIndex={sceneIndex}
        totalScenes={totalScenes}
      />

      <DiagramCanvas
        scene={scene}
        theme={theme}
        layout={layout}
        nodeStates={motionState.nodes}
        edgeStates={motionState.edges}
        cameraTransform={motionState.camera}
        width={width}
        height={height}
      />

      <SubtitleOverlay
        scene={scene}
        theme={theme}
        frame={frame}
        fps={fps}
      />
    </div>
  );
};
