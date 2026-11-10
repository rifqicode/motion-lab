import React from 'react';
import type { Node } from '@studio/schema';
import type { ThemeTokens } from '@studio/themes';
import type { NodeBounds } from './layout.js';

export interface NodeProps {
  node: Node;
  bounds: NodeBounds;
  theme: ThemeTokens;
  opacity?: number;
  scale?: number;
  pulseGlow?: number;
  floatY?: number;
}

export const DatabaseNode: React.FC<NodeProps> = ({
  node,
  bounds,
  theme,
  opacity = 1,
  scale = 1,
  pulseGlow = 0,
}) => {
  const { width, height } = bounds;
  const cylinderCapH = 22;

  const glowFilter = pulseGlow > 0 ? `drop-shadow(0 0 ${12 * pulseGlow}px ${theme.glowColor})` : undefined;

  return (
    <g
      transform={`translate(${bounds.x + width / 2}, ${bounds.y + height / 2}) scale(${scale}) translate(${-width / 2}, ${-height / 2})`}
      opacity={opacity}
      style={{ filter: glowFilter }}
    >
      {/* Cylinder body */}
      <path
        d={`M 16 ${cylinderCapH} 
            L 16 ${height - cylinderCapH} 
            A ${width / 2 - 16} ${cylinderCapH} 0 0 0 ${width - 16} ${height - cylinderCapH} 
            L ${width - 16} ${cylinderCapH} 
            Z`}
        fill={theme.surface}
        stroke={theme.surfaceBorder}
        strokeWidth={theme.strokeWidth}
      />
      {/* Bottom ring highlight */}
      <path
        d={`M 16 ${height - cylinderCapH} 
            A ${width / 2 - 16} ${cylinderCapH} 0 0 0 ${width - 16} ${height - cylinderCapH}`}
        fill="none"
        stroke={theme.accent}
        strokeWidth={2}
        opacity={0.6}
      />
      {/* Middle ring highlight */}
      <path
        d={`M 16 ${height / 2} 
            A ${width / 2 - 16} ${cylinderCapH} 0 0 0 ${width - 16} ${height / 2}`}
        fill="none"
        stroke={theme.surfaceBorder}
        strokeWidth={2}
      />
      {/* Top cap ellipse */}
      <ellipse
        cx={width / 2}
        cy={cylinderCapH}
        rx={width / 2 - 16}
        ry={cylinderCapH}
        fill={theme.surface}
        stroke={theme.accent}
        strokeWidth={theme.strokeWidth}
      />

      {/* Label */}
      <text
        x={width / 2}
        y={height / 2 + 10}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={theme.surfaceText}
        fontFamily={theme.fontFamily}
        fontWeight="bold"
        fontSize={22}
      >
        {node.label}
      </text>

      {/* Kind badge */}
      <rect
        x={width / 2 - 35}
        y={height - 24}
        width={70}
        height={20}
        rx={6}
        fill={theme.badgeBg}
      />
      <text
        x={width / 2}
        y={height - 10}
        textAnchor="middle"
        fill={theme.badgeText}
        fontFamily={theme.fontFamily}
        fontSize={11}
        fontWeight="600"
      >
        DATABASE
      </text>
    </g>
  );
};

export const LogNode: React.FC<NodeProps> = ({
  node,
  bounds,
  theme,
  opacity = 1,
  scale = 1,
  pulseGlow = 0,
}) => {
  const { width, height } = bounds;
  const glowFilter = pulseGlow > 0 ? `drop-shadow(0 0 ${12 * pulseGlow}px ${theme.glowColor})` : undefined;

  return (
    <g
      transform={`translate(${bounds.x + width / 2}, ${bounds.y + height / 2}) scale(${scale}) translate(${-width / 2}, ${-height / 2})`}
      opacity={opacity}
      style={{ filter: glowFilter }}
    >
      {/* Ledger background with fold */}
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        rx={theme.nodeRadius}
        fill={theme.surface}
        stroke={theme.accentSecondary}
        strokeWidth={theme.strokeWidth}
      />
      {/* Log lines accent */}
      <line x1={20} y1={28} x2={width - 20} y2={28} stroke={theme.surfaceBorder} strokeWidth={2} strokeDasharray="6 4" />
      <line x1={20} y1={height - 28} x2={width - 20} y2={height - 28} stroke={theme.surfaceBorder} strokeWidth={2} strokeDasharray="6 4" />

      {/* Label */}
      <text
        x={width / 2}
        y={height / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={theme.surfaceText}
        fontFamily={theme.fontFamily}
        fontWeight="bold"
        fontSize={22}
      >
        {node.label}
      </text>

      {/* Badge */}
      <rect
        x={width / 2 - 30}
        y={height - 22}
        width={60}
        height={18}
        rx={5}
        fill={theme.badgeBg}
      />
      <text
        x={width / 2}
        y={height - 9}
        textAnchor="middle"
        fill={theme.accentSecondary}
        fontFamily={theme.fontFamily}
        fontSize={11}
        fontWeight="600"
      >
        WAL / LOG
      </text>
    </g>
  );
};

export const ServiceNode: React.FC<NodeProps> = ({
  node,
  bounds,
  theme,
  opacity = 1,
  scale = 1,
  pulseGlow = 0,
}) => {
  const { width, height } = bounds;
  const glowFilter = pulseGlow > 0 ? `drop-shadow(0 0 ${12 * pulseGlow}px ${theme.glowColor})` : undefined;

  return (
    <g
      transform={`translate(${bounds.x + width / 2}, ${bounds.y + height / 2}) scale(${scale}) translate(${-width / 2}, ${-height / 2})`}
      opacity={opacity}
      style={{ filter: glowFilter }}
    >
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        rx={theme.nodeRadius}
        fill={theme.surface}
        stroke={theme.surfaceBorder}
        strokeWidth={theme.strokeWidth}
      />
      {/* Header highlight bar */}
      <path
        d={`M 0 ${theme.nodeRadius} Q 0 0 ${theme.nodeRadius} 0 L ${width - theme.nodeRadius} 0 Q ${width} 0 ${width} ${theme.nodeRadius} L ${width} 12 L 0 12 Z`}
        fill={theme.accent}
      />

      <text
        x={width / 2}
        y={height / 2 + 4}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={theme.surfaceText}
        fontFamily={theme.fontFamily}
        fontWeight="bold"
        fontSize={22}
      >
        {node.label}
      </text>

      <rect
        x={width / 2 - 34}
        y={height - 24}
        width={68}
        height={18}
        rx={5}
        fill={theme.badgeBg}
      />
      <text
        x={width / 2}
        y={height - 11}
        textAnchor="middle"
        fill={theme.badgeText}
        fontFamily={theme.fontFamily}
        fontSize={11}
        fontWeight="600"
      >
        SERVICE
      </text>
    </g>
  );
};

export const QueueNode: React.FC<NodeProps> = ({
  node,
  bounds,
  theme,
  opacity = 1,
  scale = 1,
  pulseGlow = 0,
}) => {
  const { width, height } = bounds;
  const glowFilter = pulseGlow > 0 ? `drop-shadow(0 0 ${12 * pulseGlow}px ${theme.glowColor})` : undefined;
  const capW = 20;

  return (
    <g
      transform={`translate(${bounds.x + width / 2}, ${bounds.y + height / 2}) scale(${scale}) translate(${-width / 2}, ${-height / 2})`}
      opacity={opacity}
      style={{ filter: glowFilter }}
    >
      {/* Pipe body */}
      <rect
        x={capW}
        y={8}
        width={width - 2 * capW}
        height={height - 16}
        fill={theme.surface}
        stroke={theme.surfaceBorder}
        strokeWidth={theme.strokeWidth}
      />
      {/* Left cap */}
      <ellipse
        cx={capW}
        cy={height / 2}
        rx={capW - 4}
        ry={(height - 16) / 2}
        fill={theme.surface}
        stroke={theme.accent}
        strokeWidth={theme.strokeWidth}
      />
      {/* Right cap */}
      <ellipse
        cx={width - capW}
        cy={height / 2}
        rx={capW - 4}
        ry={(height - 16) / 2}
        fill={theme.surface}
        stroke={theme.accent}
        strokeWidth={theme.strokeWidth}
      />

      <text
        x={width / 2}
        y={height / 2 + 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={theme.surfaceText}
        fontFamily={theme.fontFamily}
        fontWeight="bold"
        fontSize={22}
      >
        {node.label}
      </text>

      <rect
        x={width / 2 - 32}
        y={height - 24}
        width={64}
        height={18}
        rx={5}
        fill={theme.badgeBg}
      />
      <text
        x={width / 2}
        y={height - 11}
        textAnchor="middle"
        fill={theme.badgeText}
        fontFamily={theme.fontFamily}
        fontSize={11}
        fontWeight="600"
      >
        QUEUE
      </text>
    </g>
  );
};

export const ClientNode: React.FC<NodeProps> = ({
  node,
  bounds,
  theme,
  opacity = 1,
  scale = 1,
  pulseGlow = 0,
}) => {
  const { width, height } = bounds;
  const glowFilter = pulseGlow > 0 ? `drop-shadow(0 0 ${12 * pulseGlow}px ${theme.glowColor})` : undefined;

  return (
    <g
      transform={`translate(${bounds.x + width / 2}, ${bounds.y + height / 2}) scale(${scale}) translate(${-width / 2}, ${-height / 2})`}
      opacity={opacity}
      style={{ filter: glowFilter }}
    >
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        rx={theme.nodeRadius}
        fill={theme.surface}
        stroke={theme.surfaceBorder}
        strokeWidth={theme.strokeWidth}
      />
      {/* Bottom home indicator bar */}
      <line
        x1={width / 2 - 24}
        y1={height - 10}
        x2={width / 2 + 24}
        y2={height - 10}
        stroke={theme.surfaceBorder}
        strokeWidth={3}
        strokeLinecap="round"
      />

      <text
        x={width / 2}
        y={height / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={theme.surfaceText}
        fontFamily={theme.fontFamily}
        fontWeight="bold"
        fontSize={22}
      >
        {node.label}
      </text>
    </g>
  );
};

export const CustomNode: React.FC<NodeProps> = (props) => {
  return <ServiceNode {...props} />;
};

export const NodeRenderer: React.FC<NodeProps> = (props) => {
  const floatY = props.floatY ?? 0;
  const isPulsingOrActive = (props.pulseGlow ?? 0) > 0.05;

  const renderInner = () => {
    switch (props.node.kind) {
      case 'database':
        return <DatabaseNode {...props} />;
      case 'log':
        return <LogNode {...props} />;
      case 'queue':
        return <QueueNode {...props} />;
      case 'client':
        return <ClientNode {...props} />;
      case 'service':
        return <ServiceNode {...props} />;
      case 'custom':
      default:
        return <CustomNode {...props} />;
    }
  };

  return (
    <g
      transform={floatY !== 0 ? `translate(0, ${floatY.toFixed(2)})` : undefined}
      className={`node-wrapper node-${props.node.id}`}
    >
      {/* Radial ambient glow behind focused / active / breathing node */}
      {isPulsingOrActive && (
        <circle
          cx={props.bounds.centerX}
          cy={props.bounds.centerY}
          r={Math.max(props.bounds.width, props.bounds.height) * 0.72}
          fill={props.theme.glowColor}
          opacity={Math.min(0.4, (props.pulseGlow ?? 0) * 0.45)}
          style={{ filter: 'blur(28px)' }}
          pointerEvents="none"
        />
      )}
      {renderInner()}
    </g>
  );
};
