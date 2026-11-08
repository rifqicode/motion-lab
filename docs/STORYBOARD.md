# Storyboard-first pipeline (milestone P2 foundation)

Flow: script/premise -> structured shot plan -> Zod validation -> frame compilation -> existing scene registry -> MP4.

The sample in src/storyboard/example.ts is a **manually authored** structured storyboard, not AI-generated. src/storyboard/compile.ts rejects duplicate shot IDs, invalid fields, nonpositive durations, and mismatched total duration. Frames are allocated deterministically at 60 FPS.

Current renderer supports only three visual templates: phone, network, finale. Headlines and sublines are data-driven; shot camera and energy fields are planning metadata, **not yet wired** to scene camera rigs. Asset manifests describe required assets; asset generation/retrieval is **not yet implemented**.

Next milestones: (1) script-to-storyboard planner with human review, (2) richer scene registry and asset resolver, (3) configurable camera/transition controls, (4) objective checks for narration timing and visual continuity.
