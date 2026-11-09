# Motion choreography

For every shot, plan: entrance -> focus action -> readable hold -> exit. Reserve stillness for comprehension. Use staggered reveals when explaining causal relationships.

Use frame-based Remotion animation (`useCurrentFrame`, `useVideoConfig`, `interpolate`, `spring`). Keep frame hooks local to animated components. Motion should be reproducible at arbitrary frames, including still exports and parallel rendering.

Existing `shotCamera` presets are simple camera-position controls, not target-aware rigs. Existing `travel` is a simple linear packet motion, not a path-following system. Extend these when the narrative needs spline travel, focus targets, depth of field or purposeful transitions. Avoid applying every preset just because it is available.
