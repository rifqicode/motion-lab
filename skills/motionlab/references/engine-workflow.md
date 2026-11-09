# Engine authoring and preview workflow

The illustrated engine now has automatic PNG review reports, dependency-based timing, an asset inspector, configurable output metadata and adaptive layouts, plus additional SVG paint/deformation controls. It still renders deterministically from frame time. Studio and MP4 export are separate, explicit actions.

## Preview reports and before/after review

```sh
npm run preview:report -- --variants
npm run preview:report -- --variants --baseline out/preview/<previous-run>
npm run preview:assets
npm run preview:assets -- --only Asset-coffee-grounds
npm run preview:report -- --report-only out/preview/<existing-run>
```

The first command samples every shot at entry/quarter/middle/three-quarter/exit plus cue starts, midpoints and ends. It also samples film boundaries and optional square/landscape compositions. Reports include all three palette galleries. Asset-only mode additionally renders the registered asset inspectors in complete-object and first isolated-layer states.

Each run gets a directory under `out/preview/`; `out/preview/index.html` points to the latest successful run. The directory contains PNG frames, one PNG/HTML contact sheet per composition, a review HTML page and `manifest.json` with cue times, frames, dimensions and baseline coverage. This pipeline uses the installed Remotion bundle/renderer and Chrome, without Pillow or an image-generation API. Set `MOTIONLAB_BROWSER` to choose another Chrome executable. It uses a small installed-version-specific CDP adapter to capture HTML contact sheets.

Use `--report-only <existing-run-directory>` to rebuild HTML/contact sheets without rendering the film frames again.

Pass a baseline **run directory**, not its parent. Exact composition/frame names are paired and copied into the report, so it remains self-contained. The wipe slider shows current on the left and previous on the right. Missing references are labeled; changed timing or dimensions require a deliberate comparison. No automated quality score or pixel-equivalence claim is made. New run directories preserve previous artifacts; they are git-ignored and can be cleaned up by the user when no longer needed.

## Event-based timing

Each shot optionally has `cues`:

```ts
cues: {
  load: {at: .2, duration: .75},
  dock: {after: 'load', offset: .15, duration: .65},
  pressure: {after: 'dock', offset: .05, duration: .5},
  flow: {after: 'pressure', edge: 'start', offset: .3, duration: .35},
}
```

`after` defaults to the referenced cue's **end**, so extending `load.duration` moves docking, pressure and flow. Set `edge:'start'` for intentional overlap. References resolve before the numeric storyboard schema runs; missing dependencies, cycles, negative times and shot overruns fail compilation.

JSON timeline times can use `{cue:'flow', edge:'start', offset:.1}`. `compileStoryboard()` is the public validation/compilation boundary; do not pre-parse unresolved cue references with `storyboardSchema.parse()`.

For existing numeric authoring helpers, `referenceIllustration(scene, definitions, bindings)` converts selected node track times into live cue references. Bindings use slash-separated node paths, can select one property, and can include descendants with `subtree:true`. They cover numeric tracks, color tracks, asset layer tracks, following paths and morph start times. Missing binding paths/cue IDs fail early. The compiled renderer receives ordinary numeric times only. Duration values inside tracks remain explicit; cues shift actions without automatically stretching all their internal motion. Resize a cue/action intentionally when stretching is desired.

The coffee extraction/payoff shots use live cue references. Changing `storyboard.shots[1].cues.load.duration` shifts the actual basket/flow/collection tracks, not only a metadata label. Engine tests exercise that behavior.

## Asset review

- `Gallery-education`, `Gallery-botanical`, `Gallery-midnight`: registered family together; frame 0 is clean art, frame 60 adds bounds.
- `Asset-<asset-id>`: frame 0 shows all layers, then one top-level layer per second. Bounds and the local pivot crosshair are visible.
- Inspector input props: `assetId`, `style`, optional `layer`, `bounds`.

Inspect proportions, strokes, shades, local pivots and declared bounds before using a new object. Layer selection retains ancestor transforms when selecting a nested declared layer. Asset-local motion is frozen at time zero while the inspector timeline cycles layer visibility. Inspection does not infer bounds or guarantee physically correct proportions. The generic inspector currently targets self-contained registered assets; assets that require scene-local masks or paint servers need their context supplied before they can be reviewed there.

## Flexible format and duration

Default delivery is mobile portrait **1080 × 1920 (9:16), 60 FPS**, intended for TikTok, YouTube Shorts and Instagram Reels. `MOBILE_VIDEO` in `src/render/config.ts` is the shared preset. The illustrated portrait layout reserves an internal text-safe envelope: left 80px, right 160px, top 150px and bottom 320px at full resolution. These are composition guides, not official platform UI guarantees; inspect the actual app overlay before publishing. Square and landscape remain optional variants.

```ts
video: {width: 1920, height: 1080, fps: 30},
```

Set top-level `video` on a storyboard to choose dimensions and frame rate. With `video` present and `durationSeconds` omitted, total duration comes from the sum of shot durations. If specified, durationSeconds is checked against that sum. Boards without `video` retain the legacy 1080×1920 / 60 FPS / 15-second contract.

Frame boundaries are rounded from cumulative seconds to avoid per-shot rounding drift. Root compositions use compiled metadata, rather than a separate hardcoded duration. Illustrated layout adapts to portrait, square or landscape: a shared logical art coordinate system is fitted into an illustration region, with separate title/caption safe areas. Landscape puts copy on the left and art on the right. Square stacks them more tightly. `layoutFor()` is the layout adapter; legacy 3D/custom React scenes retain their own layout behavior.

The coffee film exposes `MotionLab-square` and `MotionLab-landscape` previews in addition to the default portrait. These formats adapt layout, not the narrative or reading speed. Extremely long copy, unusual aspect ratios and camera excursions still need art direction and frame review.

## Richer visual controls

- `paints`: validated `linear`/`radial` definitions, referenced as `fill:'@paint-id'`. Stop colors accept palette tokens. IDs are scoped per mounted scene.
- `colorTracks`: independently animate fill/stroke between concrete colors or palette tokens using linear/smooth interpolation. Gradient references cannot be interpolated as colors.
- `skewX` / `skewY`: base values and numeric tracks, applied after rotation and before scale.
- `morph`: `{from,to,start,duration}` on path nodes. Explicit M/L/C/Q/Z commands must match in type, case and coordinate count. Numeric coordinates interpolate; unsupported implicit repeats/arcs and mismatched topology fail validation.

The coffee payoff uses a crema gradient, a darkening liquid fill and a settling surface ripple. This is controlled deformation, not arbitrary SVG morphing, bone animation, fluid simulation or IK.

## Checks and limits

`npm run check` runs ESLint, Prettier validation, TypeScript and engine invariants. Preview report generation additionally bundles and renders real browser frames. Inspect the report; rendering alone is not a quality pass. Audio remains script metadata and is outside this improvement batch. No MP4 export is part of preview or asset review.
