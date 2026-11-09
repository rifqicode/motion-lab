# Storyboard contract

Read `src/storyboard/schema.ts`, `src/graph/schema.ts`, `src/storyboard/compile.ts` and `src/storyboard/example.ts` before writing a storyboard. The schemas are the source of truth.

Current project: 1080x1920, 60 FPS, 15 seconds total; `compileStoryboard()` rejects durations that do not sum to 15 seconds. Each shot needs a unique ID, narration, purpose, visual, durationSeconds, headline, assets, and direction. The `graph` visual additionally requires `graph.objects`.

For graph objects: `id`, `asset`, `position`, `scale`, and `motion` (preset, start, duration, amplitude). Available graph assets currently: router, earth, device, data_packet. Presets: reveal, float, rotate, travel, none. Available cameras: push, track, orbit, static. Energy: calm, medium, high. Transitions: cut, fade.

Do not assume a new asset ID is renderable. Update the asset registry, schema and renderer first. Narration and scene timing must agree; use shot previews to check.
