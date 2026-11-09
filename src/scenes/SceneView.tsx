import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { sceneRegistry } from './registry';
import { shotFade, type ShotProps } from '../director/shot';
export const SceneView: React.FC<
  ShotProps & { kind: keyof typeof sceneRegistry; duration: number }
> = ({ kind, duration, ...props }) => {
  const frame = useCurrentFrame(),
    { fps } = useVideoConfig();
  const Component = sceneRegistry[kind];
  return (
    <AbsoluteFill
      style={{
        background:
          kind === 'illustrated' ? undefined : 'radial-gradient(ellipse at center,#164463,#030b16)',
        fontFamily: 'Arial,sans-serif',
        opacity: kind === 'illustrated' ? 1 : shotFade(frame, duration, fps, props.direction),
      }}
    >
      <Component {...props} shotDuration={duration} />
    </AbsoluteFill>
  );
};
