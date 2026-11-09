# Motion choreography

Plan entrance → focus action → readable hold → exit for every object that changes. Delay consequences until their causes are visible. Keep timing in shot data and use frame time from `useCurrentFrame()` / `useVideoConfig()`.

The illustrated engine evaluates stateless tracks in seconds. Arbitrary frame seeking and parallel still rendering do not require prior frames. Tracks clamp outside their keys. One property has one track; add multiple ordered keys for entrance, action, hold and exit rather than stacking conflicting tracks.

Factories in `src/illustration/motion.ts` emit ordinary serializable tracks:

- `reveal`, `slide`, `scale`, `rotate`, `draw`
- `squash` and `anticipate` (anticipation plus overshoot)
- `stagger(count,spacing,factory,start)` to build delayed instances
- `tween(property,start,duration,from,to,easing)` for explicit control

Scale uses a bounded-duration Remotion spring. Linear is appropriate for flow and path drawing; smooth cubic is useful for camera moves. Spring is optional. Opacity/draw are clamped to 0–1; transforms may overshoot. A spring segment snaps to its exact endpoint at the final key; tune damping/duration if that stop becomes visible.

`follow: {points:[p0,p1,p2,p3],start,duration,orient}` adds cubic Bézier displacement; orient uses the curve tangent. This supports one curve per node, not arbitrary SVG path parsing or a full arc-length spline rig. `draw` animates normalized stroke dash offset on paths/lines; filled shapes do not automatically morph.

For liquid and steam, animate independently under stationary clips/masks. No CSS animations, wall-clock timers or unseeded randomness. The existing 3D graph presets remain separate and retain their original behavior.

Illustrated `fade` transitions dip to the shared paper background over 0.22 seconds at each shot edge, retaining the exact shot durations. They are not overlapping cross-dissolves. Use cuts for continuous action or extend the transition system deliberately before claiming a match dissolve.
