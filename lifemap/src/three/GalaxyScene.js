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

const POINT_VERT = `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aPhase;
  uniform float uTime;
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    vColor = aColor;
    vTwinkle = aPhase < 0.0 ? 1.0 : 0.78 + 0.22 * sin(uTime * 0.9 + aPhase * 6.2831);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * vTwinkle * (340.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const NEBULA_FRAG = `
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = exp(-d * d * 10.0) - exp(-2.5);
    if (a <= 0.0) discard;
    gl_FragColor = vec4(vColor, a * 0.42 * vTwinkle);
  }
`;

const STAR_FRAG = `
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float halo = exp(-d * d * 12.0) - exp(-3.0);
    float core = exp(-d * d * 90.0);
    if (halo <= 0.0 && core <= 0.0) discard;
    vec3 col = mix(vColor, vec3(1.0), clamp(core * 1.2, 0.0, 1.0));
    gl_FragColor = vec4(col, clamp(halo * 0.9 + core, 0.0, 1.0));
  }
`;

function pointsMaterial(frag) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: POINT_VERT,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// ---------------------------------------------------------------------------

const CAT_RING_RADIUS = 44;
const EMBER_COLOR = new THREE.Color("#6b6f7a");

export class GalaxyScene {
  constructor(canvas, { onSelect } = {}) {
    this.canvas = canvas;
    this.onSelect = onSelect || (() => {});
    this.layout = "nebulae"; // "nebulae" | "time"
    this.entries = [];
    this.categories = [];
    this.starIndex = []; // entry ids by attribute index
    this.positions = new Map(); // id -> Vector3
    this.hidden = new Set(); // stars hidden while a comet is in flight
    this.spikes = new Map(); // id -> Sprite
    this.comets = [];
    this.flashes = [];
    this.tweens = [];
    this.lastInput = performance.now();
    this.disposed = false;

    const lowTier = (navigator.hardwareConcurrency || 8) <= 4;
    this.dustPerCategory = lowTier ? 320 : 620;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#03040c");
    this.scene.fog = new THREE.FogExp2("#03040c", 0.0035);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 800);
    this.cam = { radius: 92, theta: 0.6, phi: 1.15, target: new THREE.Vector3() };
    this.camGoal = null;
    this.vel = { theta: 0, phi: 0, zoom: 0 };

    this.glowTex = makeGlowTexture();
    this.spikeTex = makeSpikeTexture();

    this._buildBackdrop();
    this.nebulaGroup = new THREE.Group();
    this.scene.add(this.nebulaGroup);
    this.starPoints = null;
    this.pulsePoints = null;
    this.pulses = [];
    this.threadLines = null;
    this.filamentLines = null;
    this.cometGroup = new THREE.Group();
    this.scene.add(this.cometGroup);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 1.05, 0.65, 0.12);
    this.composer.addPass(this.bloom);

    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Points = { threshold: 1.4 };

    this._bindInput();
    this._resize();
    this._resizeObs = new ResizeObserver(() => this._resize());
    this._resizeObs.observe(canvas.parentElement ?? canvas);

    this.clock = new THREE.Clock();
    const loop = () => {
      if (this.disposed) return;
      this._tick(this.clock.getDelta());
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------- backdrop
  _buildBackdrop() {
    const n = 1400;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const phase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(280 + Math.random() * 220);
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
    this.backdrop = new THREE.Points(geo, pointsMaterial(STAR_FRAG));
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

  _timeT(entry, now, span) {
    // 0 = now (center), 1 = oldest
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
  /**
   * Rebuild the sky from the entry list.
   * opts.cometFor: id of a brand-new entry — its star stays hidden while a
   * comet flies to its position, then pops in with a flash.
   */
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

  _rebuildPulseDust(now, span) {
    if (this.pulsePoints) {
      this.pulsePoints.geometry.dispose();
      this.scene.remove(this.pulsePoints);
      this.pulsePoints = null;
    }
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
    this.pulsePoints = new THREE.Points(geo, pointsMaterial(NEBULA_FRAG));
    this.scene.add(this.pulsePoints);
  }

  // like _categoryCenter but tolerates categories that only exist in pulse data
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

  _rebuildNebulae(now, span) {
    this.nebulaGroup.clear();
    if (this.layout === "time") {
      // one dust ribbon along the time spiral, tinted by nearest entries
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
    return new THREE.Points(geo, pointsMaterial(NEBULA_FRAG));
  }

  _rebuildStars() {
    if (this.starPoints) {
      this.starPoints.geometry.dispose();
      this.scene.remove(this.starPoints);
    }
    for (const s of this.spikes.values()) this.scene.remove(s);
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
        col.set([EMBER_COLOR.r * 0.55, EMBER_COLOR.g * 0.55, EMBER_COLOR.b * 0.55], i * 3);
        size[i] = 1.1 + mag * 0.12;
        phase[i] = -1; // no twinkle for embers
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
    this.starPoints = new THREE.Points(geo, pointsMaterial(STAR_FRAG));
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
    const scale = starSize * 1.7;
    s.scale.set(scale, scale, 1);
    s.userData.speed = 0.12 + rand01(id, "spin") * 0.1;
    this.scene.add(s);
    this.spikes.set(id, s);
  }

  _rebuildThreads() {
    if (this.threadLines) {
      this.threadLines.geometry.dispose();
      this.scene.remove(this.threadLines);
      this.threadLines = null;
    }
    if (this.filamentLines) {
      this.filamentLines.geometry.dispose();
      this.scene.remove(this.filamentLines);
      this.filamentLines = null;
    }
    // resolution threads: resolver -> resolved
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
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(segs), 3));
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
    // loose-end filaments on open, weighty stars
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
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(fil), 3));
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

  // ------------------------------------------------------------- comet
  _launchComet(id) {
    const end = this.positions.get(id);
    if (!end) {
      this.hidden.delete(id);
      this._rebuildStars();
      return;
    }
    // start outside the current view, off to the side
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    const side = new THREE.Vector3().crossVectors(camDir, this.camera.up).normalize();
    const start = this.camera.position
      .clone()
      .add(camDir.clone().multiplyScalar(30))
      .add(side.multiplyScalar(-55))
      .add(new THREE.Vector3(0, -18, 0));
    const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 22, 0));
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);

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
    this.comets.push({ id, curve, head, trail, trailN, t: 0, dur: 1.7, history: [] });
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
    this._flyTo(p, 13);
  }

  pullBack() {
    this._flyTo(new THREE.Vector3(0, 0, 0), 92);
  }

  _flyTo(target, radius) {
    this.camGoal = {
      from: { target: this.cam.target.clone(), radius: this.cam.radius },
      to: { target: target.clone(), radius },
      t: 0,
      dur: 1.25,
    };
  }

  _bindInput() {
    const el = this.canvas;
    let dragging = false;
    let moved = 0;
    let lastX = 0;
    let lastY = 0;
    let pinch = null;

    const markInput = () => (this.lastInput = performance.now());

    el.addEventListener("pointerdown", (e) => {
      dragging = true;
      moved = 0;
      lastX = e.clientX;
      lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
      markInput();
    });
    el.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      lastX = e.clientX;
      lastY = e.clientY;
      this.vel.theta = -dx * 0.004;
      this.vel.phi = -dy * 0.003;
      this.cam.theta += this.vel.theta;
      this.cam.phi = THREE.MathUtils.clamp(this.cam.phi + this.vel.phi, 0.25, Math.PI - 0.25);
      markInput();
    });
    el.addEventListener("pointerup", (e) => {
      dragging = false;
      markInput();
      if (moved < 6) this._pick(e);
    });
    el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.cam.radius = THREE.MathUtils.clamp(
          this.cam.radius * (1 + Math.sign(e.deltaY) * 0.08),
          6,
          220,
        );
        markInput();
      },
      { passive: false },
    );
    el.addEventListener("touchstart", (e) => {
      if (e.touches.length === 2) {
        pinch = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
      }
    });
    el.addEventListener("touchmove", (e) => {
      if (e.touches.length === 2 && pinch) {
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        this.cam.radius = THREE.MathUtils.clamp(this.cam.radius * (pinch / d), 6, 220);
        pinch = d;
        markInput();
      }
    });
  }

  _pick(e) {
    if (!this.starPoints) return;
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
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
    this.onSelect(null); // tapped space
    this.pullBack();
  }

  // ------------------------------------------------------------- frame
  _resize() {
    const parent = this.canvas.parentElement;
    const w = parent ? parent.clientWidth : window.innerWidth;
    const h = parent ? parent.clientHeight : window.innerHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _tick(dt) {
    const t = this.clock.elapsedTime;
    for (const obj of [this.backdrop, this.starPoints, this.pulsePoints, ...this.nebulaGroup.children]) {
      if (obj?.material?.uniforms) obj.material.uniforms.uTime.value = t;
    }
    // nebula slow swirl about its own center
    for (const neb of this.nebulaGroup.children) {
      if (neb.userData.spin) neb.rotation.y += neb.userData.spin * dt;
      if (neb.userData.center) {
        // rotate around own center: reposition pivot trick
        const c = neb.userData.center;
        neb.position.set(
          c.x - c.x * Math.cos(neb.rotation.y) - c.z * Math.sin(neb.rotation.y),
          0,
          c.z - c.z * Math.cos(neb.rotation.y) + c.x * Math.sin(neb.rotation.y),
        );
      }
    }
    for (const s of this.spikes.values()) s.material.rotation += s.userData.speed * dt;

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
        c.trail.geometry.dispose();
        this._flash(c.curve.getPoint(1), "#ffffff", 8);
        this.hidden.delete(c.id);
        this._rebuildStars();
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
        this.scene.remove(f.sprite);
        this.flashes.splice(i, 1);
      }
    }

    // camera: fly animation > inertia > idle rotate
    if (this.camGoal) {
      const g = this.camGoal;
      g.t += dt / g.dur;
      const k = Math.min(1, g.t);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.cam.target.lerpVectors(g.from.target, g.to.target, e);
      this.cam.radius = THREE.MathUtils.lerp(g.from.radius, g.to.radius, e);
      if (k >= 1) this.camGoal = null;
    } else {
      this.vel.theta *= 0.94;
      this.vel.phi *= 0.94;
      if (Math.abs(this.vel.theta) > 0.00005) this.cam.theta += this.vel.theta * 0.5;
      if (performance.now() - this.lastInput > 5000) this.cam.theta += dt * 0.035;
    }
    const { radius, theta, phi, target } = this.cam;
    this.camera.position.set(
      target.x + radius * Math.sin(phi) * Math.cos(theta),
      target.y + radius * Math.cos(phi),
      target.z + radius * Math.sin(phi) * Math.sin(theta),
    );
    this.camera.lookAt(target);

    this.composer.render();
  }

  dispose() {
    this.disposed = true;
    this._resizeObs.disconnect();
    this.renderer.dispose();
  }
}
