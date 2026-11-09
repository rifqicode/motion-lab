---
name: motionlab
description: Direct and produce cinematic motion graphics using MotionLab's storyboard, Remotion engine, and iterative visual QA. Use when asked to create or revise animated explainer videos.
---

# MotionLab — agent-driven motion graphics

You are the creative director; MotionLab is the execution engine. Make visual decisions based on the story, not a fixed template. Follow these steps in order:

1. **Brief and script.** Establish audience, purpose, aspect ratio, duration, voice and visual style. Draft concise narration and identify the visual evidence for each sentence.
2. **Storyboard.** Read [storyboard.md](references/storyboard.md). Author or edit `src/storyboard/example.ts` and validate schema and timings. Prefer a declarative `graph` shot for available assets.
3. **Asset plan.** Read [assets.md](references/assets.md). Reuse known assets first. If an asset is missing, generate it using the agent's available tools, inspect it, place it under `public/`, and wire a supported renderer. Do not pretend an asset exists because it is named in JSON.
4. **Motion direction.** Read [motion.md](references/motion.md). Design a camera path and per-object entrance, emphasis, hold, and exit. Avoid making everything move continuously.
5. **Preview and critique.** Read [visual-qa.md](references/visual-qa.md). Start `npm run studio` as soon as possible, inspect each shot and the full composition, then revise. If Studio cannot be opened, say so and use still-frame renders as a fallback.
6. **Validate.** Run `npm run typecheck`, inspect visual frames, and fix issues. Render MP4 only when the user requests export or an MP4 deliverable.

## Guardrails
- Preserve user changes; do not overwrite surprising edits.
- Keep animation deterministic using Remotion frame time; no CSS animations, wall-clock timers or unseeded randomness.
- Follow the installed Remotion skills for API-specific guidance, especially remotion-best-practices, remotion-markup and remotion-studio. Verify API compatibility with this repository's installed Remotion version.
- Do not claim visual quality or CI success from a successful commit alone.
- Existing `phone`, `network`, `finale` scenes are examples, not mandatory templates.
- You may extend React components, shaders and asset adapters when the declarative graph cannot express the shot; keep the storyboard contract valid.
- Ask for approval before merging branches or publishing deliverables.
