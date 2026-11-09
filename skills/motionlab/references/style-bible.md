# MotionLab Illustration Style Bible

The default is a warm, colorful educational editorial illustration: recognizable objects, confident silhouettes, restrained depth, expressive motion. This is an art direction system rather than a requirement to reuse the coffee layout.

## Palette and hierarchy

Tokens live in `src/illustration/style.ts`. Use `$token` fills/strokes so assets share a palette. Choose one preset per film, or make a motivated transition.

| Role           | education (default) | botanical  | midnight |
| -------------- | ------------------- | ---------- | -------- |
| Background     | warm cream          | pale sage  | deep ink |
| Ink            | blue charcoal       | forest     | ivory    |
| Action accent  | coral               | terracotta | peach    |
| Process accent | teal                | eucalyptus | mint     |
| Payoff accent  | gold                | ochre      | honey    |

Keep roughly 70% quiet field, 20% object color, 10% accent. Use ink for silhouette and titles, muted for supporting copy. Reserve the strongest accent for the action the viewer must notice. Literal white/black is appropriate for SVG mask geometry; use tokens for visible object paint. Explicit brand colors are permitted when justified.

## Shape and proportions

Draw identifying details before decoration: a bean needs an organic oval and central crease; an espresso machine needs a grouphead, basket, gauge, bay and drip tray. Compose objects from meaningful parts, not renamed rectangles. The primitives are drawing tools, not the subject.

Use a consistent 1080 × 1920 design canvas. Each asset uses local coordinates around a useful pivot. Document local bounds. Favor rounded contours and generous internal negative space; use angles to indicate mechanisms and direction. At ordinary asset scale, use 7-unit outlines, 3–5-unit inner detail, rounded stroke caps/joins, 14–55-unit corner radii depending on object size. Scaling an asset scales its stroke; avoid placing the same asset at extreme scales in one shot.

## Depth, light and texture

Default to solid color plus one inset darker shape and one short highlight. Light comes from the upper left. Keep shade geometry within the silhouette. Ground objects with a soft-colored ellipse, not a dark fog. Do not add glass cards, neon rims or decorative floating controls.

Shading can be built with ordinary layered SVG shapes and opacity. The renderer supports validated linear/radial paint definitions; use restrained gradients when they improve material clarity. Filter definitions remain unsupported. Textures are optional and should use seeded, sparse marks that survive the target resolution. The coffee grain placement is deterministic arithmetic, not runtime random noise.

## Perspective and object illustration

Use a frontal 2.5D view with shallow ellipses for openings and saucers. All circular horizontal surfaces should have comparable flattening. Keep handle thickness, wall thickness and corner treatment consistent. A transparent teaching cutaway may expose an interior, but distinguish that convention in the story. It need not simulate physical fluids.

## Characters

Faces are optional and should support the teaching idea. Use two simple eyes and one expressive curve, place them clear of identifying features, and animate the body silhouette independently. Do not add a face to every object. Maintain consistent eye size and expression vocabulary for recurring characters. Hands and faces need their own layers if they act.

## Composition and storytelling

Use a dominant subject with a clear action axis. Use the mobile-safe layout from `src/render/config.ts` and `src/illustration/layout.ts`: at 1080×1920 reserve left 80px, right 160px, top 150px and bottom 320px for important text. Default portrait typography is 90px headline, 34px caption and 25–29px labels in Arial; recheck wraps at actual resolution. Do not put fine type inside a moving object unless its hold permits reading.

Show cause before effect: load grounds, dock basket, start pressure, collect extract. Independent objects should move because the story needs them to. Use one focal action at a time, then hold. Camera movement should reveal a relationship or improve the silhouette. It should settle while viewers read.

## Presets

`education`, `botanical`, and `midnight` recolor tokenized assets without altering geometry. To add a preset, add the same token set to `style.ts` and the enum in `schema.ts`; inspect all assets under it. Presets do not automatically guarantee contrast. Change proportions, stroke language or character style only through a deliberate asset family with a new consistency review.
