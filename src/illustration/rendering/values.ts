import { morphPath } from '../path-morph';
import { smooth } from '../motion';
import { color } from '../style';
import type { IllustrationNode } from '../schema';
import type { RenderContext } from './types';
export const resolvePaint = (value: string, ctx: RenderContext) =>
  value.startsWith('@') ? `url(#${ctx.prefix}-paint-${value.slice(1)})` : color(value, ctx.palette);
export const resolvePath = (n: IllustrationNode, time: number) =>
  n.morph
    ? morphPath(n.morph.from, n.morph.to, smooth((time - n.morph.start) / n.morph.duration))
    : n.d;
export const sortLayers = (nodes: IllustrationNode[]) => [...nodes].sort((a, b) => a.z - b.z);
