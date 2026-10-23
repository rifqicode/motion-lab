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
  nodeStates?: Record<string, { opacity?: number; scale?: number; pulseGlow?: number }>;
  edgeStates?: Record<string, { drawProgress?: number; particlePosition?: { x: number; y: number } | null; isActive?: boolean }>;
  cameraTransform?: { scale: number; translateX: number; translateY: number };
  width?: number;
  height?: number;
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
}) => {
  const layout = providedLayout || computeLayout(scene, width, height);

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

      {/* Grid pattern / subtle background texture */}
      <defs>
        <pattern
          id={`grid-${theme.id}`}
          width="40"
          height="40"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="20" cy="20" r="1.2" fill={theme.surfaceBorder} opacity={0.35} />
        </pattern>
      </defs>
      <rect width={width} height={height} fill={`url(#grid-${theme.id})`} />

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
              />
            );
          })}
        </g>
      </g>
    </svg>
  );
};
