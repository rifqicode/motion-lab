import React from 'react';
import type { Scene } from '@studio/schema';
import type { ThemeTokens } from '@studio/themes';
import { computeLayout, type SceneLayout } from './layout.js';
import { NodeRenderer } from './nodes.js';
import { Connector, ConnectorMarkers } from './connectors.js';

export interface DiagramCanvasProps {
  scene: Scene;
  theme: ThemeTokens;
  layout?: SceneLayout;
  nodeStates?: Record<string, { opacity?: number; scale?: number; pulseGlow?: number; floatY?: number }>;
  edgeStates?: Record<
    string,
    {
      drawProgress?: number;
      particlePosition?: { x: number; y: number } | null;
      particles?: Array<{ x: number; y: number; opacity: number; scale: number }>;
      isActive?: boolean;
    }
  >;
  cameraTransform?: { scale: number; translateX: number; translateY: number };
  width?: number;
  height?: number;
  frame?: number;
}

export const DiagramCanvas: React.FC<DiagramCanvasProps> = ({
  scene,
  theme,
  layout: providedLayout,
  nodeStates = {},
  edgeStates = {},
  cameraTransform = { scale: 1, translateX: 0, translateY: 0 },
  width = 1080,
  height = 1920,
  frame = 0,
}) => {
  const layout = providedLayout || computeLayout(scene, width, height);

  // Subtle ambient lighting drift
  const glow1X = width * 0.65 + Math.sin(frame / 45) * 40;
  const glow1Y = height * 0.26 + Math.cos(frame / 50) * 40;
  const glow2X = width * 0.32 + Math.cos(frame / 40) * 40;
  const glow2Y = height * 0.74 + Math.sin(frame / 55) * 40;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{
        backgroundColor: theme.background,
        display: 'block',
        fontFamily: theme.fontFamily,
      }}
    >
      <ConnectorMarkers theme={theme} />

      {/* Grid pattern & high-tech ambient lighting */}
      <defs>
        <pattern
          id={`grid-${theme.id}`}
          width="48"
          height="48"
          patternUnits="userSpaceOnUse"
        >
          {/* Subtle circuit lines */}
          <path
            d="M 48 0 L 0 0 0 48"
            fill="none"
            stroke={theme.surfaceBorder}
            strokeWidth="0.75"
            opacity={0.25}
          />
          {/* Intersection nodes */}
          <circle cx="0" cy="0" r="1.5" fill={theme.accent} opacity={0.35} />
          <circle cx="24" cy="24" r="0.8" fill={theme.surfaceBorder} opacity={0.2} />
        </pattern>

        <radialGradient id={`ambient-glow-1-${theme.id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={theme.accent} stopOpacity={0.16} />
          <stop offset="70%" stopColor={theme.accent} stopOpacity={0.04} />
          <stop offset="100%" stopColor={theme.accent} stopOpacity={0} />
        </radialGradient>

        <radialGradient id={`ambient-glow-2-${theme.id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={theme.glowColor} stopOpacity={0.14} />
          <stop offset="70%" stopColor={theme.glowColor} stopOpacity={0.03} />
          <stop offset="100%" stopColor={theme.glowColor} stopOpacity={0} />
        </radialGradient>

        <filter id="ambient-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="35" />
        </filter>
      </defs>

      {/* Background tech grid */}
      <rect width={width} height={height} fill={`url(#grid-${theme.id})`} />

      {/* Floating ambient blooms */}
      <ellipse
        cx={glow1X}
        cy={glow1Y}
        rx={width * 0.55}
        ry={height * 0.28}
        fill={`url(#ambient-glow-1-${theme.id})`}
        pointerEvents="none"
      />
      <ellipse
        cx={glow2X}
        cy={glow2Y}
        rx={width * 0.58}
        ry={height * 0.3}
        fill={`url(#ambient-glow-2-${theme.id})`}
        pointerEvents="none"
      />

      {/* Camera transformed viewport group */}
      <g
        transform={`translate(${width / 2}, ${height / 2}) scale(${cameraTransform.scale}) translate(${-width / 2 + cameraTransform.translateX}, ${-height / 2 + cameraTransform.translateY})`}
      >
        {/* Render Edges */}
        <g className="edges-layer">
          {scene.edges.map((edge) => {
            const edgeLayout = layout.edges[edge.id];
            if (!edgeLayout) return null;
            const state = edgeStates[edge.id];
            return (
              <Connector
                key={edge.id}
                edge={edge}
                layout={edgeLayout}
                theme={theme}
                drawProgress={state?.drawProgress ?? 1}
                particlePosition={state?.particlePosition}
                particles={state?.particles}
                isActive={state?.isActive ?? false}
              />
            );
          })}
        </g>

        {/* Render Nodes */}
        <g className="nodes-layer">
          {scene.nodes.map((node) => {
            const bounds = layout.nodes[node.id];
            if (!bounds) return null;
            const state = nodeStates[node.id];
            return (
              <NodeRenderer
                key={node.id}
                node={node}
                bounds={bounds}
                theme={theme}
                opacity={state?.opacity ?? 1}
                scale={state?.scale ?? 1}
                pulseGlow={state?.pulseGlow ?? 0}
                floatY={state?.floatY ?? 0}
              />
            );
          })}
        </g>
      </g>
    </svg>
  );
};
