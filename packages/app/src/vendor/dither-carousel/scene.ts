// Ported from dither-blur-carousel (MIT, (c) 2026 Yousuf Soomro) — see ./LICENSE.
//
// Changes from upstream gl/scene.js (the rest is the author's, comments included):
//   - textures arrive ready-made from the caller instead of being loaded here
//     from the IMAGES array. Our cards are composited on a 2D canvas (anchor
//     render + kind badge) before they get here, so there is nothing to wait on
//     and the ENTRY_WAIT_LIMIT / texture-settled machinery is gone with it.
//   - lil-gui is not ported (dependency discipline, docs/02 P6). config.ts is
//     edit-and-reload; `replayEntry()` on the handle replaces the panel button.
//   - randomness comes in as `random` so the whole app keeps one seeded Rng
//     (AGENTS.md: no bare Math.random()).
//   - `exit()` added: the chosen card rushes the camera and the whole set
//     dissolves back into the dither — docs/12 §5.1's "卡片冲向镜头 → 溶解".
//   - the frame loop can never throw out of requestAnimationFrame (docs/02 P2):
//     it stops itself and reports through `onError` instead.
//   - window.__carousel debug hook removed; the handle exposes the same objects.
//   - `preserveDrawingBuffer` is an option, so a debug page can read the canvas
//     back for evidence screenshots. Off by default, as upstream had it.
import * as THREE from 'three';
import { config, type CarouselConfig } from './config.ts';
import { cardVertex, cardFragment } from './shaders/card.ts';
import { createScrollController } from './scroll.ts';
import { createPostPipeline } from './post.ts';
import { createCardBuffer } from './cardbuffer.ts';
import { createTrail } from './trail.ts';
import { hexToSRGB } from './color.ts';

export type Card = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

export interface CarouselOptions {
  /** One texture per card, already fitted to the card's aspect by the caller. */
  textures: THREE.Texture[];
  /** 0..1 source. Defaults to Math.random only so the vendor file stays standalone. */
  random?: () => number;
  onActiveChange?: (index: number) => void;
  /** A click on the card that is already centred — "this one". */
  onPick?: (index: number) => void;
  /** The exit animation finished; the caller may tear the page down. */
  onExitDone?: (index: number) => void;
  /** The frame loop died. It has already stopped; fall back to something else. */
  onError?: (error: unknown) => void;
  /**
   * Keep the drawing buffer readable so `canvas.toDataURL()` returns the frame
   * instead of black. Debug/evidence only — it costs an extra copy per frame on
   * some drivers, so the installation runs without it.
   */
  preserveDrawingBuffer?: boolean;
}

export interface CarouselHandle {
  focus(index: number): void;
  /** Move by whole slots, for arrow keys. */
  step(delta: number): void;
  activeIndex(): number;
  /** Chosen: dolly into `index` while the set dissolves. Idempotent. */
  exit(index: number): void;
  replayEntry(): void;
  dispose(): void;
  readonly internals: {
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    cards: Card[];
    config: CarouselConfig;
  };
}

/** How long the chosen card takes to reach the camera and go. */
const EXIT_DURATION = 1100;

// [vertical, horizontal] weights per mode. "both" runs each below full so
// combining them doesn't double the deflection.
const BEND_WEIGHTS: Record<string, [number, number]> = {
  vertical: [1, 0],
  horizontal: [0, 1],
  both: [0.7, 0.7],
};

// Asymmetric ease — separate rates for rising and falling, so hover can arrive
// at a different speed than it leaves.
function approach(current: number, target: number, cfg: CarouselConfig): number {
  const rate = target > current ? cfg.hoverInEase : cfg.hoverOutEase;
  return current + (target - current) * rate;
}

// 1 makes the entry front a circle on the card, 0 an ellipse in its own shape.
// Folded into the aspect the shader already takes rather than sent as a second
// uniform — the reveal only ever uses the two together.
function entryAspect(): number {
  const aspect = config.cardWidth / config.cardHeight;
  return 1 + (aspect - 1) * config.entryRound;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x <= edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function createCarousel(
  canvas: HTMLCanvasElement,
  {
    textures, random = Math.random,
    onActiveChange, onPick, onExitDone, onError,
    preserveDrawingBuffer = false,
  }: CarouselOptions,
): CarouselHandle {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(config.fov, 1, 0.1, 100);
  camera.position.z = config.cameraZ;

  // The scene pass works in linear light, the composite writes straight to the
  // framebuffer in display space. Same colour, kept in both forms.
  const backgroundLinear = new THREE.Color(config.background);
  const backgroundSRGB = hexToSRGB(config.background);
  scene.background = backgroundLinear;

  const post = createPostPipeline(renderer, config, backgroundSRGB);
  const scroll = createScrollController(canvas, config);
  const trail = createTrail(renderer, canvas, config);

  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

  const geometry = buildGeometry();
  const cards: Card[] = [];

  function buildGeometry(): THREE.PlaneGeometry {
    // Width segments let the vertex shader wrap the card around the cylinder.
    // Height segments are there purely for the horizontal bend — its falloff
    // runs down the card, so with one segment uv.y is only ever 0 or 1 and the
    // card shifts bodily instead of bowing.
    return new THREE.PlaneGeometry(config.cardWidth, config.cardHeight, 48, 24);
  }

  function coverRatio(texture: THREE.Texture): THREE.Vector2 {
    const cardAspect = config.cardWidth / config.cardHeight;
    const image = texture.image as { width: number; height: number };
    const imageAspect = image.width / image.height;
    return new THREE.Vector2(
      Math.min(1, cardAspect / imageAspect),
      Math.min(1, imageAspect / cardAspect),
    );
  }

  textures.forEach((texture, index) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = maxAnisotropy;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.needsUpdate = true;

    const material = new THREE.ShaderMaterial({
      vertexShader: cardVertex,
      fragmentShader: cardFragment,
      uniforms: {
        uMap: { value: texture },
        uImageRatio: { value: coverRatio(texture) },
        uBackground: { value: backgroundLinear },
        uBackfaceFade: { value: config.backfaceFade },
        uFogNear: { value: config.fogNear },
        uFogFar: { value: config.fogFar },
        uFogStrength: { value: config.fogStrength },
        uProgress: { value: 0 },
        uIndex: { value: index },
        uCount: { value: textures.length },
        uRadius: { value: config.radius },
        uPitch: { value: config.pitch },
        uAngleStep: { value: config.angleStep },
        uCurve: { value: config.curve },
        uShingle: { value: config.shingle },
        uVelocity: { value: 0 },
        uBend: { value: config.bend },
        uBendVertical: { value: 1 },
        uBendHorizontal: { value: 0 },
        uHover: { value: 0 },
        uDim: { value: 0 },
        uDimFade: { value: config.dimFade },
        // Read by the visible pass and, through the shared uniform objects, by
        // the card buffer — so the reveal, the hit test and the composite's
        // entry channel all stop at the same edge.
        uEntry: { value: 1 },
        uEntryScale: { value: config.entryScale },
        uEntrySoftness: { value: config.entrySoftness },
        uEntryAspect: { value: entryAspect() },
      },
      // Culling backfaces would drop every card past 90°, which is most of the
      // ribbon at this angle step. The mirrored texture doesn't matter since
      // backfaceFade and haze reduce them to pale ghosts anyway.
      side: THREE.DoubleSide,
      // Alpha carries depth here, not coverage — blending would multiply it
      // into the colour and wash out the near cards.
      blending: THREE.NoBlending,
    });

    const mesh = new THREE.Mesh(geometry, material) as Card;
    // Kept unshaped; the curve is applied on the way to the shader.
    mesh.userData.hoverRaw = { hover: 0, dim: 0 };
    // 1 is absent, 0 is arrived. Only ever falls during the entry, so a card
    // can't un-arrive — the exit sets it directly instead.
    mesh.userData.entry = 1;
    mesh.userData.entryOrder = index;
    // Positions come entirely from the vertex shader, so the CPU-side bounding
    // sphere is meaningless.
    mesh.frustumCulled = false;
    scene.add(mesh);
    cards.push(mesh);
  });

  // Built after the cards so it can borrow their uniform objects.
  const cardBuffer = createCardBuffer(renderer, scene, cards, config);
  post.compositeMaterial.uniforms.uCardBuffer.value = cardBuffer.texture;

  // --- entry ----------------------------------------------------------------
  // Two halves of one arrival: a timed tween on the scroll for the spin, and a
  // per-card front in the frame loop for the reveal.
  let entryStart: number | null = null;

  // Fisher-Yates. Reshuffled on every run: a fixed order is legible after two
  // or three viewings and starts to read as a sequence being replayed rather
  // than as the set landing.
  function shuffleEntryOrder(): void {
    const order = cards.map((_, index) => index);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    cards.forEach((card, index) => (card.userData.entryOrder = order[index]));
  }

  // Parks the helix where the arrival begins.
  function parkForEntry(): void {
    scroll.state.current = -config.entrySpin;
    scroll.state.target = scroll.state.current;
    shuffleEntryOrder();
    for (const card of cards) {
      card.userData.entry = 1;
      // Written straight through as well as onto the card. The buffer is drawn
      // at the top of the frame and only picks up uniforms the loop below sets,
      // so going through the loop alone would draw one frame of whole cards.
      card.material.uniforms.uEntry.value = 1;
    }
  }

  function beginEntry(): void {
    if (!config.entry) return;
    parkForEntry();
    scroll.goTo(0, {
      duration: config.entrySpinDuration,
      easeIn: config.entryEaseIn,
      easeOut: config.entryEaseOut,
    });
    entryStart = performance.now();
  }

  // --- exit -----------------------------------------------------------------
  // The chosen card comes at the camera while every card dissolves back into
  // the dither it arrived out of. Runs on its own clock, like the entry spin.
  let exitIndex = -1;
  let exitStart = 0;
  let exitReported = false;

  function exit(index: number): void {
    if (exitIndex >= 0) return;
    exitIndex = index;
    exitStart = performance.now();
    focusCard(index);
  }

  const pointer = { x: 0, y: 0, inside: false };
  let hovered = -1;

  // Pointer travel, accumulated as events land and consumed once a frame.
  let travel = 0;
  let pointerSpeed = 0;
  let lastClient: { x: number; y: number } | null = null;

  // Clicking a card sends it to the centre, which slides it out from under a
  // stationary cursor. Picking re-runs every frame, so focus would jump to
  // whatever card passes beneath instead of staying on the one being brought
  // forward. Hold it until the pointer actually moves.
  let locked = -1;
  const lockOrigin = { x: 0, y: 0 };

  const releaseLock = () => {
    locked = -1;
  };

  const onPointerMove = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = (event.clientX - rect.left) / rect.width;
    // Flipped: readRenderTargetPixels measures from the bottom.
    pointer.y = 1 - (event.clientY - rect.top) / rect.height;
    pointer.inside = pointer.x >= 0 && pointer.x <= 1 && pointer.y >= 0 && pointer.y <= 1;

    if (lastClient) {
      travel += Math.hypot(event.clientX - lastClient.x, event.clientY - lastClient.y);
    } else {
      lastClient = { x: 0, y: 0 };
    }
    lastClient.x = event.clientX;
    lastClient.y = event.clientY;

    // Measured from where the click happened rather than the last frame, so
    // sub-pixel jitter can't release the lock on its own.
    if (locked >= 0) {
      const travelled = Math.hypot(event.clientX - lockOrigin.x, event.clientY - lockOrigin.y);
      if (travelled > config.clickSlop) releaseLock();
    }
  };
  const onPointerLeave = () => {
    pointer.inside = false;
  };

  // Bring a card to the focus band.
  function focusCard(index: number): void {
    const count = cards.length;
    // A card is centred when its slot equals half the count, and slot is
    // mod(index - progress, count), so progress has to be index minus half.
    const base = index - count / 2;
    // Which is true of infinitely many values a loop apart. Take the nearest to
    // where we already are, otherwise clicking a card just above the top of the
    // frame can unwind the whole helix to reach it the long way round.
    const nearest = base + Math.round((scroll.state.current - base) / count) * count;
    scroll.goTo(nearest);
  }

  const press = { x: 0, y: 0 };

  const onPointerDown = (event: PointerEvent) => {
    press.x = event.clientX;
    press.y = event.clientY;
    // A press is a decision, so stop holding hover back.
    pointerSpeed = 0;
    travel = 0;
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!config.clickToFocus || hovered < 0 || exitIndex >= 0) return;
    // A drag that happens to end over a card isn't a click on it.
    const travelled = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    if (travelled > config.clickSlop) return;

    // Two-stage on purpose: the first click brings a card to the middle, a
    // click on the one already there is the choice. At the installation a
    // single click that committed would turn every stray touch into a body.
    if (hovered === activeIndex) {
      onPick?.(hovered);
      return;
    }

    locked = hovered;
    lockOrigin.x = event.clientX;
    lockOrigin.y = event.clientY;
    focusCard(hovered);
  };

  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  // Scrolling is as much a decision to move on as moving the cursor.
  canvas.addEventListener('wheel', releaseLock, { passive: true });

  function resize(): void {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;

    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    post.setSize(width, height, renderer.getPixelRatio());
    cardBuffer.setSize(width, height);
    trail.setSize(width, height, renderer.getPixelRatio());
  }

  let frame = 0;
  let activeIndex = -1;

  function tick(): void {
    frame = requestAnimationFrame(tick);
    // docs/02 P2: nothing gets to throw out of the frame loop. If the context
    // is gone there is no recovering inside here, so stop and hand it back.
    try {
      step();
    } catch (error) {
      cancelAnimationFrame(frame);
      frame = 0;
      onError?.(error);
    }
  }

  function step(): void {
    config.autoSpin && (scroll.state.target += config.autoSpin);
    const progress = scroll.update();

    // Centred index is progress plus half a turn, rounded. Only reported on
    // change so we're not touching the DOM every frame.
    const total = cards.length;
    const centred = (((Math.round(progress + total / 2) % total) + total) % total);
    if (centred !== activeIndex) {
      activeIndex = centred;
      onActiveChange?.(activeIndex);
    }

    // Client pixels per frame, smoothed so one stray event can't flip the state.
    pointerSpeed += (travel - pointerSpeed) * 0.35;
    travel = 0;

    // Hover intent. A sweep drags the cursor over card after card and each one
    // starts resolving before being abandoned a frame later, which makes the
    // whole rack focus blink. So hover only changes hands once the pointer has
    // slowed to the speed of aiming.
    const settled = !config.hoverIntent || pointerSpeed <= config.hoverSettleSpeed;

    // Re-picked every frame rather than only on pointermove, because the helix
    // keeps turning under a stationary cursor and the card beneath it changes.
    cardBuffer.render(camera);
    const picked = locked < 0 && pointer.inside ? cardBuffer.pick(pointer.x, pointer.y) : -1;
    hovered = locked >= 0 ? locked : settled ? picked : hovered;
    canvas.style.cursor = hovered >= 0 ? 'pointer' : 'default';

    const anyHovered = hovered >= 0;
    const count = cards.length;

    // Entry clock, in ms since the arrival opened. Both ends are infinities so
    // the per-card arithmetic below needs no special case.
    const entryElapsed = !config.entry
      ? Infinity
      : entryStart === null
        ? -Infinity
        : performance.now() - entryStart;

    // Exit clock. 0 until something is chosen, then 0..1 over EXIT_DURATION.
    let exitT = 0;
    if (exitIndex >= 0) {
      exitT = Math.min(1, (performance.now() - exitStart) / EXIT_DURATION);
      // Dolly to just short of the helix surface — the chosen card is centred
      // and facing us, so this reads as it coming at the camera rather than as
      // the frame zooming.
      const eased = smoothstep(0, 1, exitT);
      camera.position.z = config.cameraZ - (config.cameraZ - config.radius - 0.5) * eased;
      camera.updateProjectionMatrix();
      if (exitT >= 1 && !exitReported) {
        exitReported = true;
        onExitDone?.(exitIndex);
      }
    }

    // Slot, not index, and deliberately not wrapped.
    const slotOf = (i: number): number => {
      const slot = (i - progress) % count;
      return slot < 0 ? slot + count : slot;
    };
    const hoveredSlot = anyHovered ? slotOf(hovered) : 0;

    for (const [index, card] of cards.entries()) {
      const u = card.material.uniforms;
      const isHovered = index === hovered;
      const raw = card.userData.hoverRaw as { hover: number; dim: number };

      // Dim falls off with distance along the helix rather than switching on
      // for every other card at once, so neighbours stay partly legible and
      // only distant cards dissolve.
      const slot = slotOf(index);
      const separation = anyHovered ? Math.abs(slot - hoveredSlot) : 0;
      const dimTarget = anyHovered ? smoothstep(0, config.focusFalloff, separation) : 0;

      raw.hover = approach(raw.hover, isHovered ? 1 : 0, config);
      raw.dim = approach(raw.dim, dimTarget, config);

      if (exitIndex >= 0) {
        // The reverse of the arrival, and on the same dithered front. The
        // chosen card holds while the rest go, then dissolves last and fastest
        // — it has the camera on it by then.
        const local = index === exitIndex
          ? Math.max(0, (exitT - 0.45) / 0.55)
          : Math.min(1, exitT / 0.6);
        card.userData.entry = smoothstep(0, 1, local);
      } else {
        // Entry. Each card waits out its place in the running order, then opens
        // over its own duration. Held to falling only, so a retune mid-arrival
        // can only ever bring cards in.
        const local = Math.min(
          1,
          Math.max(
            0,
            (entryElapsed - (card.userData.entryOrder as number) * config.entryStagger) /
              Math.max(1, config.entryDuration),
          ),
        );
        card.userData.entry = Math.min(
          card.userData.entry as number,
          1 - smoothstep(0, 1, Math.pow(local, config.entryCurve)),
        );
      }

      // Shaped on the way into the shader, so the eased state stays linear.
      u.uHover.value = Math.pow(raw.hover, config.hoverCurve);
      u.uDim.value = Math.pow(raw.dim, config.hoverCurve);
      u.uDimFade.value = config.dimFade;
      u.uEntry.value = card.userData.entry;
      u.uEntryScale.value = config.entryScale;
      u.uEntrySoftness.value = config.entrySoftness;
      u.uEntryAspect.value = entryAspect();
      u.uProgress.value = progress;
      u.uRadius.value = config.radius;
      u.uPitch.value = config.pitch;
      u.uAngleStep.value = config.angleStep;
      u.uCurve.value = config.curve;
      u.uShingle.value = config.shingle;
      u.uVelocity.value = scroll.state.bendVelocity;
      u.uBend.value = config.bend;
      u.uBendVertical.value = BEND_WEIGHTS[config.bendMode][0];
      u.uBendHorizontal.value = BEND_WEIGHTS[config.bendMode][1];
      u.uBackfaceFade.value = config.backfaceFade;
      u.uFogNear.value = config.fogNear;
      u.uFogFar.value = config.fogFar;
      u.uFogStrength.value = config.fogStrength;
    }

    const c = post.compositeMaterial.uniforms;
    c.uFocusSize.value = config.focusSize;
    c.uEdgePower.value = config.edgePower;
    c.uBlurStrength.value = config.blurStrength;
    c.uDitherScale.value = config.ditherScale;
    c.uMaxLevels.value = config.maxLevels;
    c.uMinLevels.value = config.minLevels;
    c.uFadeStrength.value = config.fadeStrength;
    c.uDitherAmount.value = config.dither ? config.ditherAmount : 0;
    c.uDitherStart.value = config.ditherStart;
    c.uDitherPower.value = config.ditherPower;
    c.uDitherDepth.value = config.ditherDepth;
    c.uGamma.value = config.ditherGamma;
    c.uMono.value = config.ditherMono;
    c.uDissolve.value = config.ditherDissolve;
    c.uHoverBlur.value = config.hoverBlur;
    c.uHoverBlurCurve.value = config.hoverBlurCurve;
    c.uHoverDither.value = config.hoverDither;
    c.uHoverDitherCurve.value = config.hoverDitherCurve;
    c.uHoverDitherLevels.value = config.hoverDitherLevels;
    c.uHoverDitherScale.value = config.hoverDitherScale;
    c.uHoverDitherCutoff.value = config.hoverDitherCutoff;
    c.uHoverGamma.value = config.hoverDitherGamma;
    c.uHoverMono.value = config.hoverDitherMono;
    c.uTrailAmount.value = config.trail ? config.trailAmount : 0;
    c.uTrailCutoff.value = config.trailCutoff;
    c.uTrailWarp.value = config.trailWarp;
    c.uTrailAberration.value = config.trailAberration;
    c.uTrailContrast.value = config.trailContrast;
    c.uTrailScale.value = config.trailScale;
    c.uTrailLevels.value = config.trailLevels;
    c.uTrailDissolve.value = config.trailDissolve;
    c.uTrailGamma.value = config.trailGamma;
    c.uTrailMono.value = config.trailMono;
    c.uTrailRim.value = config.trailRim;
    c.uTrailRimThickness.value = config.trailRimThickness;
    c.uTrailRimSoftness.value = config.trailRimSoftness;
    // The exit rides the entry channel backwards, so it gets the same print.
    c.uEntryDither.value = config.entry ? config.entryDither : 0;
    c.uEntryScale.value = config.entryScale;
    c.uEntryLevels.value = config.entryDitherLevels;
    c.uEntryDissolve.value = config.entryDitherDissolve;
    c.uEntryGamma.value = config.entryDitherGamma;
    c.uEntryMono.value = config.entryDitherMono;
    c.uHoverClean.value = config.hoverClean;
    c.uCoupling.value = config.coupling;
    c.uStageStreakEnd.value = config.stageStreakEnd;
    c.uStageDitherBegin.value = config.stageDitherBegin;
    c.uStageHandoff.value = config.stageHandoff;
    c.uLift.value = config.lift;
    c.uDepthBlur.value = config.depthBlur;

    // Stepped before the composite reads it, so the stroke painted this frame
    // is the one on screen rather than one frame stale.
    c.uTrail.value = trail.update();

    post.render(scene, camera);
  }

  const onResize = () => resize();
  window.addEventListener('resize', onResize);

  resize();
  beginEntry();
  tick();

  return {
    focus: focusCard,
    step(delta: number) {
      scroll.state.target += delta;
    },
    activeIndex: () => activeIndex,
    exit,
    replayEntry() {
      exitIndex = -1;
      exitReported = false;
      camera.position.z = config.cameraZ;
      camera.updateProjectionMatrix();
      beginEntry();
    },
    internals: { renderer, scene, camera, cards, config },
    dispose() {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', releaseLock);
      scroll.dispose();
      post.dispose();
      cardBuffer.dispose();
      trail.dispose();
      geometry.dispose();
      cards.forEach((card) => {
        card.material.uniforms.uMap.value?.dispose();
        card.material.dispose();
      });
      renderer.dispose();
    },
  };
}
