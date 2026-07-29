import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

import { CATEGORY_HUES, FALLBACK_HUES } from "../state/palette.js";

// ---------------------------------------------------------------------------
// helpers

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
// deterministic 0..1 from id + salt, so star positions are stable across reloads
function rand01(id, salt) {
  return (hashString(id + ":" + salt) % 100000) / 100000;
}

function makeGlowTexture(size = 128) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSpikeTexture(size = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  ctx.translate(size / 2, size / 2);
  for (let i = 0; i < 4; i++) {
    const g = ctx.createLinearGradient(0, 0, size / 2, 0);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(0.15, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, -size * 0.006, size / 2, size * 0.012);
    ctx.rotate(Math.PI / 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Twinkle lives in ALPHA only (sizes breathing at close range reads as chaos);
// points near the camera fade AND shrink instead of engulfing the lens.
const POINT_VERT = `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aPhase;
  uniform float uTime;
  uniform float uCalm;
  varying vec3 vColor;
  varying float vTwinkle;
  varying float vNear;
  void main() {
    vColor = aColor;
    float amp = mix(0.04, 0.2, uCalm);
    vTwinkle = aPhase < 0.0 ? 1.0 : (1.0 - amp) + amp * sin(uTime * 0.9 + aPhase * 6.2831);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNear = smoothstep(2.5, 12.0, -mv.z);
    float px = aSize * (340.0 / -mv.z) * (0.35 + 0.65 * vNear);
    gl_PointSize = min(px, 72.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const NEBULA_FRAG = `
  varying vec3 vColor;
  varying float vTwinkle;
  varying float vNear;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = exp(-d * d * 10.0) - exp(-2.5);
    if (a <= 0.0) discard;
    gl_FragColor = vec4(vColor, a * 0.42 * vTwinkle * vNear);
  }
`;

const STAR_FRAG = `
  varying vec3 vColor;
  varying float vTwinkle;
  varying float vNear;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float halo = exp(-d * d * 12.0) - exp(-3.0);
    float core = exp(-d * d * 90.0);
    if (halo <= 0.0 && core <= 0.0) discard;
    vec3 col = mix(vColor, vec3(1.0), clamp(core * 1.2, 0.0, 1.0));
    float a = clamp(halo * 0.9 + core, 0.0, 1.0) * vTwinkle * mix(0.3, 1.0, vNear);
    gl_FragColor = vec4(col, a);
  }
`;

// ---------------------------------------------------------------------------

const CAT_RING_RADIUS = 44;
const EMBER_COLOR = new THREE.Color("#6b6f7a");

export class GalaxyScene {
  constructor(canvas, { onSelect } = {}) {
    this.canvas = canvas;
    this.onSelect = onSelect || (() => {});
    this.onRegion = null;
    this.layout = "nebulae"; // "nebulae" | "time"
    this.entries = [];
    this.pulses = [];
    this.categories = [];
    this.starIndex = [];
    this.positions = new Map();
    this.hidden = new Set();
    this.spikes = new Map();
    this.comets = [];
    this.flashes = [];
    this.lastInput = performance.now();
    this.selectedFlag = false;
    this.disposed = false;
    this._lastRegion = null;

    const cores = navigator.hardwareConcurrency ?? 4; // iOS reports undefined
    const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    this.lowTier = cores <= 4 || coarse;
    this.dustPerCategory = this.lowTier ? 340 : 620;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, this.lowTier ? 1.5 : 2),
    );
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#03040c");
    this.scene.fog = new THREE.FogExp2("#03040c", 0.0035);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 800);
    this.cam = { radius: 92, theta: 0.6, phi: 1.15, target: new THREE.Vector3() };
    this.radiusGoal = 92;
    this.camGoal = null;
    this.vel = { theta: 0 }; // rad/s, time-based damping

    this.glowTex = makeGlowTexture();
    this.spikeTex = makeSpikeTexture();

    // one shared uniform set for every points material — _tick writes 2 values
    this.uniforms = { uTime: { value: 0 }, uCalm: { value: 1 } };

    // DOM layer for semantic-zoom labels
    this.labelLayer = document.createElement("div");
    this.labelLayer.className = "label-layer";
    (canvas.parentElement ?? document.body).appendChild(this.labelLayer);
    this.labels = [];
    this._proj = new THREE.Vector3();

    this._buildBackdrop();
    this.nebulaGroup = new THREE.Group();
    this.scene.add(this.nebulaGroup);
    this.starPoints = null;
    this.pulsePoints = null;
    this.threadLines = null;
    this.filamentLines = null;
    this.cometGroup = new THREE.Group();
    this.scene.add(this.cometGroup);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // threshold high enough that only star CORES bloom, never whole nebulae
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 1.0, 0.45, 0.5);
    this.composer.addPass(this.bloom);

    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Points = { threshold: 1.9 };

    this._bindInput();
    this._resize();
    this._resizeObs = new ResizeObserver(() => this._resize());
    this._resizeObs.observe(canvas.parentElement ?? canvas);

    this.clock = new THREE.Clock();
    const loop = () => {
      if (this.disposed) return;
      this._tick(Math.min(this.clock.getDelta(), 0.05));
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  _pointsMaterial(frag) {
    return new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: POINT_VERT,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }

  // ------------------------------------------------------------- backdrop
  _buildBackdrop() {
    const n = 1400;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const phase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3()
        .randomDirection()
        .multiplyScalar(280 + Math.random() * 220);
      pos.set([v.x, v.y, v.z], i * 3);
      const b = 0.35 + Math.random() * 0.5;
      col.set([b, b, b * 1.05], i * 3);
      size[i] = 0.7 + Math.random() * 1.1;
      phase[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    this.backdrop = new THREE.Points(geo, this._pointsMaterial(STAR_FRAG));
    this.scene.add(this.backdrop);
  }

  // ------------------------------------------------------------- layout math
  categoryColor(cat) {
    if (CATEGORY_HUES[cat]) return new THREE.Color(CATEGORY_HUES[cat]);
    const idx = hashString(cat) % FALLBACK_HUES.length;
    return new THREE.Color(FALLBACK_HUES[idx]);
  }

  _categoryCenter(cat) {
    const i = this.categories.indexOf(cat);
    const n = Math.max(this.categories.length, 1);
    const angle = (i / n) * Math.PI * 2 + 0.4;
    const y = (rand01(cat, "y") - 0.5) * 10;
    return new THREE.Vector3(
      Math.cos(angle) * CAT_RING_RADIUS,
      y,
      Math.sin(angle) * CAT_RING_RADIUS,
    );
  }

  _categoryCenterAny(cat) {
    if (this.categories.includes(cat)) return this._categoryCenter(cat);
    const all = [...this.categories, cat];
    const angle = ((all.length - 1) / all.length) * Math.PI * 2 + 0.4;
    return new THREE.Vector3(
      Math.cos(angle) * CAT_RING_RADIUS,
      (rand01(cat, "y") - 0.5) * 10,
      Math.sin(angle) * CAT_RING_RADIUS,
    );
  }

  _timeT(entry, now, span) {
    const age = Math.max(0, now - new Date(entry.createdAt).getTime());
    return Math.min(1, age / span);
  }

  _entryPosition(entry, now, span) {
    if (this.layout === "time") {
      const t = this._timeT(entry, now, span);
      const angle = t * Math.PI * 3.1 + rand01(entry.id, "ja") * 0.35;
      const r = 6 + t * 52;
      return new THREE.Vector3(
        Math.cos(angle) * r,
        (rand01(entry.id, "jy") - 0.5) * 7,
        Math.sin(angle) * r,
      );
    }
    const c = this._categoryCenter(entry.category);
    const a = rand01(entry.id, "a") * Math.PI * 2;
    const r = 3 + rand01(entry.id, "r") * 12;
    return new THREE.Vector3(
      c.x + Math.cos(a) * r,
      c.y + (rand01(entry.id, "h") - 0.5) * 7,
      c.z + Math.sin(a) * r,
    );
  }

  // ------------------------------------------------------------- rebuild
  setEntries(entries, opts = {}) {
    this.entries = entries;
    this.categories = [...new Set(entries.map((e) => e.category))];
    const now = Date.now();
    const span = Math.max(
      1000 * 60 * 60 * 24 * 3,
      ...entries.map((e) => now - new Date(e.createdAt).getTime()),
      ...(this.pulses ?? []).map((p) => now - new Date(p.t).getTime()),
    );

    this.positions.clear();
    for (const e of entries) this.positions.set(e.id, this._entryPosition(e, now, span));

    if (opts.cometFor) this.hidden.add(opts.cometFor);

    this._rebuildNebulae(now, span);
    this._rebuildPulseDust(now, span);
    this._rebuildStars();
    this._rebuildThreads();
    this._rebuildLabels();

    if (opts.cometFor) this._launchComet(opts.cometFor);
  }

  setLayout(mode) {
    if (mode === this.layout) return;
    this.layout = mode;
    this.setEntries(this.entries);
    this.pullBack();
  }

  /** Pulse check-ins render as dust, never stars (see CLAUDE.md). */
  setPulses(pulses) {
    this.pulses = pulses ?? [];
    if (this.entries.length) this.setEntries(this.entries);
  }

  _disposeObject(obj) {
    if (!obj) return;
    obj.geometry?.dispose();
    obj.material?.dispose?.();
    this.scene.remove(obj);
  }

  _rebuildNebulae(now, span) {
    for (const c of [...this.nebulaGroup.children]) {
      c.geometry.dispose();
      c.material.dispose();
    }
    this.nebulaGroup.clear();
    if (this.layout === "time") {
      const n = this.dustPerCategory * 2;
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      const size = new Float32Array(n);
      const phase = new Float32Array(n);
      const c = new THREE.Color("#4a5a8a");
      for (let i = 0; i < n; i++) {
        const t = Math.pow(i / n, 0.8);
        const angle = t * Math.PI * 3.1 + (Math.random() - 0.5) * 0.5;
        const r = 6 + t * 52 + (Math.random() - 0.5) * 5;
        pos.set(
          [Math.cos(angle) * r, (Math.random() - 0.5) * 6, Math.sin(angle) * r],
          i * 3,
        );
        const fade = 1 - t * 0.65;
        col.set([c.r * fade, c.g * fade, c.b * fade], i * 3);
        size[i] = 1.1 + Math.random() * 2.2;
        phase[i] = Math.random();
      }
      this.nebulaGroup.add(this._dustPoints(pos, col, size, phase));
      return;
    }
    for (const cat of this.categories) {
      const center = this._categoryCenter(cat);
      const color = this.categoryColor(cat);
      const n = this.dustPerCategory;
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      const size = new Float32Array(n);
      const phase = new Float32Array(n);
      const arms = 3;
      for (let i = 0; i < n; i++) {
        const arm = i % arms;
        const t = Math.pow(Math.random(), 0.7);
        const angle = (arm / arms) * Math.PI * 2 + t * 2.4 + (Math.random() - 0.5) * 0.7;
        const r = t * 15;
        pos.set(
          [
            center.x + Math.cos(angle) * r,
            center.y + (Math.random() - 0.5) * (5.5 - t * 3.5),
            center.z + Math.sin(angle) * r,
          ],
          i * 3,
        );
        const toWhite = Math.max(0, 0.55 - t);
        col.set(
          [
            color.r + (1 - color.r) * toWhite,
            color.g + (1 - color.g) * toWhite,
            color.b + (1 - color.b) * toWhite,
          ],
          i * 3,
        );
        size[i] = 1.2 + Math.random() * 2.4;
        phase[i] = Math.random();
      }
      const pts = this._dustPoints(pos, col, size, phase);
      pts.userData.spin = 0.014 + rand01(cat, "spin") * 0.012;
      pts.userData.center = center;
      this.nebulaGroup.add(pts);
    }
  }

  _dustPoints(pos, col, size, phase) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    return new THREE.Points(geo, this._pointsMaterial(NEBULA_FRAG));
  }

  _rebuildPulseDust(now, span) {
    this._disposeObject(this.pulsePoints);
    this.pulsePoints = null;
    if (!this.pulses?.length) return;
    const warm = new THREE.Color("#ffd9a8");
    const cold = new THREE.Color("#39415c");
    const n = this.pulses.length;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const phase = new Float32Array(n);
    this.pulses.forEach((p, i) => {
      let v;
      if (this.layout === "time") {
        const t = Math.min(1, Math.max(0, now - new Date(p.t).getTime()) / span);
        const angle = t * Math.PI * 3.1 + (rand01(p.id, "pa") - 0.5) * 0.5;
        const r = 6 + t * 52 + (rand01(p.id, "pr") - 0.5) * 4;
        v = new THREE.Vector3(
          Math.cos(angle) * r,
          (rand01(p.id, "py") - 0.5) * 6,
          Math.sin(angle) * r,
        );
      } else {
        const c = this._categoryCenterAny(p.category);
        const a = rand01(p.id, "pa") * Math.PI * 2;
        const r = 3 + rand01(p.id, "pr") * 13;
        v = new THREE.Vector3(
          c.x + Math.cos(a) * r,
          c.y + (rand01(p.id, "py") - 0.5) * 6,
          c.z + Math.sin(a) * r,
        );
      }
      pos.set([v.x, v.y, v.z], i * 3);
      // mood tints the mote: high mood glows warm, low mood goes cold and dim
      const color = this.categoryColor(p.category).clone();
      const m = p.mood ?? 5;
      if (m >= 6) color.lerp(warm, 0.15 + (m - 6) * 0.08);
      else if (m <= 4) color.lerp(cold, 0.3 + (4 - m) * 0.12);
      const bright = 0.45 + m * 0.055;
      col.set([color.r * bright, color.g * bright, color.b * bright], i * 3);
      size[i] = 1.5 + (p.engagement ?? 5) * 0.16;
      phase[i] = rand01(p.id, "tw");
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    this.pulsePoints = new THREE.Points(geo, this._pointsMaterial(NEBULA_FRAG));
    this.scene.add(this.pulsePoints);
  }

  _rebuildStars() {
    this._disposeObject(this.starPoints);
    for (const s of this.spikes.values()) {
      s.material.dispose();
      this.scene.remove(s);
    }
    this.spikes.clear();

    const visible = this.entries.filter((e) => !this.hidden.has(e.id));
    this.starIndex = visible.map((e) => e.id);
    const n = visible.length;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const phase = new Float32Array(n);
    visible.forEach((e, i) => {
      const p = this.positions.get(e.id);
      pos.set([p.x, p.y, p.z], i * 3);
      const mag = this.magnitude(e);
      if (e.status === "done") {
        col.set(
          [EMBER_COLOR.r * 0.55, EMBER_COLOR.g * 0.55, EMBER_COLOR.b * 0.55],
          i * 3,
        );
        size[i] = 1.1 + mag * 0.12;
        phase[i] = -1;
      } else {
        const c = this.categoryColor(e.category);
        col.set([c.r, c.g, c.b], i * 3);
        size[i] = 1.9 + mag * 0.62;
        phase[i] = rand01(e.id, "tw");
        if (mag >= 7) this._addSpike(e.id, p, c, size[i]);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    this.starPoints = new THREE.Points(geo, this._pointsMaterial(STAR_FRAG));
    this.scene.add(this.starPoints);
  }

  magnitude(e) {
    return Math.max(1, Math.min(10, (e.importance ?? 5) + (e.boost ?? 0)));
  }

  _addSpike(id, p, color, starSize) {
    const mat = new THREE.SpriteMaterial({
      map: this.spikeTex,
      color: color.clone().lerp(new THREE.Color("#ffffff"), 0.6),
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const s = new THREE.Sprite(mat);
    s.position.copy(p);
    const base = starSize * 1.7;
    s.scale.set(base, base, 1);
    s.userData.base = base;
    s.userData.speed = 0.06 + rand01(id, "spin") * 0.05;
    this.scene.add(s);
    this.spikes.set(id, s);
  }

  _rebuildThreads() {
    this._disposeObject(this.threadLines);
    this._disposeObject(this.filamentLines);
    this.threadLines = null;
    this.filamentLines = null;

    const segs = [];
    for (const e of this.entries) {
      if (e.resolvesId && this.positions.has(e.resolvesId)) {
        const a = this.positions.get(e.id);
        const b = this.positions.get(e.resolvesId);
        if (a && b) segs.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    if (segs.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(segs), 3),
      );
      this.threadLines = new THREE.LineSegments(
        geo,
        new THREE.LineBasicMaterial({
          color: "#8fa8ff",
          transparent: true,
          opacity: 0.16,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      this.scene.add(this.threadLines);
    }
    const fil = [];
    for (const e of this.entries) {
      if (e.status !== "open" || this.magnitude(e) < 5) continue;
      const p = this.positions.get(e.id);
      if (!p) continue;
      const dir = new THREE.Vector3(
        rand01(e.id, "fx") - 0.5,
        rand01(e.id, "fy") - 0.2,
        rand01(e.id, "fz") - 0.5,
      )
        .normalize()
        .multiplyScalar(2.6);
      fil.push(p.x, p.y, p.z, p.x + dir.x, p.y + dir.y, p.z + dir.z);
    }
    if (fil.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(fil), 3),
      );
      this.filamentLines = new THREE.LineSegments(
        geo,
        new THREE.LineBasicMaterial({
          color: "#ffffff",
          transparent: true,
          opacity: 0.07,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      this.scene.add(this.filamentLines);
    }
  }

  // ------------------------------------------------------------- labels
  // Semantic zoom: category names read from afar, bright stars get captions
  // as you approach, everything else stays quiet until selected.
  _rebuildLabels() {
    this.labelLayer.innerHTML = "";
    this.labels = [];
    if (this.layout === "nebulae") {
      for (const cat of this.categories) {
        const el = document.createElement("div");
        el.className = "cat-label";
        el.textContent = cat;
        el.style.color = "#" + this.categoryColor(cat).getHexString();
        this.labelLayer.appendChild(el);
        this.labels.push({
          el,
          pos: this._categoryCenter(cat).clone().add(new THREE.Vector3(0, 12, 0)),
          kind: "cat",
          vis: false,
          lastA: -1,
        });
      }
    }
    const named = this.entries
      .filter(
        (e) => e.status === "open" && this.magnitude(e) >= 7 && !this.hidden.has(e.id),
      )
      .sort((a, b) => this.magnitude(b) - this.magnitude(a))
      .slice(0, 10);
    for (const e of named) {
      const p = this.positions.get(e.id);
      if (!p) continue;
      const el = document.createElement("div");
      el.className = "star-label";
      el.textContent = e.title;
      this.labelLayer.appendChild(el);
      // captions clear the star's halo: offset scales with its magnitude
      const offset = 14 + this.magnitude(e) * 1.4;
      this.labels.push({ el, pos: p.clone(), kind: "star", offset, vis: false, lastA: -1 });
    }
    // measure real widths once (collision boxes account for letter-spacing)
    for (const l of this.labels) {
      const r = l.el.getBoundingClientRect();
      l.w = r.width || l.el.textContent.length * 10;
      l.h = r.height || 20;
    }
  }

  _updateLabels() {
    const w = this._viewW || this.canvas.clientWidth;
    const h = this._viewH || this.canvas.clientHeight;
    const placed = [];
    for (const l of this.labels) {
      this._proj.copy(l.pos).project(this.camera);
      const v = this._proj;
      if (v.z > 1 || v.z < -1) {
        if (l.lastA !== 0) {
          l.el.style.opacity = "0";
          l.lastA = 0;
          l.vis = false;
        }
        continue;
      }
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h;
      let a =
        l.kind === "cat"
          ? THREE.MathUtils.clamp((this.cam.radius - 40) / 24, 0, 0.85)
          : THREE.MathUtils.clamp((88 - this.cam.radius) / 32, 0, 0.9);
      if (a > 0.02) {
        // hysteresis: labels that were visible tolerate 30% overlap before yielding
        const rx = x - l.w / 2;
        const ry = y - 6;
        const slack = l.vis ? 0.3 : 0;
        let blocked = false;
        for (const p of placed) {
          const ox = Math.min(rx + l.w, p.x + p.w) - Math.max(rx, p.x);
          const oy = Math.min(ry + l.h, p.y + p.h) - Math.max(ry, p.y);
          if (ox > l.w * slack && oy > 4) {
            blocked = true;
            break;
          }
        }
        if (blocked) a = 0;
        else placed.push({ x: rx, y: ry, w: l.w, h: l.h });
      }
      l.vis = a > 0.02;
      if (Math.abs(a - l.lastA) > 0.01) {
        l.el.style.opacity = a.toFixed(2);
        l.lastA = a;
      }
      l.el.style.transform =
        l.kind === "cat"
          ? `translate(${x - l.w / 2}px, ${y - l.h / 2}px)`
          : `translate(${x - l.w / 2}px, ${y + l.offset}px)`;
    }
  }

  // ------------------------------------------------------------- comet
  _launchComet(id) {
    const end = this.positions.get(id);
    if (!end) {
      this.hidden.delete(id);
      this._rebuildStars();
      return;
    }
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    const side = new THREE.Vector3().crossVectors(camDir, this.camera.up).normalize();
    const start = this.camera.position
      .clone()
      .add(camDir.clone().multiplyScalar(Math.max(30, this.cam.radius * 0.5)))
      .add(side.multiplyScalar(-55))
      .add(new THREE.Vector3(0, -18, 0));
    const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 22, 0));
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    // duration follows arc length: no flashbang streaks at close zoom
    const dur = THREE.MathUtils.clamp(curve.getLength() / 55, 1.3, 2.6);

    const head = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color: "#ffffff",
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    head.scale.set(3.4, 3.4, 1);
    const trailN = 26;
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(trailN * 3), 3),
    );
    const trail = new THREE.Line(
      trailGeo,
      new THREE.LineBasicMaterial({
        color: "#bcd2ff",
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.cometGroup.add(head, trail);
    this.comets.push({ id, curve, head, trail, trailN, t: 0, dur, history: [] });
  }

  _flash(p, color = "#ffffff", scale = 7) {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    s.position.copy(p);
    s.scale.set(0.1, 0.1, 1);
    this.scene.add(s);
    this.flashes.push({ sprite: s, t: 0, dur: 0.9, scale });
  }

  emberize(id) {
    const p = this.positions.get(id);
    if (p) this._flash(p, "#9aa4bd", 4.5);
  }

  // ------------------------------------------------------------- camera
  focusEntry(id) {
    const p = this.positions.get(id);
    if (!p) return;
    this.selectedFlag = true;
    const target = p.clone();
    // on phones the detail panel is bottom-anchored: settle the star higher
    if (window.matchMedia?.("(max-width: 640px)").matches) target.y -= 3.5;
    this._flyTo(target, 13);
  }

  pullBack() {
    this.selectedFlag = false;
    this._flyTo(new THREE.Vector3(0, 0, 0), 92);
  }

  _flyTo(target, radius) {
    const dist = this.cam.target.distanceTo(target);
    const zoomRatio = Math.abs(Math.log(radius / Math.max(this.cam.radius, 0.001)));
    const dur = THREE.MathUtils.clamp(0.8 + dist / 90 + zoomRatio * 0.25, 0.9, 1.8);
    this.camGoal = {
      from: { target: this.cam.target.clone(), radius: this.cam.radius },
      to: { target: target.clone(), radius },
      t: 0,
      dur,
    };
  }

  _bindInput() {
    const el = this.canvas;
    const pointers = new Map(); // pointerId -> {x, y}
    let moved = 0;
    let pinchDist = null;
    let lastT = 0;
    let lastDx = 0;
    let lastDt = 1 / 60;

    const markInput = () => {
      this.lastInput = performance.now();
      this.camGoal = null; // any input interrupts a camera flight
    };

    el.addEventListener("pointerdown", (e) => {
      // leave the screen edges to iOS back/forward swipes
      if (e.clientX < 24 || e.clientX > window.innerWidth - 24) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        moved = 0;
        lastT = e.timeStamp;
        this.vel.theta = 0;
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
      el.setPointerCapture(e.pointerId);
      this.lastInput = performance.now();
    });

    el.addEventListener("pointermove", (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;

      if (pointers.size === 2) {
        // pinch owns the gesture — orbit is fully suppressed
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist && d > 0) {
          this.radiusGoal = THREE.MathUtils.clamp(
            this.radiusGoal * (pinchDist / d),
            6,
            220,
          );
        }
        pinchDist = d;
        markInput();
        return;
      }
      if (pointers.size !== 1) return;

      moved += Math.abs(dx) + Math.abs(dy);
      // sensitivity tracks zoom so screen-feel is constant at every distance
      const sens = THREE.MathUtils.clamp(this.cam.radius / 92, 0.12, 1);
      const dTheta = -dx * 0.004 * sens;
      this.cam.theta += dTheta;
      this.cam.phi = THREE.MathUtils.clamp(
        this.cam.phi + -dy * 0.003 * sens,
        0.25,
        Math.PI - 0.25,
      );
      lastDx = dTheta;
      lastDt = Math.max((e.timeStamp - lastT) / 1000, 1 / 240);
      lastT = e.timeStamp;
      markInput();
    });

    const release = (e) => {
      const was = pointers.size;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchDist = null;
      if (was === 1 && pointers.size === 0) {
        const tapGate = e.pointerType === "touch" ? 14 : 6;
        if (moved < tapGate) this._pick(e);
        else if (performance.now() - this.lastInput < 80) {
          this.vel.theta = lastDx / lastDt; // rad/s flick inertia
        }
      }
      this.lastInput = performance.now();
    };
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);

    el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        // proportional to deltaY: trackpad flicks and wheel clicks both feel right
        const step = THREE.MathUtils.clamp(e.deltaY, -50, 50) * 0.0022;
        this.radiusGoal = THREE.MathUtils.clamp(this.radiusGoal * Math.exp(step), 6, 220);
        markInput();
      },
      { passive: false },
    );
  }

  _pick(e) {
    if (!this.starPoints) return;
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    // hit radius tracks zoom so stars stay tappable from afar
    this.raycaster.params.Points.threshold = Math.max(1.9, this.cam.radius * 0.045);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObject(this.starPoints);
    if (hits.length) {
      const id = this.starIndex[hits[0].index];
      if (id) {
        this.focusEntry(id);
        this.onSelect(id);
        return;
      }
    }
    this.selectedFlag = false;
    this.onSelect(null); // empty space — App decides what happens
  }

  // ------------------------------------------------------------- frame
  _resize() {
    const parent = this.canvas.parentElement;
    const w = parent ? parent.clientWidth : window.innerWidth;
    const h = parent ? parent.clientHeight : window.innerHeight;
    if (!w || !h) return;
    this._viewW = w;
    this._viewH = h;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _tick(dt) {
    const t = this.clock.elapsedTime;

    // eased zoom (wheel/pinch move the goal, never the radius directly)
    if (!this.camGoal) {
      this.cam.radius += (this.radiusGoal - this.cam.radius) * (1 - Math.exp(-8 * dt));
    }
    // calm: 1 far out (full cinematic motion) -> 0 zoomed in (near-stillness)
    const calm = THREE.MathUtils.clamp((this.cam.radius - 16) / 55, 0, 1);
    this.uniforms.uTime.value = t;
    this.uniforms.uCalm.value = calm;
    this.bloom.strength = 0.35 + 0.7 * calm;

    // nebula swirl stills as the camera closes in
    for (const neb of this.nebulaGroup.children) {
      if (neb.userData.spin) {
        neb.rotation.y += neb.userData.spin * calm * dt;
        const c = neb.userData.center;
        if (c) {
          neb.position.set(
            c.x - c.x * Math.cos(neb.rotation.y) - c.z * Math.sin(neb.rotation.y),
            0,
            c.z - c.z * Math.cos(neb.rotation.y) + c.x * Math.sin(neb.rotation.y),
          );
        }
      }
    }
    // spikes: capped on screen and slowed when near
    for (const s of this.spikes.values()) {
      const d = this.camera.position.distanceTo(s.position);
      const k = Math.min(1, d / 30);
      s.scale.setScalar(s.userData.base * (0.3 + 0.7 * k));
      s.material.rotation += s.userData.speed * (0.3 + 0.7 * k) * dt;
    }

    // comets
    for (let i = this.comets.length - 1; i >= 0; i--) {
      const c = this.comets[i];
      c.t += dt / c.dur;
      const tt = Math.min(1, c.t);
      const ease = tt * tt * (3 - 2 * tt);
      const p = c.curve.getPoint(ease);
      c.head.position.copy(p);
      c.history.unshift(p.clone());
      if (c.history.length > c.trailN) c.history.pop();
      const attr = c.trail.geometry.getAttribute("position");
      for (let j = 0; j < c.trailN; j++) {
        const hp = c.history[Math.min(j, c.history.length - 1)] ?? p;
        attr.setXYZ(j, hp.x, hp.y, hp.z);
      }
      attr.needsUpdate = true;
      if (tt >= 1) {
        this.cometGroup.remove(c.head, c.trail);
        c.head.material.dispose();
        c.trail.geometry.dispose();
        c.trail.material.dispose();
        this._flash(c.curve.getPoint(1), "#ffffff", 8);
        this.hidden.delete(c.id);
        this._rebuildStars();
        this._rebuildLabels();
        this.comets.splice(i, 1);
      }
    }

    // flashes
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt / f.dur;
      const k = Math.min(1, f.t);
      const s = f.scale * Math.sin(Math.min(1, k * 1.2) * Math.PI);
      f.sprite.scale.set(Math.max(0.01, s), Math.max(0.01, s), 1);
      f.sprite.material.opacity = 1 - k;
      if (k >= 1) {
        f.sprite.material.dispose();
        this.scene.remove(f.sprite);
        this.flashes.splice(i, 1);
      }
    }

    // camera: fly animation > inertia > idle rotate
    if (this.camGoal) {
      const g = this.camGoal;
      g.t += dt / g.dur;
      const k = Math.min(1, g.t);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      this.cam.target.lerpVectors(g.from.target, g.to.target, e);
      // log-space radius: perceived zoom speed stays constant through the dive
      this.cam.radius = g.from.radius * Math.pow(g.to.radius / g.from.radius, e);
      this.radiusGoal = this.cam.radius;
      if (k >= 1) this.camGoal = null;
    } else {
      // time-based inertia — identical feel at any refresh rate
      const damp = Math.exp(-3.5 * dt);
      this.vel.theta *= damp;
      if (Math.abs(this.vel.theta) > 0.001) this.cam.theta += this.vel.theta * dt;
      const idleFor = performance.now() - this.lastInput;
      if (idleFor > 12000 && this.cam.radius > 45 && !this.selectedFlag) {
        const easeIn = Math.min(1, (idleFor - 12000) / 3000);
        this.cam.theta += dt * 0.03 * easeIn * calm;
      }
    }
    const { radius, theta, phi, target } = this.cam;
    this.camera.position.set(
      target.x + radius * Math.sin(phi) * Math.cos(theta),
      target.y + radius * Math.cos(phi),
      target.z + radius * Math.sin(phi) * Math.sin(theta),
    );
    this.camera.lookAt(target);
    this._updateLabels();
    this._reportRegion();

    this.composer.render();
  }

  _reportRegion() {
    if (!this.onRegion) return;
    let region = null;
    if (this.layout === "nebulae" && this.cam.radius < 42) {
      let best = Infinity;
      for (const cat of this.categories) {
        const d = this._categoryCenter(cat).distanceTo(this.cam.target);
        if (d < best && d < 22) {
          best = d;
          region = cat;
        }
      }
    }
    if (region !== this._lastRegion) {
      this._lastRegion = region;
      this.onRegion(region);
    }
  }

  dispose() {
    this.disposed = true;
    this._resizeObs.disconnect();
    this.labelLayer.remove();
    this.renderer.dispose();
  }
}
