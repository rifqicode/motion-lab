import React from 'react';
import type { Scene } from '@studio/schema';
import type { ThemeTokens } from '@studio/themes';

export interface SubtitleOverlayProps {
  scene: Scene;
  theme: ThemeTokens;
  frame: number;
  fps: number;
}

export const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({
  scene,
  theme,
  frame,
}) => {
  if (scene.subtitleSettings?.enabled === false) {
    return null;
  }

  const words = scene.narrationText.split(/\s+/).filter(Boolean);
  const totalFrames = scene.durationFrames;

  // Distribute word highlights evenly across scene duration
  const wordsProgress = Math.min(words.length, Math.floor((frame / totalFrames) * words.length) + 1);

  const position = scene.subtitleSettings?.position || 'bottom';
  const fontSize = scene.subtitleSettings?.fontSize || 38;
  const highlightColor = scene.subtitleSettings?.highlightColor || theme.subtitleHighlight;

  const topOffset = position === 'top' ? 220 : position === 'middle' ? '50%' : undefined;
  const bottomOffset = position === 'bottom' ? 120 : undefined;

  return (
    <div
      style={{
        position: 'absolute',
        left: 60,
        right: 60,
        top: topOffset,
        bottom: bottomOffset,
        transform: position === 'middle' ? 'translateY(-50%)' : undefined,
        display: 'flex',
        justifyContent: 'center',
        zIndex: 20,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          maxWidth: 960,
          backgroundColor: theme.subtitleBg,
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderRadius: 24,
          padding: '24px 36px',
          border: `1px solid ${theme.surfaceBorder}`,
          boxShadow: '0 12px 36px rgba(0,0,0,0.4)',
          textAlign: 'center',
          fontFamily: theme.fontFamily,
          fontSize,
          lineHeight: 1.45,
          fontWeight: 600,
        }}
      >
        {words.map((word, idx) => {
          const isHighlighted = idx < wordsProgress;
          return (
            <span
              key={idx}
              style={{
                color: isHighlighted ? highlightColor : theme.secondaryText,
                transition: 'color 0.15s ease',
                marginRight: '0.28em',
                display: 'inline-block',
                fontWeight: isHighlighted ? 700 : 500,
              }}
            >
              {word}
            </span>
          );
        })}
      </div>
    </div>
  );
};
