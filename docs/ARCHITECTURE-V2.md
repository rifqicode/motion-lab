# MotionLab architecture v2 (incremental)

Codex + skill -> storyboard compiler -> validated graph -> renderer (SVG / Three) -> Remotion.

- `src/core/timeline/evaluate.ts` evaluates deterministic motion without React.
- `src/assets/registry.ts` resolves semantic asset IDs and rejects unknown IDs.
- `src/renderers/svg/IllustratedScene.tsx` supports independently animated SVG illustration objects.
- `src/styles/theme.ts` defines visual presets without hardcoding a single aesthetic.
- `src/graph/SceneGraph.tsx` remains the 3D adapter; legacy scenes are preserved.

Current limits: SVG illustrations are built-in components, not a general SVG file loader; hierarchy, masks, keyframe tracks and AI asset generation are future extensions. The registry must be extended when new asset IDs are introduced. Motion evaluation is frame-deterministic, but the current presets are basic. Preview and visual QA are required before declaring production readiness.
