import { z } from 'zod';
import { styles } from './style';
import { coffeeAssets } from './assets/coffee';
import { nodeSchema, type IllustrationNode, type Illustration } from './schema';
const assetSchema = z
  .object({
    id: z.string().min(1),
    bounds: z.tuple([
      z.number().finite(),
      z.number().finite(),
      z.number().finite().positive(),
      z.number().finite().positive(),
    ]),
    layers: z.array(nodeSchema).min(1),
    source: z.string().min(1),
    license: z.string().min(1),
    style: z.string().min(1),
  })
  .strict();
export type IllustrationAsset = z.infer<typeof assetSchema>;
export const illustrationAssets: Record<string, IllustrationAsset> = {};
export const registerIllustrationAsset = (input: unknown) => {
  const asset = assetSchema.parse(input);
  if (illustrationAssets[asset.id]) throw new Error(`Asset already registered: ${asset.id}`);
  const ids = new Set<string>();
  const visit = (nodes: IllustrationNode[]) =>
    nodes.forEach((n) => {
      if (ids.has(n.id)) throw new Error(`Duplicate asset layer target: ${n.id}`);
      ids.add(n.id);
      for (const paint of [n.fill, n.stroke])
        if (paint.startsWith('$') && !(paint.slice(1) in styles.education))
          throw new Error(`Unknown palette token: ${paint}`);
      visit(n.children);
    });
  visit(asset.layers);
  illustrationAssets[asset.id] = asset;
  return asset;
};
const bounds: Record<string, [number, number, number, number]> = {
  'coffee-bean': [-130, -140, 260, 280],
  'coffee-grounds': [-160, -35, 320, 70],
  'espresso-machine': [-350, -310, 700, 730],
  portafilter: [-165, -45, 530, 165],
  'cup-shell': [-225, -160, 495, 380],
  'cup-rim': [-160, -160, 320, 300],
  'espresso-cup': [-225, -160, 495, 380],
  steam: [-50, -200, 100, 210],
  'water-drop': [-25, -30, 50, 65],
  'coffee-scoop': [-120, -100, 400, 180],
};
for (const [id, layers] of Object.entries(coffeeAssets))
  registerIllustrationAsset({
    id,
    bounds: bounds[id],
    layers,
    source: 'Original MotionLab SVG; src/illustration/assets/coffee.ts',
    license:
      'Original agent-authored artwork; no third-party media; distribution follows repository terms',
    style: 'education token palette',
  });
export const validateIllustration = (scene: Illustration, duration: number) => {
  const visit = (nodes: IllustrationNode[], stack: string[] = [], inDefinition = false) => {
    const ids = new Set<string>();
    for (const n of nodes) {
      if (inDefinition && (n.clip || n.mask))
        throw new Error('Definitions cannot reference other definitions');
      if (n.clip && !scene.clips.some((c) => c.id === n.clip))
        throw new Error(`Unknown asset clip: ${n.clip}`);
      if (n.mask && !scene.masks.some((c) => c.id === n.mask))
        throw new Error(`Unknown asset mask: ${n.mask}`);
      if (ids.has(n.id)) throw new Error(`Duplicate layer ID: ${n.id}`);
      ids.add(n.id);
      for (const paint of [n.fill, n.stroke]) {
        if (paint.startsWith('@') && !scene.paints.some((p) => p.id === paint.slice(1)))
          throw new Error(`Unknown gradient: ${paint}`);
        if (paint.startsWith('$') && !(paint.slice(1) in styles.education))
          throw new Error(`Unknown palette token: ${paint}`);
      }
      for (const track of n.colorTracks) {
        for (const k of track.keys) {
          if (k.time > duration) throw new Error(`Color track exceeds shot: ${n.id}`);
          if (k.value.startsWith('@'))
            throw new Error('Color tracks require colors, not paint servers');
          if (k.value.startsWith('$') && !(k.value.slice(1) in styles.education))
            throw new Error(`Unknown color token: ${k.value}`);
        }
      }
      if (n.morph && n.morph.start + n.morph.duration > duration)
        throw new Error(`Morph exceeds shot: ${n.id}`);
      for (const t of n.tracks)
        if (t.keys.some((k) => k.time > duration))
          throw new Error(`Track exceeds shot duration: ${n.id}`);
      if (n.follow && n.follow.start + n.follow.duration > duration)
        throw new Error(`Path exceeds shot duration: ${n.id}`);
      if (n.asset) {
        const a = illustrationAssets[n.asset];
        if (!a) throw new Error(`Unknown illustration asset: ${n.asset}`);
        if (stack.includes(n.asset)) throw new Error(`Cyclic asset reference: ${n.asset}`);
        const layers = new Set<string>();
        const collect = (ns: IllustrationNode[]) =>
          ns.forEach((l) => {
            layers.add(l.id);
            collect(l.children);
          });
        collect(a.layers);
        for (const [id, tracks] of Object.entries(n.layerTracks)) {
          if (!layers.has(id)) throw new Error(`Unknown ${n.asset} layer: ${id}`);
          if (new Set(tracks.map((t) => t.property)).size !== tracks.length)
            throw new Error(`Duplicate override property: ${id}`);
          tracks.forEach((t) => {
            if (t.keys.some((k) => k.time > duration))
              throw new Error(`Layer track exceeds shot: ${id}`);
          });
        }
        visit(a.layers, [...stack, n.asset], inDefinition);
      } else if (Object.keys(n.layerTracks).length)
        throw new Error('layerTracks require an asset node');
      visit(n.children, stack, inDefinition);
    }
  };
  scene.paints.forEach((p) =>
    p.stops.forEach((s) => {
      if (s.color.startsWith('@'))
        throw new Error('Nested paint server references are unsupported');
      if (s.color.startsWith('$') && !(s.color.slice(1) in styles.education))
        throw new Error(`Unknown gradient token: ${s.color}`);
    }),
  );
  visit(scene.nodes);
  [...scene.clips, ...scene.masks].forEach((d) => visit(d.nodes, [], true));
  if (scene.camera.some((k) => k.time > duration))
    throw new Error('Camera key exceeds shot duration');
};
