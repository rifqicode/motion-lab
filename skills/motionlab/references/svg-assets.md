# SVG creation and asset generation contract

The initial provider is agent-authored vector data. No paid image API, flattened image segmentation, remote media fetch or XML ingestion is required.

1. Analyze the script into visible objects and interactions. List independently moving parts and their pivots.
2. Inspect `src/illustration/registry.ts` and registered asset layers. Reuse compatible geometry; do not rename a phone into a grinder.
3. Generate missing vector paths using `node`, `path`, `ellipse`, `rect`, and `group` from `author.ts`. An external provider may supply SVG as reference, but manually convert supported shapes into validated node data. Do not inject raw SVG strings, scripts, styles, event handlers or foreignObject markup.
4. Give every independently animated part a semantic ID: body, needle, liquid, crema, etc. Group articulated children under the correct pivot. All timing belongs in shot data or explicit asset layer tracks, not opaque CSS.
5. Follow the [Style Bible](style-bible.md), document bounds `[minX,minY,width,height]`, local origin, source, license, and style family. `coffee.ts` is the example authoring module, not the only permissible asset family.
6. Register nodes and metadata in `illustrationAssets`. The compiler validates known references, layer targets, track times and cycles. Run `npm run test:engine`; add invariants for any new renderer feature.
7. Render isolated asset instances and the intended shot at several frames. Check outlines, shade containment, proportional consistency, clipping and motion. Registering an ID does not prove that it looks right.

Assets are code-native vectors, not files that must be placed in public. External raster/audio files still belong in `public/` and use Remotion `staticFile()`. A raster may be a texture or background; independent motion requires separate layers or a purpose-built vector asset.

Asset instance `layerTracks` maps an existing layer ID to replacement tracks. This changes animation, not geometry or paint. Use scene children or new asset variants for structural differences. Layer IDs within an asset must be unique; scene node IDs are scoped to siblings. Assets must not refer to scene-specific masks/clips unless that dependency is explicitly provided and validated.
