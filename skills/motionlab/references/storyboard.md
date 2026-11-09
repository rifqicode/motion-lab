# Storyboard contract

Read `src/storyboard/schema.ts`, `src/storyboard/compile.ts`, `src/illustration/schema.ts` and `src/storyboard/example.ts` before authoring. Default delivery: mobile portrait 1080 × 1920 (9:16), 60 FPS for short-form content; use `MOBILE_VIDEO`. The legacy duration is 15 seconds. Top-level `video` settings support other formats and totals; see [engine workflow](engine-workflow.md). Compiler rejects duplicate shot IDs, mismatched total duration and invalid references/timings.

Every shot needs id, narration, purpose, visual, durationSeconds, headline, assets and direction. `graph` additionally requires `graph.objects`; `illustrated` additionally requires `illustration.nodes`. Three-dimensional graph schema remains unchanged in `src/graph/schema.ts`.

Use declarative illustration data for original vector stories. `src/examples/coffee/storyboard.ts`, `cues.ts`, and `shots/` demonstrate asset instances, hierarchy, layer overrides, clipping, masking, cubic movement, path drawing, camera holds and multiple independent actions. Add assets to `src/illustration/registry.ts` before referencing them. Asset manifests resolve both existing semantic assets and the illustration registry.

Legacy visual kinds phone, network, finale, graph, bean, extraction and espresso remain valid. Direction camera remains a legacy 3D control; illustrated camera direction is the explicit `illustration.camera` track. Direction transition selects cut or fade. Narration is script metadata; it does not generate audio. Describe silent productions honestly.

Shots and full film share `SceneView` so timing, background and fades agree. Pass compiled `duration` as `shotDuration` to illustrated scenes; `useVideoConfig().durationInFrames` alone gives the full film length inside a Sequence.
