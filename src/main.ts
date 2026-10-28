import '@fontsource/libre-caslon-text/latin-400.css';
import '@fontsource/libre-caslon-text/latin-700.css';
import '@fontsource-variable/league-spartan';
import '@fontsource-variable/lilex';
import './styles/tokens.css';
import './styles/main.css';

import { Vector3 } from 'three';
import { gsap } from 'gsap';
import { D } from './core/ease';
import { Renderer } from './core/Renderer';
import { Theme } from './core/Theme';
import { Timeline } from './core/Timeline';
import { Input } from './core/Input';
import { Background } from './scene/Background';
import { handRimColor } from './scene/handMaterial';
import { Lights } from './scene/lights';
import { readPalette, tweenColor } from './scene/palette';
import { createHand, type Hand, type PoseName } from './scene/Hand';
import { Fragments } from './scene/Fragments';
import { Preloader } from './ui/Preloader';
import { Gate } from './ui/Gate';
import { Hud } from './ui/Hud';
import { Hero } from './ui/Hero';
import { Cursor } from './ui/Cursor';
import { Sections } from './ui/Sections';
import { ScreenCaption } from './ui/ScreenCaption';
import { Sound } from './audio/Sound';
import { Music } from './audio/Music';
import { content } from './content/content';

type Phase = 'loading' | 'enter' | 'gate' | 'grip' | 'build' | 'reveal' | 'sections';

const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
const reduced = () => reducedQuery.matches;

const CAMERA_BASE = new Vector3(0, 0.35, 8);
const GATE_POS = new Vector3(0.35, -0.05, 0);
const STAGE_POS = new Vector3(0, -0.3, 0);

/** Where the subject sits for the current viewport: right of the copy on desktop, above it on mobile. */
function layout(phase: 'gate' | 'stage') {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const stacked = w < 760 || w / h < 0.8;
  if (phase === 'gate') return { x: 0, y: stacked ? 0.06 : 0, scale: stacked ? 0.72 : 1 };
  return stacked ? { x: 0, y: 0.2, scale: 0.62 } : { x: 0.2, y: 0.02, scale: 0.95 };
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  const overlay = document.getElementById('overlay') as HTMLElement;
  const veil = document.getElementById('veil') as HTMLElement;

  const preloader = new Preloader(document.body);
  const tFonts = preloader.task('fonts');
  const tHand = preloader.task('hand', 2);
  const tPost = preloader.task('post');
  const tCompile = preloader.task('compile');

  const theme = new Theme();
  const renderer = new Renderer(canvas);
  const input = new Input();
  const cursor = new Cursor(document.body);
  const sound = new Sound();
  const music = new Music();
  const eq = [0, 0, 0, 0];
  let hudRef: Hud | null = null;
  let palette = readPalette();
  const applyBloom = () => {
    renderer.bloomScale = palette.light ? 0.35 : 1;
    renderer.setBloomThreshold(palette.light ? 0.97 : 0.8);
  };
  applyBloom();
  tweenColor(handRimColor.value, palette.glow, 0);
  const bg = new Background(palette);
  const lights = new Lights(renderer.gl, palette);
  renderer.scene.add(lights.group);
  renderer.scene.environment = lights.environment;
  renderer.scene.environmentIntensity = 0.3;
  renderer.scene.add(bg.mesh);
  renderer.onResize((w, h) => bg.resize(w, h));

  const fps = import.meta.env.DEV ? new (await import('./ui/FpsMeter')).FpsMeter(renderer) : null;

  // Render loop starts immediately so the background breathes behind the preloader.
  let phase: Phase = 'loading';
  let hand: Hand | null = null;
  let fragments: Fragments | null = null;
  let gate: Gate | null = null;
  let caption: ScreenCaption | null = null;
  const fx = { pulse: 0, shake: 0 };
  const anchor = new Vector3();
  const palm = new Vector3();
  let last = performance.now();
  let time = 0;

  renderer.gl.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;

    renderer.sample(dt);
    input.update(dt);
    preloader.update(dt);
    if (phase === 'gate') gate?.update(dt);
    if (hand) {
      if (phase !== 'gate') hand.setGlow(fx.pulse * 1.4);
      hand.update(dt, input.pointer);
      hand.object.updateMatrixWorld(true);
      // The screen hovers above the hand rather than along the palm normal, so it
      // stays framed whichever way a pose turns the palm. The palm adds a little sway.
      hand.object.getWorldPosition(anchor);
      hand.palmAnchor.getWorldPosition(palm);
      anchor.lerp(palm, 0.15);
      anchor.y += 1.45 * hand.object.scale.y;
    }
    if (fragments) {
      fragments.update(dt, anchor, renderer.camera);
      if (caption)
        caption.place(fragments.screenRect(renderer.camera, renderer.size.x, renderer.size.y));
    }

    bg.uniforms.uPulse.value = fx.pulse;
    bg.uniforms.uFocus.value.set(0.5 + renderer.framing.x, 0.52 + renderer.framing.y);
    bg.update(dt);
    renderer.setBloomStrength(0.55 + fx.pulse * 0.9);

    // Two detuned sines read as a hand-held jolt rather than a mechanical wobble.
    const s = fx.shake * 0.045;
    renderer.camera.position.set(
      CAMERA_BASE.x + Math.sin(time * 61) * s,
      CAMERA_BASE.y + Math.sin(time * 47 + 1.3) * s,
      CAMERA_BASE.z,
    );
    renderer.applyFraming();
    renderer.render();

    cursor.update(dt);
    fps?.update(dt);
    if (music.playing) hudRef?.setLevels(music.levels(eq));
  });

  // --- Loading ---------------------------------------------------------------
  void document.fonts.ready.then(() => tFonts(1));
  void renderer.enablePost().then(
    () => tPost(1),
    () => tPost(1),
  );
  hand = await createHand(tHand);
  hand.motion = !reduced();
  fragments = new Fragments(palette);
  renderer.scene.add(hand.object, fragments.group);

  const gl = layout('gate');
  renderer.framing.x = gl.x;
  renderer.framing.y = gl.y;
  hand.object.scale.setScalar(gl.scale);
  hand.object.position.set(6.5, -0.6, -0.5);
  hand.setPose('offer', 0);
  // Compile now so the first fragment frame doesn't hitch mid-animation.
  await renderer.gl.compileAsync(renderer.scene, renderer.camera).catch(() => {});
  tCompile(1);
  await preloader.done;

  // --- UI ----------------------------------------------------------------
  const theHand = hand;
  const theFragments = fragments;
  const hero = new Hero(overlay, content);
  const sections = new Sections(overlay, content, reduced);
  const hud = new Hud(overlay, content);
  hudRef = hud;
  caption = new ScreenCaption(overlay, content.whatIBuild.kinds);
  gate = new Gate(overlay, input, renderer, theHand, cursor);
  const theGate = gate;

  let skipping = false;
  const pose = (name: PoseName, d: number) => theHand.setPose(name, skipping ? 0 : d);

  // --- Master timeline -----------------------------------------------------
  const timeline = new Timeline();

  timeline.segment('enter', (tl) => {
    tl.to(
      theHand.object.position,
      { x: GATE_POS.x, y: GATE_POS.y, z: GATE_POS.z, duration: D.l },
      0,
    )
      .fromTo(theHand.object.rotation, { y: -0.7, z: 0.25 }, { y: 0, z: 0, duration: D.l }, 0)
      .call(() => sound.play('whoosh', 0.6), [], 0);
    theGate.enterTween(tl, D.s);
  });

  timeline.segment('grip', (tl) => {
    tl.call(() => {
      if (skipping) return;
      sound.play('grip');
      music.duck();
      navigator.vibrate?.(24);
    })
      .fromTo(fx, { shake: 1 }, { shake: 0, duration: D.m, immediateRender: false }, 0)
      .fromTo(fx, { pulse: 1 }, { pulse: 0, duration: D.l, immediateRender: false }, 0)
      .to(theHand.object.position, { z: 0.3, duration: D.xs }, 0)
      .to(theHand.object.position, { z: 0, duration: D.m }, D.xs);
    theGate.exitTween(tl, D.xs);
    tl.call(() => theGate.remove(), [], D.m);
  });

  timeline.segment('build', (tl) => {
    const st = () => layout('stage');
    tl.call(() => {
      pose('palmUp', D.l);
      if (!skipping) {
        sound.play('build', 0.5);
        music.duck(0.35, 1);
      }
    })
      .to(renderer.framing, { x: () => st().x, y: () => st().y, duration: D.l }, 0)
      .to(
        theHand.object.position,
        { x: STAGE_POS.x, y: STAGE_POS.y, z: STAGE_POS.z, duration: D.l },
        0,
      )
      .to(
        theHand.object.scale,
        { x: () => st().scale, y: () => st().scale, z: () => st().scale, duration: D.l },
        0,
      )
      .to(
        theFragments.group.scale,
        { x: () => st().scale, y: () => st().scale, z: () => st().scale, duration: D.l },
        0,
      )
      // Shader applies the curve per tile; the driver itself stays linear.
      .fromTo(
        theFragments.u.uIn,
        { value: 0 },
        { value: 1, duration: D.l, ease: 'none', immediateRender: false },
        D.xs,
      )
      .fromTo(
        theFragments.u.uProgress,
        { value: 0 },
        { value: 1, duration: D.l, ease: 'none', immediateRender: false },
        D.m,
      )
      .call(() => pose('hold', D.m), [], D.l + D.xs)
      .fromTo(
        theFragments.u.uFuse,
        { value: 0 },
        { value: 1, duration: D.s, immediateRender: false },
        D.l + D.m,
      )
      .fromTo(
        theFragments.u.uPulse,
        { value: 1 },
        { value: 0, duration: D.m, immediateRender: false },
        D.l + D.m,
      )
      .fromTo(fx, { pulse: 0.35 }, { pulse: 0, duration: D.m, immediateRender: false }, D.l + D.m);
  });

  timeline.segment('reveal', (tl) => {
    hero.enterTween(tl, 0, reduced());
    hud.enterTween(tl, D.s, reduced());
    tl.call(() => sections.goTo(0), [], D.xs);
  });

  // --- Sections -----------------------------------------------------------
  let cycle: gsap.core.Tween | null = null;
  let kind = 0;
  const showKind = (k: number, instant = false) => {
    kind = k;
    theFragments.setMode(k, instant || reduced());
    caption?.set(k, instant);
  };
  const startCycle = () => {
    cycle?.kill();
    // Dwell time, not a transition, so it sits outside the duration scale.
    cycle = gsap.delayedCall(3.6, () => {
      showKind((kind + 1) % content.whatIBuild.kinds.length);
      startCycle();
    });
  };

  sections.onChange((i, prev) => {
    hud.setSection(i);
    const meta = content.sections[i];
    if (!meta) return;
    if (prev >= 0) sound.play('tick', 0.5);

    if (reduced() && prev >= 0) {
      // Reduced motion: no 3D travel; dip the stage and swap the pose underneath.
      gsap
        .timeline()
        .to(canvas, { opacity: 0.25, duration: D.xs })
        .call(() => theHand.setPose(meta.pose, 0))
        .to(canvas, { opacity: 1, duration: D.s });
    } else {
      pose(meta.pose, D.l);
    }

    const u = theFragments.u;
    if (i === 0) {
      showKind(0, prev < 0);
      if (reduced()) {
        gsap.set([u.uIn, u.uProgress, u.uFuse], { value: 1 });
        gsap.to(u.uVisible, { value: 1, duration: D.s });
      } else {
        gsap.to(u.uProgress, { value: 1, duration: D.l, ease: 'none' });
        gsap.to(u.uFuse, { value: 1, duration: D.s, delay: D.m });
      }
      caption?.show(true);
      startCycle();
    } else {
      cycle?.kill();
      caption?.show(false);
      if (reduced()) gsap.to(u.uVisible, { value: 0, duration: D.s });
      else {
        gsap.to(u.uFuse, { value: 0, duration: D.xs });
        gsap.to(u.uProgress, { value: 0, duration: D.l, ease: 'none' });
      }
    }
  });
  hud.onSelect((i) => sections.goTo(i));
  hud.setTheme(theme.current);
  hud.onTheme(() => theme.toggle());
  theme.onChange((t) => {
    hud.setTheme(t);
    palette = readPalette();
    const d = reduced() ? 0 : D.s;
    bg.setPalette(palette, d);
    theFragments.setPalette(palette, d);
    lights.setPalette(palette, d);
    tweenColor(handRimColor.value, palette.glow, d);
    applyBloom();
  });
  hud.onSound((on) => {
    // Music starts inside the click so the browser allows the AudioContext.
    if (on) music.start();
    else {
      music.stop();
      hud.setLevels([0, 0, 0, 0]);
    }
    void sound.setEnabled(on).then(() => on && sound.play('tick'));
  });

  window.addEventListener('resize', () => {
    if (phase !== 'sections') return;
    const st = layout('stage');
    gsap.to(renderer.framing, { x: st.x, y: st.y, duration: D.s });
    gsap.to([theHand.object.scale, theFragments.group.scale], {
      x: st.scale,
      y: st.scale,
      z: st.scale,
      duration: D.s,
    });
  });

  const finish = async () => {
    phase = 'reveal';
    await timeline.play('reveal');
    phase = 'sections';
    sections.enable();
  };

  // --- Flow ------------------------------------------------------------------
  const skipIntro = async (instant = false) => {
    if (phase !== 'enter' && phase !== 'gate') return;
    phase = 'build';
    theGate.setActive(false);
    if (!instant) await gsap.to(veil, { opacity: 1, duration: D.s });
    skipping = true;
    timeline.skipTo('reveal');
    theGate.remove();
    skipping = false;
    gsap.to(veil, { opacity: 0, duration: D.m, delay: instant ? 0 : D.xs });
    await finish();
  };
  theGate.onSkip(() => void skipIntro());

  theGate.onComplete(async () => {
    theGate.setActive(false);
    phase = 'grip';
    await timeline.play('grip');
    phase = 'build';
    await timeline.play('build');
    await finish();
  });

  await preloader.exit();

  if (reduced()) {
    phase = 'enter';
    await skipIntro(true);
    return;
  }
  phase = 'enter';
  await timeline.play('enter');
  if (phase === 'enter') {
    phase = 'gate';
    theGate.setActive(true);
  }
}

void boot();
