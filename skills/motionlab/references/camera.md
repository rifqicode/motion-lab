# 2D camera direction

`illustration.camera` is an ordered array of `{time,x,y,zoom}` keys. x/y identify the world point framed at the stage center `(540,1020)`; zoom is magnification. Interpolation uses bounded cubic easing and holds after the last key. Use at least two keys, including an explicit hold when appropriate.

Keep headlines/captions outside the world transform so camera movement cannot reduce their readability. Art uses a logical 1080 × 1920 coordinate system and a `(540,1020)` pivot; `layoutFor()` fits it into separate portrait/square/landscape illustration regions. Inspect every requested format.

`depth:1` follows the camera normally, `depth:0` counteracts pan, and intermediate values produce parallax. Apply depth to top-level groups for predictable results. Nested depths accumulate and are rarely useful. Parallax is pan-relative; zoom affects the entire world uniformly. This is an authored 2D rig, not a 3D focus/DOF simulation.

Motivate the move: push toward a mechanism, pan from cause to effect, or pull out for a payoff. Settle the camera during reading holds. Coffee uses a small push that ends before the final hold. Do not use a perpetual orbit or drift as a substitute for story direction.
