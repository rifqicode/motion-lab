import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { illustrationAssets } from './registry';
import { styles } from './style';
import { VectorNode } from './rendering/VectorNode';
import type { IllustrationNode } from './schema';
const isolate = (nodes: IllustrationNode[], id: string): IllustrationNode[] =>
  nodes.flatMap((n) => {
    if (n.id === id) return [n];
    const children = isolate(n.children, id);
    return children.length ? [{ ...n, children }] : [];
  });
export const AssetInspector: React.FC<{
  assetId: string;
  style?: keyof typeof styles;
  layer?: string;
  bounds?: boolean;
}> = ({ assetId, style = 'education', layer, bounds = true }) => {
  const frame = useCurrentFrame(),
    { fps } = useVideoConfig();
  const asset = illustrationAssets[assetId];
  if (!asset) throw new Error(`Unknown inspector asset: ${assetId}`);
  const selected =
    layer ??
    (frame >= fps
      ? asset.layers[(Math.floor(frame / fps) - 1) % asset.layers.length].id
      : undefined);
  const nodes = selected ? isolate(asset.layers, selected) : asset.layers;
  if (!nodes.length) throw new Error(`Unknown inspector layer: ${selected}`);
  const [x, y, w, h] = asset.bounds,
    palette = styles[style];
  const ctx = {
    time: 0,
    fps,
    palette,
    prefix: `inspector-${assetId}`,
    camera: { x: 540, y: 1020, zoom: 1 },
  };
  return (
    <AbsoluteFill
      style={{
        background: palette.background,
        fontFamily: 'Arial',
        color: palette.ink,
        padding: 35,
      }}
    >
      <div style={{ fontSize: 30, fontWeight: 700 }}>{assetId}</div>
      <div style={{ fontSize: 20, marginTop: 8 }}>
        Layer: {selected ?? 'all'} · {style}
      </div>
      <svg
        viewBox={`${x - w * 0.14} ${y - h * 0.14} ${w * 1.28} ${h * 1.28}`}
        style={{ position: 'absolute', left: '8%', top: '23%', width: '84%', height: '60%' }}
      >
        {nodes.map((n) => (
          <VectorNode key={n.id} node={n} ctx={ctx} />
        ))}
        {bounds && (
          <>
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              fill="none"
              stroke={palette.coral}
              strokeWidth={w / 250}
              strokeDasharray={`${w / 70} ${w / 70}`}
            />
            <path
              d={`M${-w * 0.025} 0 H${w * 0.025} M0 ${-h * 0.025} V${h * 0.025}`}
              stroke={palette.teal}
              strokeWidth={w / 180}
            />
          </>
        )}
      </svg>
      <div
        style={{
          position: 'absolute',
          left: 35,
          right: 35,
          bottom: 35,
          fontSize: 17,
          lineHeight: 1.5,
        }}
      >
        {asset.layers
          .slice(0, 6)
          .map((n) => n.id)
          .join(' · ')}
        {asset.layers.length > 6 ? ` … (${asset.layers.length} layers)` : ''}
        <br />
        Crosshair = local pivot. Dashed box = declared bounds.
      </div>
    </AbsoluteFill>
  );
};
export const AssetGallery: React.FC<{ style: keyof typeof styles }> = ({ style }) => {
  const palette = styles[style],
    { width, height } = useVideoConfig();
  const ids = Object.keys(illustrationAssets);
  const rows = Math.ceil(ids.length / 3),
    cellWidth = (width - 100) / 3,
    cellHeight = (height - 170) / rows;
  return (
    <AbsoluteFill
      style={{ background: palette.background, fontFamily: 'Arial', color: palette.ink }}
    >
      <div style={{ position: 'absolute', left: 50, top: 35, fontSize: 35, fontWeight: 700 }}>
        MotionLab asset review / {style}
      </div>
      {ids.map((id, i) => (
        <div
          key={id}
          style={{
            position: 'absolute',
            left: 50 + (i % 3) * cellWidth,
            top: 120 + Math.floor(i / 3) * cellHeight,
            width: cellWidth - 15,
            height: cellHeight - 15,
            border: `1px solid ${palette.shadow}`,
            overflow: 'hidden',
          }}
        >
          <AssetThumbnail assetId={id} style={style} />
        </div>
      ))}
    </AbsoluteFill>
  );
};
const AssetThumbnail: React.FC<{ assetId: string; style: keyof typeof styles }> = ({
  assetId,
  style,
}) => {
  const a = illustrationAssets[assetId],
    [x, y, w, h] = a.bounds,
    palette = styles[style],
    frame = useCurrentFrame(),
    { fps } = useVideoConfig();
  const ctx = {
    time: 0,
    fps,
    palette,
    prefix: `gallery-${assetId}`,
    camera: { x: 540, y: 1020, zoom: 1 },
  };
  return (
    <>
      <div style={{ position: 'absolute', left: 18, top: 15, fontSize: 23, fontWeight: 700 }}>
        {assetId}
      </div>
      <svg
        viewBox={`${x - w * 0.1} ${y - h * 0.1} ${w * 1.2} ${h * 1.2}`}
        style={{ position: 'absolute', left: '8%', top: '20%', width: '84%', height: '68%' }}
      >
        {a.layers.map((n) => (
          <VectorNode key={n.id} node={n} ctx={ctx} />
        ))}
        {frame >= fps && (
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            fill="none"
            stroke={palette.coral}
            strokeWidth={w / 180}
            strokeDasharray={`${w / 60}`}
          />
        )}
      </svg>
      <div style={{ position: 'absolute', left: 18, bottom: 12, fontSize: 16 }}>
        {a.layers.length} layers · origin (0,0)
      </div>
    </>
  );
};
