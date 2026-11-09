import React, { useId } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import type { ShotProps } from '../director/shot';
import { layoutFor } from './layout';
import { cameraPose, smooth } from './motion';
import { styles } from './style';
import { IllustrationCanvas } from './rendering/IllustrationCanvas';
// Compatibility exports for callers from before the renderer was split.
export { VectorNode } from './rendering/VectorNode';
export type { RenderContext } from './rendering/types';

export const IllustratedScene: React.FC<ShotProps> = ({
  headline,
  subline,
  illustration,
  shotDuration,
  direction,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const layout = layoutFor(width, height);
  const uid = useId().replace(/:/g, '');
  if (!illustration) return null;
  const palette = styles[illustration.style],
    time = frame / fps,
    camera = cameraPose(illustration.camera, time);
  const duration = shotDuration ?? durationInFrames;
  // Dip to the shared background without changing the compiled timeline.
  const fade =
    direction?.transition === 'fade'
      ? Math.min(smooth(time / 0.22), smooth((duration - 1 - frame) / fps / 0.22))
      : 1;
  const ctx = { time, fps, palette, prefix: uid, camera };
  return (
    <AbsoluteFill
      style={{
        background: illustration.background ?? palette.background,
        color: palette.ink,
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: layout.headerY,
          left: layout.margin,
          right: layout.rightMargin,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: layout.headerFont,
          letterSpacing: 4,
          color: palette.muted,
        }}
      >
        <span>{illustration.eyebrow}</span>
        <span>{illustration.edition}</span>
      </div>
      <AbsoluteFill style={{ opacity: fade }}>
        <div
          style={{
            position: 'absolute',
            top: layout.titleY,
            width: layout.titleWidth,
            left: layout.margin,
            right: layout.rightMargin,
            fontSize: layout.titleFont,
            lineHeight: 1.06,
            fontWeight: 800,
            letterSpacing: -3,
            whiteSpace: 'pre-line',
          }}
        >
          {headline}
        </div>
        <IllustrationCanvas illustration={illustration} ctx={ctx} viewport={layout.art} />
        <div
          style={{
            position: 'absolute',
            left: layout.margin,
            right: layout.rightMargin,
            top: layout.captionY,
            width: layout.captionWidth,
            fontSize: layout.captionFont,
            lineHeight: 1.5,
            whiteSpace: 'pre-line',
            color: palette.muted,
          }}
        >
          {subline}
        </div>
      </AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: layout.margin,
          bottom: layout.indicatorBottom,
          width: 90,
          height: 7,
          borderRadius: 4,
          background: palette.coral,
        }}
      />
    </AbsoluteFill>
  );
};
