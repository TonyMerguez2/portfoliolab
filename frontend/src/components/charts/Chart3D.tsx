"use client";
import { useRef, useEffect, useState } from "react";

// ── Constants ──────────────────────────────────────────────────────────────
const N_T          = 120;             // time buckets
const N_P          = 52;              // price bins (log scale)
const CW           = 60;             // terrain width  (X = time)
const CZ           = 30;             // terrain depth  (Z = price axis)
const CH           = 18;             // max height     (Y = volume density)
const ANIM_DUR     = 2600;
const TRAVEL_ANGLE = Math.PI * 0.32; // ±58° pendulum — shows both axes well
const MANUAL_LIMIT = Math.PI * 0.62; // ±112° manual orbit
const IDX_PER_COL  = (N_P - 1) * 6;

const shownKeys = new Set<string>();
const dataKey = (d: { date: string }[]) =>
  d.length > 0 ? `${d[0].date.slice(0, 10)}_${d[d.length - 1].date.slice(0, 10)}_${d.length}` : "";

// ── Glass shaders for the terrain surface ────────────────────────────────
const VERT_GLASS = /* glsl */`
  attribute vec3 color;
  varying vec3 vColor;
  varying vec3 vNormal_vs;
  varying vec3 vViewPos;

  void main() {
    vColor = color;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mvPos.xyz;
    vNormal_vs = normalMatrix * normal;
    gl_Position = projectionMatrix * mvPos;
  }
`;

const FRAG_GLASS = /* glsl */`
  varying vec3 vColor;
  varying vec3 vNormal_vs;
  varying vec3 vViewPos;

  uniform vec3 u_lightDir_vs;

  void main() {
    vec3 N = normalize(vNormal_vs);
    vec3 V = normalize(-vViewPos);

    float NdotV = clamp(dot(N, V), 0.0, 1.0);
    float fresnel = pow(1.0 - NdotV, 3.5);

    vec3 L = normalize(u_lightDir_vs);
    float diff = max(0.12, dot(N, L));
    vec3 H = normalize(L + V);
    float spec = pow(clamp(dot(N, H), 0.0, 1.0), 64.0);

    // Preserve heatmap colors with a cool glass tint on edges
    vec3 glassTint = mix(vColor, vec3(0.06, 0.22, 0.75), 0.28);
    vec3 lit = glassTint * diff;
    // Blue-white specular highlight (glass-like)
    lit += vec3(0.55, 0.78, 1.0) * spec * 2.2;
    // Fresnel rim glow matching the heatmap color
    lit += vColor * fresnel * 2.5;

    float alpha = mix(0.70, 0.95, fresnel);

    gl_FragColor = vec4(lit, alpha);
  }
`;

// ── Color: deep-navy → blue → cyan → yellow → orange → red ───────────────
function heatmap(t: number, brightness = 1.0): [number, number, number] {
  const c = Math.min(1, Math.max(0, t));
  let r = 0, g = 0, b = 0;
  if (c < 0.25) {
    const s = c / 0.25;
    r = 0; g = s * 0.55; b = 0.45 + s * 0.55;
  } else if (c < 0.50) {
    const s = (c - 0.25) / 0.25;
    r = s * 0.72; g = 0.55 + s * 0.41; b = 1.0 - s;
  } else if (c < 0.75) {
    const s = (c - 0.50) / 0.25;
    r = 0.72 + s * 0.25; g = 0.96 - s * 0.40; b = 0;
  } else {
    const s = (c - 0.75) / 0.25;
    r = 0.97 + s * 0.03; g = 0.56 - s * 0.56; b = 0;
  }
  return [r * brightness, g * brightness, b * brightness];
}

function easeOut(t: number) { return 1 - Math.pow(1 - t, 3); }

// ── Volume Profile Grid ────────────────────────────────────────────────────
// X = time buckets, Z = price bins (log scale), Y (height) = vol density
// Each candle distributes its "activity" (log high/low range) as a Gaussian
// across the N_P log-spaced price bins centred on its midpoint.
interface VolumeGrid {
  density:     number[][];  // [N_T][N_P], normalized [0,1]
  logMin:      number;
  logRange:    number;
  closeBins:   number[];    // fractional price-bin index of close price per bucket
  bucketDates: string[];    // first date of each bucket (for labels)
}

function buildVolumeGrid(
  data: { date: string; value: number; high?: number; low?: number }[],
): VolumeGrid {
  const N = data.length;

  const closes = data.map(d => d.value);
  const highs  = data.map(d => d.high  ?? d.value * 1.005);
  const lows   = data.map(d => d.low   ?? d.value * 0.995);

  const globalMin = Math.max(Math.min(...lows)   * 0.995, 0.001);
  const globalMax = Math.max(...highs) * 1.005;
  const logMin  = Math.log(globalMin);
  const logMax  = Math.log(globalMax);
  const logRange = logMax - logMin || 1;

  // Min sigma: 4 bins so candles always produce visible hills (not spikes)
  const minSigmaLog = 4.0 / N_P * logRange;

  const density:     number[][] = Array.from({ length: N_T }, () => new Array(N_P).fill(0));
  const bucketDates: string[]   = new Array(N_T).fill("");
  const bucketCloseSum: number[] = new Array(N_T).fill(0);
  const bucketCloseN:   number[] = new Array(N_T).fill(0);

  for (let i = 0; i < N; i++) {
    const b = Math.min(N_T - 1, Math.floor(i / N * N_T));

    if (!bucketDates[b]) bucketDates[b] = data[i].date;

    const h = Math.max(highs[i], 0.001);
    const l = Math.max(lows[i],  0.001);
    const c = Math.max(closes[i], 0.001);

    const logH = Math.log(h), logL = Math.log(l), logC = Math.log(c);
    const logCenter = (logH + logL) / 2;
    const sigma = Math.max((logH - logL) / 2, minSigmaLog);
    const weight = (logH - logL) / logRange; // % price range = vol proxy

    for (let j = 0; j < N_P; j++) {
      const logBinJ = logMin + (j / (N_P - 1)) * logRange;
      const dx = (logBinJ - logCenter) / sigma;
      density[b][j] += weight * Math.exp(-0.5 * dx * dx);
    }

    bucketCloseSum[b] += (logC - logMin) / logRange * (N_P - 1);
    bucketCloseN[b]++;
  }

  // Normalize density to [0, 1], then apply gamma to compress dynamic range
  // so quiet periods (recent BTC years) remain visible alongside volatile peaks
  let maxD = 0;
  for (const row of density) for (const v of row) if (v > maxD) maxD = v;
  if (maxD > 0)
    for (const row of density) for (let j = 0; j < N_P; j++) {
      row[j] = Math.pow(row[j] / maxD, 0.55); // gamma 0.55 raises the floor
    }

  // Close price bin for each bucket (for price trajectory line)
  const closeBins = Array.from({ length: N_T }, (_, b) =>
    bucketCloseN[b] > 0 ? bucketCloseSum[b] / bucketCloseN[b] : (N_P - 1) / 2
  );

  return { density, logMin, logRange, closeBins, bucketDates };
}

// ── Types ──────────────────────────────────────────────────────────────────
interface Props {
  data:      { date: string; value: number; high?: number; low?: number }[];
  showGrid?: boolean;
}

interface TipState {
  x: number; y: number; visible: boolean;
  date: string; price: string;
  vol: number; volLabel: string;
}

// ── Component ──────────────────────────────────────────────────────────────
export default function Chart3D({ data, showGrid = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<TipState>({
    x: 0, y: 0, visible: false, date: "", price: "", vol: 0, volLabel: "",
  });

  const savedCam = useRef<{ pos: number[]; target: number[]; dir: number } | null>(null);
  const camRef   = useRef<any>(null);
  const ctrlRef  = useRef<any>(null);
  const dirRef   = useRef(1);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || data.length < 2) return;
    let cancelled = false;
    const cleanups: (() => void)[] = [];

    (async () => {
      const [THREE, { OrbitControls }, { EffectComposer }, { RenderPass }, { UnrealBloomPass }] =
        await Promise.all([
          import("three"),
          import("three/examples/jsm/controls/OrbitControls.js"),
          import("three/examples/jsm/postprocessing/EffectComposer.js"),
          import("three/examples/jsm/postprocessing/RenderPass.js"),
          import("three/examples/jsm/postprocessing/UnrealBloomPass.js"),
        ]);
      if (cancelled) return;

      const W = el.clientWidth  || 800;
      const H = el.clientHeight || 500;

      // ── Scene ────────────────────────────────────────────────────────────
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x030810);
      scene.fog = new THREE.FogExp2(0x030810, 0.0024);

      const camTarget = new THREE.Vector3(0, CH * 0.14, 0);
      const camera = new THREE.PerspectiveCamera(44, W / H, 0.1, 400);
      camera.position.set(-30, 38, 30); // true 45° view — shows both time (X) and price (Z) axes

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(W, H);
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.toneMapping = THREE.ReinhardToneMapping;
      renderer.toneMappingExposure = 1.08;
      el.appendChild(renderer.domElement);
      cleanups.push(() => {
        renderer.dispose();
        if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
      });

      const composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 0.60, 0.72, 0.38));

      // ── Controls ─────────────────────────────────────────────────────────
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping   = true;
      controls.dampingFactor   = 0.055;
      controls.target.copy(camTarget);
      controls.minDistance     = 16;
      controls.maxDistance     = 150;
      controls.minAzimuthAngle = -MANUAL_LIMIT;
      controls.maxAzimuthAngle =  MANUAL_LIMIT;
      controls.minPolarAngle   = Math.PI * 0.08;
      controls.maxPolarAngle   = Math.PI * 0.72;
      controls.autoRotate      = false;
      controls.autoRotateSpeed = 0.36 * dirRef.current;
      controls.update();

      const key      = dataKey(data);
      const playAnim = !shownKeys.has(key);
      if (playAnim) shownKeys.add(key);

      if (!playAnim && savedCam.current) {
        camera.position.fromArray(savedCam.current.pos);
        controls.target.fromArray(savedCam.current.target);
        dirRef.current = savedCam.current.dir;
        controls.autoRotateSpeed = 0.36 * dirRef.current;
        controls.autoRotate = true;
        controls.update();
      }
      camRef.current  = camera;
      ctrlRef.current = controls;

      // ── Lights ───────────────────────────────────────────────────────────
      scene.add(new THREE.AmbientLight(0x08162a, 7.0));
      const keyL = new THREE.DirectionalLight(0x5580cc, 1.8);
      keyL.position.set(-22, 55, 30);
      scene.add(keyL);
      const fillL = new THREE.DirectionalLight(0x1a0828, 0.7);
      fillL.position.set(28, 8, -22);
      scene.add(fillL);

      // ── Floor grid ───────────────────────────────────────────────────────
      if (showGrid) {
        const grid = new THREE.GridHelper(CW * 1.85, 22, 0x071420, 0x050e18);
        grid.position.set(0, -0.02, 0);
        scene.add(grid);
      }

      // ── Build volume profile ──────────────────────────────────────────────
      const vg = buildVolumeGrid(data);
      const { density, logMin, logRange, closeBins, bucketDates } = vg;

      // ── Surface mesh (N_T × N_P grid) ─────────────────────────────────────
      // X = time (left→right), Z = log-price (front↔back), Y = vol density (height)
      const surfPos: number[] = [];
      const surfCol: number[] = [];
      const surfIdx: number[] = [];

      for (let i = 0; i < N_T; i++) {
        const x = (i / (N_T - 1) - 0.5) * CW;
        for (let j = 0; j < N_P; j++) {
          const z = (j / (N_P - 1) - 0.5) * CZ;
          const d = density[i][j];
          const y = d * CH;
          surfPos.push(x, y, z);

          // HDR boost on peaks so bloom picks them up (thresholds shifted for gamma-corrected values)
          const hdrf = d > 0.88 ? 1.80 : d > 0.70 ? 1.30 : 1.0;
          const [r, g, b] = heatmap(d, hdrf);
          surfCol.push(r, g, b);
        }
      }

      // Index buffer: column-first so draw-range animation reveals left→right
      for (let i = 0; i < N_T - 1; i++) {
        for (let j = 0; j < N_P - 1; j++) {
          const a = i * N_P + j;
          const b = (i + 1) * N_P + j;
          const c = i * N_P + j + 1;
          const d = (i + 1) * N_P + j + 1;
          surfIdx.push(a, b, d, a, d, c);
        }
      }

      const surfGeo = new THREE.BufferGeometry();
      surfGeo.setAttribute("position", new THREE.Float32BufferAttribute(surfPos, 3));
      surfGeo.setAttribute("color",    new THREE.Float32BufferAttribute(surfCol, 3));
      surfGeo.setIndex(surfIdx);
      surfGeo.computeVertexNormals();
      cleanups.push(() => surfGeo.dispose());

      const surfMat = new THREE.ShaderMaterial({
        uniforms: { u_lightDir_vs: { value: new THREE.Vector3(0, 1, 0) } },
        vertexShader: VERT_GLASS,
        fragmentShader: FRAG_GLASS,
        transparent: true,
        side: THREE.DoubleSide,
      });
      cleanups.push(() => surfMat.dispose());
      const surfMesh = new THREE.Mesh(surfGeo, surfMat);
      scene.add(surfMesh);

      // Subtle wireframe to reveal the grid topology
      const wireMat = new THREE.MeshBasicMaterial({
        color: 0x1a55dd, wireframe: true, transparent: true, opacity: 0.22,
      });
      cleanups.push(() => wireMat.dispose());
      scene.add(new THREE.Mesh(surfGeo, wireMat));

      // ── Price trajectory (close price path riding the terrain surface) ────
      // Z position = log-price bin, Y = terrain height at that price + small offset
      const trailPos: number[] = [];
      const trailCol: number[] = [];
      for (let i = 0; i < N_T; i++) {
        const x  = (i / (N_T - 1) - 0.5) * CW;
        const jf = closeBins[i];
        const j0 = Math.max(0, Math.min(N_P - 2, Math.floor(jf)));
        const t  = jf - j0;
        const d  = (density[i][j0] ?? 0) * (1 - t) + (density[i][j0 + 1] ?? 0) * t;
        const z  = (jf / (N_P - 1) - 0.5) * CZ;
        trailPos.push(x, d * CH + 0.45, z);
        // Cyan-white HDR → triggers bloom
        trailCol.push(1.1, 1.6, 2.2);
      }
      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute("position", new THREE.Float32BufferAttribute(trailPos, 3));
      trailGeo.setAttribute("color",    new THREE.Float32BufferAttribute(trailCol, 3));
      cleanups.push(() => trailGeo.dispose());
      const trailMat = new THREE.LineBasicMaterial({ vertexColors: true });
      cleanups.push(() => trailMat.dispose());
      scene.add(new THREE.Line(trailGeo, trailMat));

      // ── Particles on volume peaks ─────────────────────────────────────────
      const partPos: number[]  = [];
      const partVel: number[]  = [];
      for (let i = 0; i < N_T; i++) {
        for (let j = 0; j < N_P; j++) {
          if (density[i][j] < 0.87) continue;
          const x = (i / (N_T - 1) - 0.5) * CW;
          const z = (j / (N_P - 1) - 0.5) * CZ;
          const y = density[i][j] * CH;
          for (let k = 0; k < 2; k++) {
            partPos.push(x + (Math.random() - 0.5) * 1.4, y + Math.random() * 0.4, z + (Math.random() - 0.5) * 1.4);
            partVel.push((Math.random() - 0.5) * 0.007, 0.016 + Math.random() * 0.024, (Math.random() - 0.5) * 0.007);
          }
        }
      }
      const partOrigY: number[] = partPos.filter((_, i) => i % 3 === 1);
      const numParts = partPos.length / 3;
      let partMesh: import("three").Points | null = null;
      if (numParts > 0) {
        const partGeo = new THREE.BufferGeometry();
        partGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(partPos), 3));
        cleanups.push(() => partGeo.dispose());
        const partMat = new THREE.PointsMaterial({ color: 0xff5500, size: 0.13, transparent: true, opacity: 0.68, sizeAttenuation: true });
        cleanups.push(() => partMat.dispose());
        partMesh = new THREE.Points(partGeo, partMat);
        scene.add(partMesh);
      }

      // ── Sprite helper ─────────────────────────────────────────────────────
      function makeSprite(text: string, size = 20, color = "rgba(255,255,255,0.32)"): import("three").Sprite {
        const c = document.createElement("canvas");
        c.width = 256; c.height = 64;
        const ctx = c.getContext("2d")!;
        ctx.font = `${size}px monospace`;
        ctx.fillStyle = color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, 128, 32);
        const tex = new THREE.CanvasTexture(c);
        cleanups.push(() => tex.dispose());
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
        cleanups.push(() => mat.dispose());
        return new THREE.Sprite(mat);
      }

      if (cancelled) return;

      // Year labels along the time axis (bottom-front)
      const yearsSeen = new Set<string>();
      for (let i = 0; i < N_T; i++) {
        const d = bucketDates[i];
        if (!d) continue;
        const yr = d.slice(0, 4);
        if (!yearsSeen.has(yr)) {
          yearsSeen.add(yr);
          const sp = makeSprite(yr, 20);
          sp.scale.set(4.5, 1.1, 1);
          sp.position.set((i / (N_T - 1) - 0.5) * CW, -2.3, CZ / 2 + 4.5);
          scene.add(sp);
        }
      }

      // Price labels along the price axis (left edge)
      for (let k = 0; k <= 4; k++) {
        const logV  = logMin + (k / 4) * logRange;
        const pVal  = Math.exp(logV);
        const label = pVal >= 1e6 ? `${(pVal / 1e6).toFixed(1)}M`
                    : pVal >= 1e3 ? `${(pVal / 1e3).toFixed(0)}k`
                    : pVal.toFixed(0);
        const z = (k / 4 - 0.5) * CZ;
        const sp = makeSprite(label, 18);
        sp.scale.set(4.2, 0.95, 1);
        sp.position.set(-CW / 2 - 5.5, 0.4, z);
        scene.add(sp);
      }

      // ── Resize observer ───────────────────────────────────────────────────
      const ro = new ResizeObserver(() => {
        const w = el.clientWidth, h = el.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        composer.setSize(w, h);
      });
      ro.observe(el);
      cleanups.push(() => ro.disconnect());

      // ── Glass: pre-compute world-space key light direction ────────────────
      const _keyLightWorld = new THREE.Vector3(-22, 55, 30).normalize();
      const _keyLightView  = new THREE.Vector3();

      // ── Animation setup ───────────────────────────────────────────────────
      const TOTAL_IDX = (N_T - 1) * IDX_PER_COL;
      let animDone = !playAnim, animStart = 0;
      if (playAnim) {
        surfGeo.setDrawRange(0, 0);
        trailGeo.setDrawRange(0, 0);
      }

      // Idle → autoRotate after 2 min of user inactivity
      let idleTimer: ReturnType<typeof setTimeout>;
      const pauseRotate = () => {
        controls.autoRotate = false;
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => { if (!cancelled) controls.autoRotate = true; }, 120_000);
      };
      renderer.domElement.addEventListener("mousedown",  pauseRotate);
      renderer.domElement.addEventListener("wheel",      pauseRotate);
      renderer.domElement.addEventListener("touchstart", pauseRotate);
      cleanups.push(() => clearTimeout(idleTimer));

      // Raycaster for tooltip
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2(-9999, -9999);
      const onMM = (e: MouseEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
        mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
      };
      const onML = () => setTip(t => ({ ...t, visible: false }));
      renderer.domElement.addEventListener("mousemove",  onMM);
      renderer.domElement.addEventListener("mouseleave", onML);

      // ── Render loop ───────────────────────────────────────────────────────
      let raf: number;
      const animate = (now: number) => {
        raf = requestAnimationFrame(animate);

        // Draw-in: reveal terrain left→right over ANIM_DUR
        if (!animDone) {
          if (!animStart) animStart = now;
          const prog = Math.min(1, easeOut((now - animStart) / ANIM_DUR));
          const cols = Math.floor(prog * (N_T - 1));
          surfGeo.setDrawRange(0, cols * IDX_PER_COL);
          trailGeo.setDrawRange(0, cols + 1);
          if (prog >= 1) {
            animDone = true;
            surfGeo.setDrawRange(0, TOTAL_IDX);
            trailGeo.setDrawRange(0, N_T);
            setTimeout(() => { if (!cancelled) controls.autoRotate = true; }, 600);
          }
        }

        // Pendulum: flip direction at ±TRAVEL_ANGLE
        if (controls.autoRotate) {
          const az = controls.getAzimuthalAngle();
          if (az >= TRAVEL_ANGLE - 0.02 && dirRef.current > 0) {
            dirRef.current = -1; controls.autoRotateSpeed = 0.36 * dirRef.current;
          } else if (az <= -TRAVEL_ANGLE + 0.02 && dirRef.current < 0) {
            dirRef.current = 1;  controls.autoRotateSpeed = 0.36 * dirRef.current;
          }
        }

        // Particles float upward, loop when too high
        if (partMesh && animDone && numParts > 0) {
          const pos = partMesh.geometry.attributes.position as import("three").BufferAttribute;
          for (let k = 0; k < numParts; k++) {
            const vy   = partVel[k * 3 + 1];
            const newY = pos.getY(k) + vy;
            pos.setY(k, newY > (partOrigY[k] ?? 0) + 4.5 ? (partOrigY[k] ?? 0) : newY);
          }
          pos.needsUpdate = true;
        }

        // Tooltip raycasting
        if (animDone) {
          raycaster.setFromCamera(mouse, camera);
          const hits = raycaster.intersectObject(surfMesh);
          if (hits.length > 0) {
            const fi   = hits[0].faceIndex ?? 0;
            const col  = Math.min(Math.floor(fi / ((N_P - 1) * 2)), N_T - 1);
            const row  = Math.min(Math.floor((fi % ((N_P - 1) * 2)) / 2), N_P - 1);
            const dVal = density[col]?.[row] ?? 0;
            const logV = logMin + (row / (N_P - 1)) * logRange;
            const pVal = Math.exp(logV);
            const pFmt = pVal >= 1e6 ? `${(pVal / 1e6).toFixed(2)}M`
                       : pVal >= 1e3 ? `${(pVal / 1e3).toFixed(2)}k`
                       : pVal.toFixed(2);
            const volLbl = dVal > 0.72 ? "FORTE" : dVal > 0.42 ? "MODÉRÉE" : dVal > 0.12 ? "FAIBLE" : "NULLE";
            const vec  = hits[0].point.clone().project(camera);
            const sx   = (vec.x * 0.5 + 0.5) * el.clientWidth;
            const sy   = (-vec.y * 0.5 + 0.5) * el.clientHeight;
            setTip({ x: sx, y: sy, visible: true, date: bucketDates[col]?.slice(0, 10) ?? "", price: pFmt, vol: dVal, volLabel: volLbl });
          } else {
            setTip(t => (t.visible ? { ...t, visible: false } : t));
          }
        }

        controls.update();

        // Update glass light direction in view space (changes as camera orbits)
        _keyLightView.copy(_keyLightWorld).transformDirection(camera.matrixWorldInverse);
        surfMat.uniforms.u_lightDir_vs.value.copy(_keyLightView);

        composer.render();
      };
      raf = requestAnimationFrame(animate);
      cleanups.push(() => cancelAnimationFrame(raf));
    })();

    return () => {
      if (camRef.current && ctrlRef.current) {
        savedCam.current = {
          pos:    camRef.current.position.toArray(),
          target: ctrlRef.current.target.toArray(),
          dir:    dirRef.current,
        };
      }
      cancelled = true;
      cleanups.forEach(fn => fn());
    };
  }, [data, showGrid]); // eslint-disable-line

  const volColor = tip.vol > 0.72 ? "#ef4444" : tip.vol > 0.42 ? "#f97316" : tip.vol > 0.12 ? "#eab308" : "#22d3ee";

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative", cursor: "grab" }}>

      {/* ── Tooltip ── */}
      {tip.visible && (
        <div style={{
          position: "absolute", pointerEvents: "none", zIndex: 10,
          left: Math.min(tip.x + 14, (containerRef.current?.clientWidth ?? 800) - 198),
          top:  Math.max(tip.y - 82, 8),
          background: "rgba(2,6,14,0.97)",
          border: `1px solid ${volColor}40`,
          borderRadius: 10, padding: "10px 14px", minWidth: 182,
          boxShadow: `0 0 20px ${volColor}1a, 0 4px 28px rgba(0,0,0,0.75)`,
          fontFamily: "monospace",
        }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.34)", marginBottom: 4 }}>{tip.date}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#ddeeff", marginBottom: 8 }}>{tip.price}</div>
          <div style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 9, letterSpacing: "0.08em", color: "rgba(255,255,255,0.26)", marginBottom: 3 }}>
              ACTIVITÉ VOL.
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
                <div style={{ height: "100%", width: `${tip.vol * 100}%`, background: `linear-gradient(90deg, #0099ff, ${volColor})`, borderRadius: 2 }} />
              </div>
              <span style={{ fontSize: 12, color: volColor, fontWeight: 700, minWidth: 26, textAlign: "right" }}>
                {Math.round(tip.vol * 100)}
              </span>
            </div>
          </div>
          <div style={{ fontSize: 10, color: volColor, fontWeight: 600 }}>{tip.volLabel}</div>
        </div>
      )}

      {/* ── Hint ── */}
      <div style={{
        position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)",
        fontSize: 10, color: "rgba(255,255,255,0.12)", pointerEvents: "none", whiteSpace: "nowrap",
      }}>
        Glissez pour pivoter · Molette pour zoomer · Maj pour déplacer
      </div>
    </div>
  );
}
