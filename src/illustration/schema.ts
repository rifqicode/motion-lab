import { compatiblePaths } from './path-morph';
import { z } from 'zod';
const number = z.number().finite();
export const point = z.tuple([number, number]);
export const trackSchema = z
  .object({
    property: z.enum([
      'x',
      'y',
      'scaleX',
      'scaleY',
      'rotation',
      'opacity',
      'draw',
      'skewX',
      'skewY',
    ]),
    keys: z.array(z.object({ time: number.nonnegative(), value: number })).min(2),
    easing: z.enum(['linear', 'smooth', 'spring']).default('smooth'),
  })
  .strict()
  .superRefine((t, ctx) => {
    t.keys.forEach((k, i) => {
      if (i && k.time <= t.keys[i - 1].time)
        ctx.addIssue({ code: 'custom', message: 'Track times must strictly increase' });
      if ((t.property === 'opacity' || t.property === 'draw') && (k.value < 0 || k.value > 1))
        ctx.addIssue({ code: 'custom', message: 'Opacity/draw keys must be 0–1' });
    });
  });
export type Track = z.infer<typeof trackSchema>;
export const colorTrackSchema = z
  .object({
    property: z.enum(['fill', 'stroke']),
    keys: z.array(z.object({ time: number.nonnegative(), value: z.string().min(1) })).min(2),
    easing: z.enum(['linear', 'smooth']).default('smooth'),
  })
  .strict()
  .superRefine((t, ctx) => {
    t.keys.forEach((k, i) => {
      if (i && k.time <= t.keys[i - 1].time)
        ctx.addIssue({ code: 'custom', message: 'Color track times must increase' });
    });
  });
export type ColorTrack = z.infer<typeof colorTrackSchema>;
export const paintSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/),
    kind: z.enum(['linear', 'radial']),
    x1: number.default(0),
    y1: number.default(0),
    x2: number.default(1),
    y2: number.default(1),
    cx: number.default(0.35),
    cy: number.default(0.3),
    r: number.positive().default(0.7),
    stops: z
      .array(
        z.object({
          offset: number.min(0).max(1),
          color: z.string().min(1),
          opacity: number.min(0).max(1).default(1),
        }),
      )
      .min(2),
  })
  .strict()
  .superRefine((p, ctx) => {
    p.stops.forEach((s, i) => {
      if (i && s.offset < p.stops[i - 1].offset)
        ctx.addIssue({ code: 'custom', message: 'Gradient stops must increase' });
    });
  });
const nodeBase = z
  .object({
    id: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/),
    kind: z.enum(['group', 'asset', 'path', 'ellipse', 'rect', 'line', 'text']),
    asset: z.string().optional(),
    x: number.default(0),
    y: number.default(0),
    scaleX: number.default(1),
    scaleY: number.default(1),
    rotation: number.default(0),
    skewX: number.default(0),
    skewY: number.default(0),
    opacity: number.min(0).max(1).default(1),
    anchor: point.default([0, 0]),
    z: number.default(0),
    depth: number.min(0).max(2).default(1),
    fill: z.string().default('none'),
    stroke: z.string().default('none'),
    strokeWidth: number.nonnegative().default(0),
    d: z.string().optional(),
    width: number.nonnegative().optional(),
    height: number.nonnegative().optional(),
    rx: number.nonnegative().optional(),
    ry: number.nonnegative().optional(),
    x2: number.optional(),
    y2: number.optional(),
    text: z.string().optional(),
    fontSize: number.positive().default(30),
    clip: z.string().optional(),
    mask: z.string().optional(),
    tracks: z.array(trackSchema).default([]),
    colorTracks: z.array(colorTrackSchema).default([]),
    morph: z
      .object({
        from: z.string(),
        to: z.string(),
        start: number.nonnegative(),
        duration: number.positive(),
      })
      .strict()
      .optional(),
    layerTracks: z.record(z.array(trackSchema)).default({}),
    follow: z
      .object({
        points: z.tuple([point, point, point, point]),
        start: number.nonnegative(),
        duration: number.positive(),
        orient: z.boolean().default(false),
      })
      .optional(),
  })
  .strict();
export type IllustrationNode = z.infer<typeof nodeBase> & { children: IllustrationNode[] };
export const nodeSchema: z.ZodType<IllustrationNode, z.ZodTypeDef, unknown> = nodeBase
  .extend({ children: z.lazy(() => z.array(nodeSchema)).default([]) })
  .superRefine((n, ctx) => {
    const need = (ok: boolean, message: string) => {
      if (!ok) ctx.addIssue({ code: 'custom', message });
    };
    if (n.kind === 'asset') need(Boolean(n.asset), 'Asset nodes require an asset ID');
    else
      need(
        !n.asset && !Object.keys(n.layerTracks).length,
        'Only asset nodes accept asset IDs or layer overrides',
      );
    if (n.kind === 'path') need(Boolean(n.d), 'Path nodes require SVG d');
    if (n.morph) {
      need(n.kind === 'path', 'Morph requires a path node');
      try {
        compatiblePaths(n.morph.from, n.morph.to);
      } catch (e) {
        need(false, (e as Error).message);
      }
    }
    need(
      new Set(n.colorTracks.map((t) => t.property)).size === n.colorTracks.length,
      'Use one color track per paint property',
    );
    if (n.kind === 'text') need(Boolean(n.text), 'Text nodes require text');
    if (n.kind === 'rect')
      need(n.width !== undefined && n.height !== undefined, 'Rects require width and height');
    if (n.kind === 'ellipse')
      need(n.rx !== undefined && n.ry !== undefined, 'Ellipses require rx and ry');
    if (n.kind === 'line')
      need(n.x2 !== undefined && n.y2 !== undefined, 'Lines require endpoints');
    need(
      new Set(n.tracks.map((t) => t.property)).size === n.tracks.length,
      'Use one track per property',
    );
    if (!['group', 'asset'].includes(n.kind))
      need(!n.children.length, 'Only groups and asset instances can have children');
  });
const definition = z.object({ id: z.string().min(1), nodes: z.array(nodeSchema).min(1) }).strict();
export const illustrationSchema = z
  .object({
    eyebrow: z.string().default('MOTIONLAB'),
    edition: z.string().default('ILLUSTRATED STORIES'),
    style: z.enum(['education', 'botanical', 'midnight']).default('education'),
    background: z.string().optional(),
    nodes: z.array(nodeSchema).min(1),
    clips: z.array(definition).default([]),
    paints: z.array(paintSchema).default([]),
    masks: z.array(definition).default([]),
    camera: z
      .array(
        z.object({ time: number.nonnegative(), x: number, y: number, zoom: number.positive() }),
      )
      .min(2)
      .default([
        { time: 0, x: 540, y: 1020, zoom: 1 },
        { time: 0.001, x: 540, y: 1020, zoom: 1 },
      ]),
  })
  .strict()
  .superRefine((s, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
    for (let i = 1; i < s.camera.length; i++)
      if (s.camera[i].time <= s.camera[i - 1].time) fail('Camera times must strictly increase');
    if (new Set(s.paints.map((p) => p.id)).size !== s.paints.length) fail('Duplicate paint ID');
    const clips = new Set(s.clips.map((c) => c.id)),
      masks = new Set(s.masks.map((c) => c.id));
    if (clips.size !== s.clips.length || masks.size !== s.masks.length)
      fail('Duplicate clip/mask ID');
    const visit = (nodes: IllustrationNode[], ids: Set<string>) =>
      nodes.forEach((n) => {
        if (ids.has(n.id)) fail(`Duplicate illustration node ID: ${n.id}`);
        ids.add(n.id);
        if (n.clip && !clips.has(n.clip)) fail(`Unknown clip: ${n.clip}`);
        if (n.mask && !masks.has(n.mask)) fail(`Unknown mask: ${n.mask}`);
        visit(n.children, new Set());
      });
    visit(s.nodes, new Set());
    [...s.clips, ...s.masks].forEach((d) => {
      visit(d.nodes, new Set());
      const check = (ns: IllustrationNode[]) =>
        ns.forEach((n) => {
          if (n.clip || n.mask) fail('Definitions cannot reference clips or masks');
          check(n.children);
        });
      check(d.nodes);
    });
  });
export type Illustration = z.infer<typeof illustrationSchema>;
