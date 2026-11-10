import React from 'react';
import type { Edge } from '@studio/schema';
import type { ThemeTokens } from '@studio/themes';
import type { EdgeLayout } from './layout.js';

export interface ConnectorProps {
  edge: Edge;
  layout: EdgeLayout;
  theme: ThemeTokens;
  drawProgress?: number; // 0 to 1
  particlePosition?: { x: number; y: number } | null;
  particles?: Array<{ x: number; y: number; opacity: number; scale: number }>;
  isActive?: boolean;
}

export const Connector: React.FC<ConnectorProps> = ({
  edge,
  layout,
  theme,
  drawProgress = 1,
  particlePosition,
  particles,
  isActive = false,
}) => {
  const markerId = `arrowhead-${theme.id}-${isActive ? 'active' : 'normal'}`;
  const strokeColor = isActive ? theme.edgeActiveColor : theme.edgeColor;

  // Approximate stroke dashoffset based on a nominal length if path length is not yet known
  const estimatedLength = 600;
  const dashOffset = (1 - Math.max(0, Math.min(1, drawProgress))) * estimatedLength;

  return (
    <g className="diagram-connector">
      {/* Background wider hit/glow line if active */}
      {isActive && (
        <path
          d={layout.path}
          fill="none"
          stroke={theme.glowColor}
          strokeWidth={theme.strokeWidth + 6}
          strokeLinecap="round"
        />
      )}

      {/* Main connector path */}
      <path
        d={layout.path}
        fill="none"
        stroke={strokeColor}
        strokeWidth={theme.strokeWidth}
        strokeDasharray={edge.kind === 'sync' ? '8 6' : undefined}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        markerEnd={`url(#${markerId})`}
      />

      {/* Edge label if any */}
      {edge.label && (
        <g transform={`translate(${layout.labelPoint.x}, ${layout.labelPoint.y})`}>
          <rect
            x={-50}
            y={-14}
            width={100}
            height={28}
            rx={6}
            fill={theme.surface}
            stroke={theme.surfaceBorder}
            strokeWidth={1.5}
          />
          <text
            x={0}
            y={4}
            textAnchor="middle"
            fill={theme.secondaryText}
            fontFamily={theme.fontFamily}
            fontSize={12}
            fontWeight="500"
          >
            {edge.label}
          </text>
        </g>
      )}

      {/* Continuous glowing stream particles & event traveler */}
      {particles && particles.length > 0 ? (
        <g className="stream-particles">
          {particles.map((p, idx) => (
            <g
              key={idx}
              transform={`translate(${p.x}, ${p.y}) scale(${p.scale})`}
              opacity={p.opacity}
            >
              <circle
                r={idx === 0 ? 12 : 7}
                fill={theme.particleColor}
                filter={`drop-shadow(0 0 ${idx === 0 ? 10 : 5}px ${theme.particleColor})`}
              />
              <circle r={idx === 0 ? 5 : 2.5} fill="#FFFFFF" />
            </g>
          ))}
        </g>
      ) : particlePosition ? (
        <g transform={`translate(${particlePosition.x}, ${particlePosition.y})`}>
          <circle
            r={10}
            fill={theme.particleColor}
            filter={`drop-shadow(0 0 8px ${theme.particleColor})`}
          />
          <circle r={5} fill="#FFFFFF" />
        </g>
      ) : null}
    </g>
  );
};

export const ConnectorMarkers: React.FC<{ theme: ThemeTokens }> = ({ theme }) => {
  return (
    <defs>
      <marker
        id={`arrowhead-${theme.id}-normal`}
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill={theme.edgeColor} />
      </marker>
      <marker
        id={`arrowhead-${theme.id}-active`}
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill={theme.edgeActiveColor} />
      </marker>
    </defs>
  );
};
