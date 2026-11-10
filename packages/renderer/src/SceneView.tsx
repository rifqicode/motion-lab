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
  transitionDuration?: number;
}

export const SceneView: React.FC<SceneViewProps> = ({
  scene,
  theme,
  sceneIndex,
  totalScenes,
  transitionDuration = 15,
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

  // Smooth cross-dissolve & zoom transition calculation
  const isFirstScene = sceneIndex === 0;
  const isLastScene = sceneIndex === totalScenes - 1;

  let transitionOpacity = 1;
  let transitionScale = 1;

  if (!isFirstScene && frame < transitionDuration) {
    const enterProgress = Math.min(1, Math.max(0, frame / transitionDuration));
    // Smooth cubic ease-out
    const eased = 1 - Math.pow(1 - enterProgress, 3);
    transitionOpacity = eased;
    transitionScale = 0.96 + 0.04 * eased;
  } else if (!isLastScene && frame > scene.durationFrames) {
    const exitProgress = Math.min(
      1,
      Math.max(0, (frame - scene.durationFrames) / transitionDuration)
    );
    // Smooth quadratic ease-in
    const eased = Math.pow(exitProgress, 2);
    transitionOpacity = Math.max(0, 1 - eased);
    transitionScale = 1 + 0.035 * eased;
  }

  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        backgroundColor: theme.background,
        overflow: 'hidden',
        opacity: transitionOpacity,
        transform: `scale(${transitionScale})`,
        transformOrigin: 'center center',
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
        frame={frame}
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
