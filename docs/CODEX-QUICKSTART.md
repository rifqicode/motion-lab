# Run MotionLab as a Codex skill

## Recommended local test
1. Checkout `feat/hybrid-motion-engine` and install dependencies with `npm install`.
2. Make the skill discoverable to Codex. In a Codex environment that supports project skills, put the skill folder under the agent's configured skill discovery location. A common repository convention is `.agents/skills/motionlab`; you can copy or symlink `skills/motionlab` there. Confirm your installed Codex version recognizes it.
3. Start Codex from the MotionLab repository and ask it to use the MotionLab skill on `benchmarks/coffee-explainer.md`.
4. Have Codex start `npm run studio` and visually inspect the scene previews and full composition.
5. Require `npm run typecheck` and a report of actual QA evidence. Only request `npm run render` after approving the preview.

The repository's current `skills/motionlab` folder is the source of truth. This project does not include a hosted Codex session or a connected visual browser; an actual agent-driven benchmark must run in your Codex environment.

## Copy-paste prompt
```text
Use the MotionLab skill. Read benchmarks/coffee-explainer.md and produce the benchmark video in this repository. Follow the skill references. Work preview-first, create real coffee visuals, inspect frames, fix visual problems, and run typecheck. Don't render an MP4 until I ask. Summarize the QA evidence and limitations.
```
