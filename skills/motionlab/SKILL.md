---
name: motionlab
description: Direct and produce illustrated or hybrid cinematic explainer videos with MotionLab's validated storyboard, layered SVG engine, Remotion preview, and visual QA.
---

# MotionLab — illustration-first motion graphics

This skill and its local references are the complete agent authoring guide. Before producing or revising a video, read all references below. Inspect the relevant source modules before changing their contracts. For a narrowly scoped maintenance task, consult the references that govern the affected behavior.

| Reference                                                 | Purpose                                                   |
| --------------------------------------------------------- | --------------------------------------------------------- |
| [Architecture](references/architecture.md)                | Source entry points, renderer ownership and compatibility |
| [Storyboard](references/storyboard.md)                    | Validated shot data and compilation                       |
| [Engine workflow](references/engine-workflow.md)          | Cue timing, formats, visual controls and preview commands |
| [Style Bible](references/style-bible.md)                  | Palettes, shapes, strokes, materials and proportions      |
| [Art direction](references/illustration-art-direction.md) | Visual evidence and storytelling decisions                |
| [Asset representation](references/assets.md)              | Choose vector, raster or genuine 3D                       |
| [SVG assets](references/svg-assets.md)                    | Generate, layer, validate and register illustrations      |
| [Layered animation](references/layered-animation.md)      | Hierarchies, transforms, clips and masks                  |
| [Motion](references/motion.md)                            | Entrance, action, hold, exit and deterministic tracks     |
| [Camera](references/camera.md)                            | Framing, pan, zoom and parallax                           |
| [Consistency](references/asset-consistency.md)            | Review the illustration family together                   |
| [Visual QA](references/visual-qa.md)                      | Inspect real frames and report verification limits        |

## Production workflow

1. Establish audience, story, duration and visual evidence. Default to `MOBILE_VIDEO`: portrait 1080×1920, 9:16, 60 FPS. The coffee film is an example, not a required template.
2. Preserve user edits and the active feature branch. Author the storyboard, resolve asset needs, and generate missing layered vectors under the Style Bible.
3. Choreograph independent objects and cause/effect with cues. Keep every animation deterministic from Remotion frame time.
4. Preview early. Start Studio when appropriate; respect a request to leave it stopped and use PNG reports instead. Inspect standalone shots, action frames and full-film boundaries; fix visible issues.
5. Run `npm run check`. Store generated frame evidence, reports and per-run QA notes under `out/`. Report actual inspections, corrections and anything unverified.
6. Export MP4 only when explicitly requested. Ask before merging or publishing.

Preserve the 3D graph and legacy scene contracts. Do not flatten independently animated parts into one PNG. Avoid CSS animation, wall-clock timing and unseeded randomness.

For Remotion API work, read available remotion-best-practices, remotion-markup and remotion-studio guidance, or consult the official sources in the visual QA reference. Match APIs to installed Remotion 4.0.400; newer Interactive APIs are not assumed available.
