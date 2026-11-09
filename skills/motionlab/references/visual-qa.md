# Preview and visual QA

Start `npm run studio`. Open the exact printed URL when browser tools are available. Review every `Shot-<id>` at entry, early action, action peak, hold and exit, plus `MotionLab` across every scene boundary. If interactive browser inspection is unavailable, explicitly say so and render PNG stills as a fallback.

Inspect illustration proportions, identifying detail, consistent strokes/colors/light, text safe areas and wraps, camera bounds, intersections, clipping/masks, layer ordering, fluid containment, pivot placement, causal timing, and transitions. Check both sides of a boundary and the entrance/exit fade. A successful render alone is not a visual pass.

Prefer `npm run preview:report -- --variants` for automatic cue-aware sampling and contact sheets, and `npm run preview:assets` before placing new assets. See [engine workflow](engine-workflow.md).

For the historical coffee sample, `node scripts/coffee-stills.mjs` renders PNGs only. It uses system Chrome by default; set `MOTIONLAB_BROWSER` to another executable. `python3 scripts/coffee-contact-sheet.py` creates a review sheet (requires Pillow). Keep full-resolution samples for labels and thin lines. Inspect liquid at empty, partially filled and full states, and steam after the pour ends.

Run `npm run typecheck` and `npm run test:engine`. The still bundle is also a production webpack compilation check. Unit checks cannot certify visual quality. Record inspected frame numbers, corrections and unverified playback/audio in `qa.md` inside the corresponding `out/preview/<run>/` directory. Keep generated images, reports and review history under `out/`. Do not export MP4 unless explicitly requested.

Official Remotion guidance reviewed for this engine: [best-practices](https://github.com/remotion-dev/skills/blob/main/skills/remotion-best-practices/SKILL.md), [markup](https://github.com/remotion-dev/skills/blob/main/skills/remotion-markup/SKILL.md), [Studio](https://github.com/remotion-dev/skills/blob/main/skills/remotion-studio/SKILL.md), [spring](https://www.remotion.dev/docs/spring). Guidance may target newer versions; installed APIs are authoritative. This engine deliberately keeps custom SVG transforms and storyboard tracks rather than adopting newer Interactive APIs.
