import React from 'react';
import type { Illustration } from '../schema';
import type { RenderContext } from './types';
import type { layoutFor } from '../layout';
import { color } from '../style';
import { VectorNode } from './VectorNode';
import { clipGeometry } from './clipGeometry';
import { sortLayers } from './values';
// Only the SVG world belongs here. Titles and captions stay outside camera movement.
export const IllustrationCanvas: React.FC<{
  illustration: Illustration;
  ctx: RenderContext;
  viewport: ReturnType<typeof layoutFor>['art'];
}> = ({ illustration, ctx, viewport }) => (
  <svg
    viewBox={viewport.viewBox}
    style={{
      position: 'absolute',
      left: viewport.left,
      top: viewport.top,
      width: viewport.width,
      height: viewport.height,
      overflow: 'visible',
    }}
  >
    <defs>
      {illustration.paints.map((p) =>
        p.kind === 'linear' ? (
          <linearGradient
            key={p.id}
            id={`${ctx.prefix}-paint-${p.id}`}
            x1={p.x1}
            y1={p.y1}
            x2={p.x2}
            y2={p.y2}
          >
            {p.stops.map((s, i) => (
              <stop
                key={i}
                offset={s.offset}
                stopColor={color(s.color, ctx.palette)}
                stopOpacity={s.opacity}
              />
            ))}
          </linearGradient>
        ) : (
          <radialGradient key={p.id} id={`${ctx.prefix}-paint-${p.id}`} cx={p.cx} cy={p.cy} r={p.r}>
            {p.stops.map((s, i) => (
              <stop
                key={i}
                offset={s.offset}
                stopColor={color(s.color, ctx.palette)}
                stopOpacity={s.opacity}
              />
            ))}
          </radialGradient>
        ),
      )}
      {illustration.clips.map((c) => (
        <clipPath key={c.id} id={`${ctx.prefix}-clip-${c.id}`} clipPathUnits="userSpaceOnUse">
          {clipGeometry(c.nodes, ctx)}
        </clipPath>
      ))}
      {illustration.masks.map((m) => (
        <mask
          key={m.id}
          id={`${ctx.prefix}-mask-${m.id}`}
          maskUnits="userSpaceOnUse"
          x="-2000"
          y="-2000"
          width="6000"
          height="6000"
        >
          {m.nodes.map((n) => (
            <VectorNode key={n.id} node={n} ctx={ctx} />
          ))}
        </mask>
      ))}
    </defs>
    <g
      transform={`translate(540 1020) scale(${ctx.camera.zoom}) translate(${-ctx.camera.x} ${-ctx.camera.y})`}
    >
      {sortLayers(illustration.nodes).map((n) => (
        <VectorNode key={n.id} node={n} ctx={ctx} />
      ))}
    </g>
  </svg>
);
