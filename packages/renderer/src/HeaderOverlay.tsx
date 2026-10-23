import React from 'react';
import type { Scene } from '@studio/schema';
import type { ThemeTokens } from '@studio/themes';

export interface HeaderOverlayProps {
  scene: Scene;
  theme: ThemeTokens;
  sceneIndex: number;
  totalScenes: number;
}

export const HeaderOverlay: React.FC<HeaderOverlayProps> = ({
  scene,
  theme,
  sceneIndex,
  totalScenes,
}) => {
  return (
    <div
      style={{
        position: 'absolute',
        top: 60,
        left: 60,
        right: 60,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontFamily: theme.fontFamily,
        zIndex: 10,
      }}
    >
      <div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: theme.accent,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: 6,
          }}
        >
          STEP {String(sceneIndex + 1).padStart(2, '0')} / {String(totalScenes).padStart(2, '0')}
        </div>
        <div
          style={{
            fontSize: 36,
            fontWeight: 800,
            color: theme.surfaceText,
            lineHeight: 1.2,
          }}
        >
          {scene.title}
        </div>
      </div>
      <div
        style={{
          padding: '8px 18px',
          borderRadius: 24,
          backgroundColor: theme.badgeBg,
          color: theme.badgeText,
          fontSize: 18,
          fontWeight: 700,
          border: `1px solid ${theme.surfaceBorder}`,
        }}
      >
        {scene.type.toUpperCase()}
      </div>
    </div>
  );
};
