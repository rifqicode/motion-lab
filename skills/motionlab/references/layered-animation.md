# Layered scene authoring

Source of truth: `src/illustration/schema.ts`, `motion.ts`, `IllustratedScene.tsx`, `registry.ts`. Worked data: `src/examples/coffee/shots/` and `shared.ts`; `coffee-benchmark.ts` is a compatibility export. Rendering implementation is under `src/illustration/rendering/`.

A shot uses `visual: 'illustrated'` and `illustration: {style, nodes, camera, clips, masks}`. All times are seconds local to the shot. Boards without video settings retain the legacy 15-second constraint; configured boards can derive their total from shot durations. The compiler rejects tracks or paths outside the shot duration.

Node kinds: group, asset, path, ellipse, rect, line, text. Use supported explicit properties rather than arbitrary SVG attributes. Each node has local x/y, scaleX/Y, rotation in degrees, opacity, anchor `[x,y]`, z order, depth and tracks. Groups apply transforms to descendants. Transform order is translation → rotation → scale → negative anchor. Track values replace base properties, rather than adding offsets. `follow` adds its cubic path displacement to the evaluated x/y.

Sibling order is stable by `z`; later nodes paint over earlier nodes at equal z. Place handles behind cup bodies; place rims over liquid. Treat typography as part of the composition, not as an object that must move continuously.

```ts
const arm = group('arm', [asset('bean', 'coffee-bean')], {
  x: 540,
  y: 980,
  tracks: [tween('rotation', 0.3, 0.6, -20, 0)],
});
```

Clips/masks are named scene definitions containing local-coordinate node geometry. `clip` and `mask` reference those names on a node. They operate in that node's coordinate system, before its placement transform. Use a white-filled path for a clip and white/black geometry for reveal/hide masks. Definition IDs are namespaced by the React scene instance to avoid collisions in overlapping previews. Clips flatten nested transforms into direct SVG geometry because Chrome does not clip reliably through nested groups. Definitions cannot recursively reference other definitions.

For a filling glass, keep shell, clipped liquid, crema, rim and steam separate. Animate liquid y upward under a stationary clip. Do not scale the whole glass to imply filling. Use `layerTracks` on an asset instance when you need to animate its internal parts; overrides replace the target layer's track array. Registered assets expose metadata and layer IDs in code.
