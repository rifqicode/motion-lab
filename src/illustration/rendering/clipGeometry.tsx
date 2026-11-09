import React from 'react';
import type { IllustrationNode } from '../schema';
import { illustrationAssets } from '../registry';
import { nodePose } from '../motion';
import type { RenderContext } from './types';
import { resolvePath } from './values';
// SVG clipPath requires direct geometry; flatten group transforms rather than nesting <g>.
export const clipGeometry = (
  nodes: IllustrationNode[],
  ctx: RenderContext,
  parent = '',
): React.ReactElement[] =>
  nodes.flatMap((node) => {
    const pose = nodePose(node, ctx.time, ctx.fps);
    const transform = `${parent} translate(${pose.x} ${pose.y}) rotate(${pose.rotation}) skewX(${pose.skewX}) skewY(${pose.skewY}) scale(${pose.scaleX} ${pose.scaleY}) translate(${-node.anchor[0]} ${-node.anchor[1]})`;
    const props = { key: transform + node.id, transform, fill: 'white' };
    if (node.kind === 'group') return clipGeometry(node.children, ctx, transform);
    if (node.kind === 'asset')
      return clipGeometry(illustrationAssets[node.asset!].layers, ctx, transform);
    if (node.kind === 'path') return [<path {...props} d={resolvePath(node, ctx.time)} />];
    if (node.kind === 'ellipse') return [<ellipse {...props} rx={node.rx} ry={node.ry} />];
    if (node.kind === 'rect')
      return [<rect {...props} width={node.width} height={node.height} rx={node.rx} />];
    if (node.kind === 'text')
      return [
        <text {...props} fontSize={node.fontSize}>
          {node.text}
        </text>,
      ];
    return [
      <line {...props} x2={node.x2} y2={node.y2} stroke="white" strokeWidth={node.strokeWidth} />,
    ];
  });
