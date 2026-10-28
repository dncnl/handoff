# hand.glb

Drop a `hand.glb` here and it replaces the procedural placeholder automatically.
No code changes are needed as long as the file meets this contract.

## Required

- **One skinned or rigid mesh** of a right hand. Any material is fine: it is replaced
  at runtime with the shared matcap + fresnel-rim material.
- **Animation clips named exactly** (one per pose, case-sensitive):
  `idle`, `offer`, `grip`, `palmUp`, `hold`, `tap`, `pinch`, `point`, `thumbsUp`.
  Each clip can be a single-frame pose or a short loop; poses are blended with
  `AnimationMixer` crossfades.
- `offer` and `grip` must be authored from the same rest so they blend cleanly:
  `setGrip(t)` runs both at once with weights `1 - t` and `t`.

## Recommended

- An empty node named **`palmAnchor`** about one palm-length above the palm,
  along the palm normal. The floating screen follows it. Without it, a default
  offset from the model root is used.
- Rest pose: wrist at the origin, fingers along +Y, palm facing +Z, about
  2 units from wrist to middle fingertip (matches the placeholder's scale).
- Draco compression is supported (decoder is served from `/draco/`).
- Keep it under ~1.5 MB; the preloader tracks its real download progress.
