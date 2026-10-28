# Handoff — Milestone 1 plan

Build order (typecheck + build after each step):

1. **Scaffold** — package.json, Vite + strict TS, ESLint (flat config) + Prettier, folder structure, tokens.css with the one easing curve.
2. **Core** — `Renderer` (DPR ≤ 2, resize, quality tier with FPS watchdog), `Background` gradient+grain shader, lazy-loaded `EffectComposer` + `UnrealBloomPass` (high tier only), dev FPS meter on `F`.
3. **Motion primitives** — `ease.ts` (cubic-bezier(.22,1,.36,1) as a GSAP ease), `Timeline` (master timeline + named segments + `skipTo`), `Input` (pointer/touch/keyboard + hold progress).
4. **Hand** — procedural placeholder (palm + 5 jointed fingers) with matcap + fresnel rim, pose presets, `setPose`/`setGrip`/`update`; GLB path behind the same interface.
5. **Preloader** — odometer 000→100 driven by a progress source (simulated when no assets).
6. **Gate** — hand enters in `offer`, hold on palm (raycast) / hint button / Space / Enter, cursor ring, spring release, completion shake + light pulse, skip link.
7. **Build** — palmUp, ~120 instanced fragments assemble into a rounded-rect screen, emissive pulse.
8. **Reveal + HUD** — mono letter-resolve for name/tagline, HUD slide-in (counter, 5-segment bar, `01 / 05`, sound toggle), custom cursor.
9. **Sections** — 5 HTML panels; scroll/drag/keys move between them; hand changes pose per section; section 01 cycles work kinds on the screen.
10. **Mobile + reduced motion** — stacked layout, touch hold, no horizontal scroll; reduced motion skips gate and uses fades.
