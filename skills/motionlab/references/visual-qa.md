# Preview and visual QA

Start `npm run studio`. Check each `Shot-<id>` composition at entry, midpoint, action peak and exit; also check `MotionLab` at every scene boundary.

Inspect: text overflow and safe areas, contrast, asset silhouette, camera framing, object intersections, unintended occlusion, lighting consistency, motion pacing, correct story-to-visual mapping, and transitions. Record issues and iterate until the shot communicates without narration.

Run `npm run typecheck`. A passing typecheck is not a visual pass. If preview is unavailable, render selected still frames using Remotion CLI and inspect images. Do not claim QA was completed unless frames were actually inspected. Only export MP4 when explicitly requested.
