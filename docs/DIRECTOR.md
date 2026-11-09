# Storyboard-driven asset and camera direction

The storyboard compiler validates semantic asset identifiers and types. Unknown assets fail compilation instead of silently rendering incorrect visuals.

Each compiled shot carries resolved assets and a camera/energy/transition directive. The three existing visual templates remain responsible for their layouts; the new director applies camera presets and shot fade/cut behavior.

Try changing `direction.camera` in `src/storyboard/example.ts` between `push`, `track`, `orbit`, and `static`, then preview the shot with `npm run studio`.

Current limitations: the asset registry validates and describes known objects, but visual templates still explicitly mount their corresponding 3D assets. It is not yet a generic scene-graph renderer. A `cut` means no shot-local fade, while `fade` is a fade to/from the shared background (not overlapping crossfade). Camera presets share simple position rigs, not target-aware cinematography.
