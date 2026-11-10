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
  fps,
}) => {
  if (scene.subtitleSettings?.enabled === false) {
    return null;
  }

  const position = scene.subtitleSettings?.position || 'bottom';
  const fontSize = scene.subtitleSettings?.fontSize || 38;
  const highlightColor = scene.subtitleSettings?.highlightColor || theme.subtitleHighlight;

  const topOffset = position === 'top' ? 220 : position === 'middle' ? '50%' : undefined;
  const bottomOffset = position === 'bottom' ? 120 : undefined;

  const hasWordTimings = scene.wordTimings && scene.wordTimings.length > 0;
  const currentMs = (frame / fps) * 1000;

  // Render using word timings if available, else proportional distribution
  let renderedWords: Array<{ text: string; isHighlighted: boolean; isCurrent: boolean }> = [];

  if (hasWordTimings && scene.wordTimings) {
    renderedWords = scene.wordTimings.map((item) => {
      const isCurrent = currentMs >= item.startMs && currentMs <= item.endMs;
      const isHighlighted = currentMs >= item.startMs;
      return {
        text: item.text,
        isHighlighted,
        isCurrent,
      };
    });
  } else {
    const rawWords = scene.narrationText.split(/\s+/).filter(Boolean);
    const totalFrames = scene.durationFrames;
    const wordsProgress = Math.min(
      rawWords.length,
      Math.floor((frame / totalFrames) * rawWords.length) + 1
    );
    renderedWords = rawWords.map((word, idx) => ({
      text: word,
      isHighlighted: idx < wordsProgress,
      isCurrent: idx === wordsProgress - 1,
    }));
  }

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
          backgroundColor: 'rgba(15, 23, 42, 0.78)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          borderRadius: 24,
          padding: '24px 38px',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.22)',
          textAlign: 'center',
          fontFamily: theme.fontFamily,
          fontSize,
          lineHeight: 1.5,
          fontWeight: 600,
        }}
      >
        {renderedWords.map((wordItem, idx) => {
          const isCurrent = wordItem.isCurrent;
          const isPast = wordItem.isHighlighted && !isCurrent;

          return (
            <span
              key={idx}
              style={{
                color: isCurrent
                  ? highlightColor || '#38BDF8'
                  : isPast
                  ? '#F8FAFC'
                  : theme.secondaryText,
                opacity: isCurrent ? 1 : isPast ? 0.95 : 0.55,
                transform: isCurrent ? 'scale(1.12)' : 'scale(1)',
                transformOrigin: 'center center',
                transition: 'all 0.15s cubic-bezier(0.34, 1.56, 0.64, 1)',
                margin: isCurrent ? '0 0.22em' : '0 0.18em',
                display: 'inline-block',
                fontWeight: isCurrent ? 800 : isPast ? 650 : 500,
                textShadow: isCurrent
                  ? `0 0 16px rgba(56, 189, 248, 0.95), 0 0 32px rgba(168, 85, 247, 0.65)`
                  : undefined,
              }}
            >
              {wordItem.text}
            </span>
          );
        })}
      </div>
    </div>
  );
};
