# MotionLab authoring guide — Remotion practices

Reference: https://github.com/remotion-dev/skills/tree/main/skills

## Fast feedback loop
1. `npm install` then `npm run studio`.
2. Open `MotionLab` for the complete film, or `Shot-intro`, `Shot-network`, `Shot-finale` to inspect a single scene. Shot previews use the same React components and storyboard text as the full composition.
3. Scrub entry, midpoint and exit; check clipping, text contrast, layering and transitions.
4. Run `npm run typecheck` before pushing. Use the GitHub Actions MP4 workflow for export/verification, not as the only visual feedback loop.

## Engine conventions
- All motion must be deterministic from `useCurrentFrame()` and `useVideoConfig().fps`. Never use CSS transitions, wall-clock timers or random unseeded motion.
- Keep frame subscriptions in the smallest practical component; avoid re-rendering unrelated descendants.
- Scene components must work at local frame zero and must not depend on their position in the full film.
- Express timing in seconds in storyboard JSON; compile to frames once and validate shot duration and identifiers.
- Keep shot narrative and semantic asset requirements separate from scene implementations.
- Add media to `public/` and reference with `staticFile()`. Avoid fragile remote assets in final renders.
- For new Remotion packages use `npx remotion add` and align package versions.
- Prefer reusable scene primitives, camera rigs and asset components over one-off timeline logic.
- Inspect multiple frames and both standalone and full compositions when changing shot timing.

## Gaps to address next
- The semantic asset catalog is descriptive, not a functioning storyboard-to-asset resolver.
- Shot direction metadata (camera/energy/transition) is not yet executed by the renderer.
- Visual QA is manual; add frame snapshots and layout checks.
- No narration/captions alignment yet.
- Some reference skill features target newer Remotion versions; verify compatibility before copying APIs.
- Standalone previews intentionally do not include the full-film ambient background, global overlay or cross-shot fades. Validate those in `MotionLab`.

## Source guidance
- remotion-best-practices/SKILL.md: preview-first and skill routing.
- remotion-markup/SKILL.md: frame-driven animation, local subscriptions, composition structure, assets and visual inspection.
- remotion-maps/SKILL.md: choose map technique per shot; geographic globe shots may use Three.js rather than introducing a map SDK.
