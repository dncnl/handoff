# hand.glb

The hand is the WebXR Input Profiles **generic-hand** (`right.glb`) from
[`@webxr-input-profiles/assets@1.0.19`](https://github.com/immersive-web/webxr-input-profiles),
MIT licensed. See `LICENSE-generic-hand.md`. If this file is missing or fails to load,
the procedural hand in `src/scene/handGeometry.ts` is used instead.

## Replacing it

Any rigged **right** hand works with no code changes if it has:

- **One skinned mesh.** Its material is replaced at runtime by the shared skin material.
- **WebXR hand joint names:** `wrist`, `thumb-metacarpal`, `thumb-phalanx-proximal`,
  `thumb-phalanx-distal`, `thumb-tip`, and for each of `index`, `middle`, `ring`, `pinky`:
  `<finger>-finger-phalanx-proximal`, `-phalanx-intermediate`, `-phalanx-distal`, `-tip`.
- **A relaxed open rest pose** with the fingers roughly straight.

There are no animation clips. `src/scene/RiggedHand.ts` measures the rig on load,
turns it into wrist space (fingers +Y, palm +Z, thumb +X, wrist to middle fingertip
= 2 units), and drives the joints from the pose table in `src/scene/Hand.ts`.
Orientation, scale and units of the source file don't matter.
