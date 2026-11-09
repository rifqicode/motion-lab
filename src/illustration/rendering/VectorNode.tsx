import React from 'react';
import type { IllustrationNode, Track } from '../schema';
import { illustrationAssets } from '../registry';
import { nodePose, sampleColorTrack } from '../motion';
import { color } from '../style';
import type { RenderContext } from './types';
import { resolvePaint, resolvePath, sortLayers } from './values';
export const VectorNode: React.FC<{
  node: IllustrationNode;
  ctx: RenderContext;
  overrides?: Record<string, Track[]>;
}> = ({ node, ctx, overrides }) => {
  const tracks = overrides?.[node.id] ?? node.tracks;
  const pose = nodePose({ ...node, tracks }, ctx.time, ctx.fps);
  const draw = { pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - pose.draw };
  const shape = {
    fill: resolvePaint(node.fill, ctx),
    stroke: resolvePaint(node.stroke, ctx),
    strokeWidth: node.strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  for (const t of node.colorTracks)
    shape[t.property] = sampleColorTrack(t, ctx.time, (c) => color(c, ctx.palette));
  const parallaxX = (ctx.camera.x - 540) * (1 - node.depth),
    parallaxY = (ctx.camera.y - 1020) * (1 - node.depth);
  return (
    <g
      data-layer={node.id}
      opacity={pose.opacity}
      transform={`translate(${pose.x + parallaxX} ${pose.y + parallaxY}) rotate(${pose.rotation}) skewX(${pose.skewX}) skewY(${pose.skewY}) scale(${pose.scaleX} ${pose.scaleY}) translate(${-node.anchor[0]} ${-node.anchor[1]})`}
      clipPath={node.clip ? `url(#${ctx.prefix}-clip-${node.clip})` : undefined}
      mask={node.mask ? `url(#${ctx.prefix}-mask-${node.mask})` : undefined}
    >
      {node.kind === 'path' && <path d={resolvePath(node, ctx.time)} {...shape} {...draw} />}
      {node.kind === 'ellipse' && <ellipse rx={node.rx} ry={node.ry} {...shape} />}
      {node.kind === 'rect' && (
        <rect width={node.width} height={node.height} rx={node.rx} {...shape} />
      )}
      {node.kind === 'line' && <line x2={node.x2} y2={node.y2} {...shape} {...draw} />}
      {node.kind === 'text' && (
        <text {...shape} fontSize={node.fontSize} fontWeight={600}>
          {node.text}
        </text>
      )}
      {node.kind === 'asset' &&
        sortLayers(illustrationAssets[node.asset!].layers).map((child) => (
          <VectorNode key={child.id} node={child} ctx={ctx} overrides={node.layerTracks} />
        ))}
      {sortLayers(node.children).map((child) => (
        <VectorNode key={child.id} node={child} ctx={ctx} overrides={overrides} />
      ))}
    </g>
  );
};
