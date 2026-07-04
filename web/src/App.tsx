import { useRef, useEffect, useCallback, useState } from "react";
import { GameShell, GameTopbar } from "@freegamestore/games";
import { useGameLoop } from "./hooks/useGameLoop";
import { useHighScore } from "./hooks/useHighScore";
import { drawGlow, lerp, clamp } from "./lib/canvas";
import {
  generateIslands, makePlayerFrog, makeRivalFrog, makeBird, makeFish,
  dist, randBetween, arcY, SINK_TIME,
} from "./lib/marshGame";
import type { Island, Frog, Bird, Fish, Ripple, Particle, FloatText, DeathCause } from "./types";

// ─── palette ────────────────────────────────────────────────────────────────
const C = {
  water1: "#2e7d6b", water2: "#1b5e50",
  lily: "#4caf50", lilyDk: "#388e3c", lilyVn: "#81c784",
  log: "#8d6e4a", logDk: "#5d4037",
  rock: "#78909c", rockDk: "#546e7a",
  frogDk: "#3d9e52", frogBly: "#a5d6a7",
  frogPup: "#1a1a1a",
  ripple: "#7ecdc2",
  gold: "#ffd54f",
  birdBody: "#8d6e4a", birdWing: "#6d4c41", birdBeak: "#ff8f00",
  fishBody: "#1565c0", fishBelly: "#e3f2fd", fishEye: "#fff",
};

// ─── BG water lines ─────────────────────────────────────────────────────────
const BG_LINES = Array.from({ length: 20 }, (_, i) => ({
  x: (i * 137.5) % 1,
  y: (i * 79.3) % 1,
  phase: Math.random() * Math.PI * 2,
  speed: 0.35 + Math.random() * 0.5,
}));

// ─── drawing helpers ─────────────────────────────────────────────────────────

function drawWater(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, C.water1);
  g.addColorStop(1, C.water2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(255,255,255,0.055)";
  ctx.lineWidth = 1.5;
  for (const r of BG_LINES) {
    const x = r.x * W;
    const y = r.y * H + Math.sin(t * r.speed + r.phase) * 5;
    const len = 18 + Math.sin(t * 0.4 + r.phase) * 9;
    ctx.beginPath();
    ctx.moveTo(x - len / 2, y);
    ctx.lineTo(x + len / 2, y);
    ctx.stroke();
  }
}

function drawIsland(ctx: CanvasRenderingContext2D, isl: Island, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(isl.x, isl.y + isl.wobble);

  if (isl.type === "lily") {
    ctx.beginPath();
    ctx.ellipse(3, 5, isl.r * 0.88, isl.r * 0.45, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, isl.r, 0, Math.PI * 2);
    ctx.fillStyle = C.lily;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, isl.r, -0.18, 0.18);
    ctx.closePath();
    ctx.fillStyle = C.lilyDk;
    ctx.fill();

    ctx.strokeStyle = C.lilyVn;
    ctx.lineWidth = 1.1;
    ctx.globalAlpha = alpha * 0.45;
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI * 0.7 + (i / 4) * Math.PI * 1.4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * isl.r * 0.9, Math.sin(a) * isl.r * 0.9);
      ctx.stroke();
    }
    ctx.globalAlpha = alpha;

  } else if (isl.type === "log") {
    ctx.beginPath();
    ctx.ellipse(3, 6, isl.r * 1.1, isl.r * 0.42, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(0, 0, isl.r, isl.r * 0.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = C.log;
    ctx.fill();
    ctx.strokeStyle = C.logDk;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.globalAlpha = alpha * 0.35;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.ellipse(0, 0, (isl.r * i) / 3.5, (isl.r * i) / 3.5 * 0.4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = alpha;

  } else {
    ctx.beginPath();
    ctx.ellipse(4, 6, isl.r * 0.85, isl.r * 0.38, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, isl.r, 0, Math.PI * 2);
    ctx.fillStyle = C.rock;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(-isl.r * 0.25, -isl.r * 0.28, isl.r * 0.33, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.fill();
  }

  ctx.restore();
}

function drawGoalFlower(ctx: CanvasRenderingContext2D, isl: Island, t: number) {
  ctx.save();
  ctx.translate(isl.x, isl.y + isl.wobble - isl.r * 0.3 + Math.sin(t * 1.9) * 2);
  const petals = ["#f48fb1", "#f06292", "#ff80ab", "#f48fb1", "#f8bbd0"];
  for (let i = 0; i < 5; i++) {
    ctx.save();
    ctx.rotate((i / 5) * Math.PI * 2);
    ctx.beginPath();
    ctx.ellipse(0, -8, 4, 7, 0, 0, Math.PI * 2);
    ctx.fillStyle = petals[i % petals.length] ?? "#f48fb1";
    ctx.fill();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fillStyle = C.gold;
  ctx.fill();
  ctx.restore();
}

function drawFrog(
  ctx: CanvasRenderingContext2D,
  frog: Frog,
  t: number,
  wobbleOffset: number,
  sinkAlpha: number,
) {
  ctx.save();
  ctx.globalAlpha = sinkAlpha;
  ctx.translate(frog.x, frog.y + wobbleOffset);
  ctx.rotate(frog.angle);
  ctx.scale(frog.squishX, frog.squishY);

  const r = 15;
  const bodyColor = frog.color;
  const darkColor = frog.isPlayer ? C.frogDk : darken(bodyColor);
  const bellyColor = frog.isPlayer ? C.frogBly : lighten(bodyColor);

  // Shadow when sitting
  if (frog.jumpT >= 1) {
    ctx.beginPath();
    ctx.ellipse(2, r * 0.85, r * 0.65, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fill();
  }

  // Hind legs
  const legBob = frog.jumpT < 1 ? Math.sin(t * 14) * 2 : 0;
  ctx.fillStyle = darkColor;
  ctx.beginPath();
  ctx.ellipse(-r * 0.88, r * 0.52 + legBob, 7, 4.5, Math.PI * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(r * 0.88, r * 0.52 + legBob, 7, 4.5, -Math.PI * 0.35, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.83, 0, 0, Math.PI * 2);
  ctx.fillStyle = bodyColor;
  ctx.fill();

  // Belly
  ctx.beginPath();
  ctx.ellipse(0, r * 0.18, r * 0.58, r * 0.48, 0, 0, Math.PI * 2);
  ctx.fillStyle = bellyColor;
  ctx.fill();

  // Front legs
  ctx.fillStyle = darkColor;
  ctx.beginPath();
  ctx.ellipse(-r * 0.72, r * 0.08, 4.5, 3.5, Math.PI * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(r * 0.72, r * 0.08, 4.5, 3.5, -Math.PI * 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  for (const ex of [-r * 0.43, r * 0.43]) {
    const ey = -r * 0.44;
    ctx.beginPath();
    ctx.arc(ex, ey, 6, 0, Math.PI * 2);
    ctx.fillStyle = bodyColor;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex, ey, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = frog.eyeColor;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + 1, ey + 1, 2.4, 0, Math.PI * 2);
    ctx.fillStyle = C.frogPup;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + 0.4, ey - 0.5, 0.9, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
  }

  ctx.restore();
}

// simple color helpers (no external deps)
function darken(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, ((n >> 16) & 0xff) - 50);
  const g = Math.max(0, ((n >> 8) & 0xff) - 50);
  const b = Math.max(0, (n & 0xff) - 50);
  return `rgb(${r},${g},${b})`;
}
function lighten(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + 60);
  const g = Math.min(255, ((n >> 8) & 0xff) + 60);
  const b = Math.min(255, (n & 0xff) + 60);
  return `rgb(${r},${g},${b})`;
}

function drawBird(ctx: CanvasRenderingContext2D, bird: Bird) {
  ctx.save();
  ctx.translate(bird.x, bird.y);
  // face direction of travel
  if (bird.vx < 0) ctx.scale(-1, 1);

  const wingFlap = bird.phase === "soaring"
    ? Math.sin(bird.wingT * 6) * 0.55
    : bird.phase === "diving"
      ? 0.2
      : Math.sin(bird.wingT * 9) * 0.7;

  // Body
  ctx.beginPath();
  ctx.ellipse(0, 0, 18, 8, 0, 0, Math.PI * 2);
  ctx.fillStyle = C.birdBody;
  ctx.fill();

  // Upper wing
  ctx.save();
  ctx.rotate(-wingFlap);
  ctx.beginPath();
  ctx.ellipse(-4, -2, 20, 6, -0.25, 0, Math.PI * 2);
  ctx.fillStyle = C.birdWing;
  ctx.fill();
  ctx.restore();

  // Lower wing
  ctx.save();
  ctx.rotate(wingFlap * 0.4);
  ctx.beginPath();
  ctx.ellipse(-4, 4, 16, 4, 0.2, 0, Math.PI * 2);
  ctx.fillStyle = C.birdWing;
  ctx.fill();
  ctx.restore();

  // Head
  ctx.beginPath();
  ctx.arc(16, -3, 7, 0, Math.PI * 2);
  ctx.fillStyle = C.birdBody;
  ctx.fill();

  // Beak
  ctx.beginPath();
  ctx.moveTo(22, -3);
  ctx.lineTo(34, -1);
  ctx.lineTo(22, 1);
  ctx.closePath();
  ctx.fillStyle = C.birdBeak;
  ctx.fill();

  // Eye
  ctx.beginPath();
  ctx.arc(18, -5, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(18.5, -5, 1.3, 0, Math.PI * 2);
  ctx.fillStyle = "#111";
  ctx.fill();

  // Dive indicator — red glint eyes when diving
  if (bird.phase === "diving") {
    ctx.beginPath();
    ctx.arc(18.5, -5, 1.3, 0, Math.PI * 2);
    ctx.fillStyle = "#ff1744";
    ctx.fill();
  }

  ctx.restore();
}

function drawFish(ctx: CanvasRenderingContext2D, fish: Fish) {
  if (fish.phase === "hidden") return;
  ctx.save();
  ctx.translate(fish.x, fish.y);

  const scaleY = fish.phase === "rising" || fish.phase === "snapping" ? 1 : 0.6;
  ctx.scale(1, scaleY);

  // Tail
  ctx.beginPath();
  ctx.moveTo(-28, 0);
  ctx.lineTo(-44, -14);
  ctx.lineTo(-44, 14);
  ctx.closePath();
  ctx.fillStyle = C.fishBody;
  ctx.fill();

  // Body
  ctx.beginPath();
  ctx.ellipse(0, 0, 30, 14, 0, 0, Math.PI * 2);
  ctx.fillStyle = C.fishBody;
  ctx.fill();

  // Belly
  ctx.beginPath();
  ctx.ellipse(4, 4, 20, 8, 0, 0, Math.PI * 2);
  ctx.fillStyle = C.fishBelly;
  ctx.fill();

  // Mouth (opens on snap)
  const mouthGape = fish.mouthOpen * 22;
  ctx.beginPath();
  ctx.moveTo(28, 0);
  ctx.lineTo(28 + mouthGape * 0.3, -mouthGape * 0.5);
  ctx.lineTo(28 + mouthGape * 0.3, mouthGape * 0.5);
  ctx.closePath();
  ctx.fillStyle = "#e53935";
  ctx.fill();

  // Eye
  ctx.beginPath();
  ctx.arc(14, -5, 5, 0, Math.PI * 2);
  ctx.fillStyle = C.fishEye;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(15, -5, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = "#111";
  ctx.fill();

  ctx.restore();
}

function drawRipple(ctx: CanvasRenderingContext2D, rip: Ripple) {
  ctx.beginPath();
  ctx.arc(rip.x, rip.y, rip.r, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(126,205,194,${rip.alpha})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle) {
  ctx.save();
  ctx.globalAlpha = p.alpha;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.fillStyle = p.color;
  ctx.fill();
  ctx.restore();
}

function drawFloatText(ctx: CanvasRenderingContext2D, ft: FloatText) {
  ctx.save();
  ctx.globalAlpha = ft.alpha;
  ctx.font = "bold 18px Manrope, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = ft.color;
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 4;
  ctx.fillText(ft.text, ft.x, ft.y);
  ctx.restore();
}

function addRipple(ripples: Ripple[], x: number, y: number) {
  ripples.push({ x, y, r: 4, alpha: 0.7 });
}

function burst(particles: Particle[], x: number, y: number, color: string, n = 8) {
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + randBetween(-0.3, 0.3);
    const spd = randBetween(40, 120);
    particles.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: randBetween(2, 5), alpha: 1, color });
  }
}

// ─── main component ──────────────────────────────────────────────────────────
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── game state (all in refs to avoid re-renders in the loop) ────────────
  const islandsRef = useRef<Island[]>([]);
  const frogsRef = useRef<Frog[]>([]);          // [0] = player, rest = rivals
  const birdsRef = useRef<Bird[]>([]);
  const fishRef = useRef<Fish[]>([]);
  const ripplesRef = useRef<Ripple[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const floatTextsRef = useRef<FloatText[]>([]);
  const timeRef = useRef(0);
  const birdSpawnTimerRef = useRef(3.5);
  const scoreRef = useRef(0);
  const phaseRef = useRef<"idle" | "jumping" | "dead" | "won">("idle");
  const deathCauseRef = useRef<DeathCause>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // ── react state (UI only) ────────────────────────────────────────────────
  const [score, setScore] = useState(0);
  const [phase, setPhase] = useState<"idle" | "jumping" | "dead" | "won">("idle");
  const [deathCause, setDeathCause] = useState<DeathCause>(null);
  const [highScore, updateHighScore] = useHighScore("frofrogjumping_hs");

  // ── audio ────────────────────────────────────────────────────────────────
  function getAudio() {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    return audioCtxRef.current;
  }
  function playBloop(freq = 320, dur = 0.18) {
    try {
      const ac = getAudio();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.5, ac.currentTime + dur);
      gain.gain.setValueAtTime(0.16, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
      osc.start(); osc.stop(ac.currentTime + dur + 0.02);
    } catch { /* muted */ }
  }
  function playSplash() {
    try {
      const ac = getAudio();
      const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.22), ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.055));
      const src = ac.createBufferSource();
      const gain = ac.createGain();
      src.buffer = buf; src.connect(gain); gain.connect(ac.destination);
      gain.gain.setValueAtTime(0.2, ac.currentTime);
      src.start();
    } catch { /* muted */ }
  }
  function playScreech() {
    try {
      const ac = getAudio();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(900, ac.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, ac.currentTime + 0.3);
      gain.gain.setValueAtTime(0.12, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.3);
      osc.start(); osc.stop(ac.currentTime + 0.32);
    } catch { /* muted */ }
  }

  // ── init ─────────────────────────────────────────────────────────────────
  const initGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.width, H = canvas.height;

    const count = Math.min(16, Math.max(9, Math.floor((W * H) / 24000)));
    const startX = clamp(W * 0.12, 80, 180);
    const startY = H * 0.5 + randBetween(-H * 0.12, H * 0.12);

    const islands = generateIslands(W, H, count, startX, startY);
    islandsRef.current = islands;

    // Player frog on start island
    const start = islands[0]!;
    const player = makePlayerFrog(start.x, start.y, 0);
    const frogs: Frog[] = [player];

    // Rival frogs — one per random mid island (not first, not last)
    for (let i = 1; i < islands.length - 1; i++) {
      if (Math.random() < 0.55) {
        const isl = islands[i]!;
        frogs.push(makeRivalFrog(isl.x, isl.y, i));
      }
    }
    frogsRef.current = frogs;

    birdsRef.current = [];
    fishRef.current = [];
    ripplesRef.current = [];
    particlesRef.current = [];
    floatTextsRef.current = [];
    timeRef.current = 0;
    birdSpawnTimerRef.current = 4;
    scoreRef.current = 0;
    phaseRef.current = "idle";
    deathCauseRef.current = null;
    setScore(0);
    setPhase("idle");
    setDeathCause(null);
  }, []);

  useEffect(() => {
    const obs = new ResizeObserver((entries) => {
      const e = entries[0];
      if (!e) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.round(e.contentRect.width);
      canvas.height = Math.round(e.contentRect.height);
      initGame();
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [initGame]);

  // ── tap handler ───────────────────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (phaseRef.current === "dead" || phaseRef.current === "won") return;
    if (phaseRef.current === "jumping") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const tapX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const tapY = (e.clientY - rect.top) * (canvas.height / rect.height);

    const frogs = frogsRef.current;
    const player = frogs[0];
    if (!player || !player.alive) return;

    const islands = islandsRef.current;

    // Find tapped island
    let tappedIdx = -1;
    let bestD = 9999;
    for (let i = 0; i < islands.length; i++) {
      if (i === player.islandIdx) continue;
      const isl = islands[i]!;
      const d = dist(tapX, tapY, isl.x, isl.y + isl.wobble);
      // generous tap radius
      if (d < isl.r + 28 && d < bestD) { bestD = d; tappedIdx = i; }
    }
    if (tappedIdx === -1) return;

    const targetIsl = islands[tappedIdx]!;
    // Too far?
    const jumpDist = dist(player.x, player.y, targetIsl.x, targetIsl.y);
    if (jumpDist > 340) return;

    // Launch player
    player.fromX = player.x; player.fromY = player.y;
    player.toX = targetIsl.x; player.toY = targetIsl.y;
    player.jumpT = 0;
    player.jumpDuration = clamp(jumpDist / 420, 0.28, 0.7);
    player.angle = Math.atan2(targetIsl.y - player.y, targetIsl.x - player.x);
    player.squishX = 0.7; player.squishY = 1.4;
    player.islandIdx = -1;

    // Store target for landing resolution
    (player as Frog & { _target: number })._target = tappedIdx;

    phaseRef.current = "jumping";
    setPhase("jumping");
    playBloop(300, 0.15);
    addRipple(ripplesRef.current, player.x, player.y);
  }, []);

  // ── game loop ─────────────────────────────────────────────────────────────
  const paused = phase === "dead" || phase === "won";

  useGameLoop(useCallback((dt: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width, H = canvas.height;
    timeRef.current += dt;
    const t = timeRef.current;

    const islands = islandsRef.current;
    const frogs = frogsRef.current;
    const birds = birdsRef.current;
    const fishes = fishRef.current;
    const ripples = ripplesRef.current;
    const particles = particlesRef.current;
    const floats = floatTextsRef.current;
    const player = frogs[0];

    // ── island wobble & sinking ────────────────────────────────────────────
    for (const isl of islands) {
      isl.wobble += isl.wobbleDir * dt * 5.5;
      if (Math.abs(isl.wobble) > 2.5) isl.wobbleDir *= -1;
      if (isl.sinking) {
        isl.sinkT = Math.min(isl.sinkT + dt / SINK_TIME, 1);
        if (isl.sinkT > 0.95) isl.y += dt * 35;
      }
    }

    // ── player jump arc ────────────────────────────────────────────────────
    if (player && player.alive && phaseRef.current === "jumping") {
      player.jumpT = Math.min(player.jumpT + dt / player.jumpDuration, 1);
      const jt = player.jumpT;
      const jd = dist(player.fromX, player.fromY, player.toX, player.toY);
      player.x = player.fromX + (player.toX - player.fromX) * jt;
      player.y = arcY(player.fromY, player.toY, jd, jt);

      // squash & stretch
      if (jt < 0.5) {
        player.squishX = lerp(0.7, 1.3, jt * 2);
        player.squishY = lerp(1.4, 0.7, jt * 2);
      } else {
        player.squishX = lerp(1.3, 1.0, (jt - 0.5) * 2);
        player.squishY = lerp(0.7, 1.0, (jt - 0.5) * 2);
      }

      if (player.jumpT >= 1) {
        // Landing
        const targetIdx = (player as Frog & { _target?: number })._target ?? -1;
        if (targetIdx === -1) {
          killPlayer("water");
        } else {
          const targetIsl = islands[targetIdx];
          if (!targetIsl || (targetIsl.sinking && targetIsl.sinkT > 0.7)) {
            killPlayer("water");
          } else {
            // Check rival frog collision
            let rivalHit = false;
            for (let fi = 1; fi < frogs.length; fi++) {
              const rival = frogs[fi]!;
              if (rival.islandIdx === targetIdx && rival.alive) {
                rivalHit = true;
                // Both fall in — fish eats them
                rival.alive = false;
                rival.islandIdx = -1;
                // Spawn fish at that spot
                spawnFishAt(targetIsl.x, targetIsl.y + targetIsl.wobble);
                burst(particles, targetIsl.x, targetIsl.y, "#1565c0", 14);
                addRipple(ripples, targetIsl.x, targetIsl.y);
                addRipple(ripples, targetIsl.x + 10, targetIsl.y - 5);
                playSplash();
                floats.push({ x: targetIsl.x, y: targetIsl.y - 30, vy: -55, alpha: 1, text: "🐟 GULP!", color: "#e3f2fd" });
                killPlayer("fish");
                break;
              }
            }

            if (!rivalHit) {
              // Successful landing
              player.islandIdx = targetIdx;
              player.x = targetIsl.x;
              player.y = targetIsl.y;
              player.squishX = 1.3; player.squishY = 0.7;
              player.angle = 0;

              const newScore = scoreRef.current + 1;
              scoreRef.current = newScore;
              setScore(newScore);
              addRipple(ripples, player.x, player.y);
              burst(particles, player.x, player.y, "#4caf50", 5);
              playBloop(520, 0.12);

              // Float score
              floats.push({ x: player.x, y: player.y - 30, vy: -50, alpha: 1, text: `+1`, color: "#ffd54f" });

              // Win?
              if (targetIdx === islands.length - 1) {
                phaseRef.current = "won";
                setPhase("won");
                updateHighScore(newScore);
                burst(particles, player.x, player.y, "#ffd54f", 22);
                burst(particles, player.x, player.y, "#f48fb1", 14);
              } else {
                phaseRef.current = "idle";
                setPhase("idle");
              }
            }
          }
        }
      }
    }

    // squish recovery when idle
    if (player && player.alive && phaseRef.current === "idle") {
      player.squishX = lerp(player.squishX, 1, dt * 9);
      player.squishY = lerp(player.squishY, 1, dt * 9);
    }

    // ── bird spawning ──────────────────────────────────────────────────────
    birdSpawnTimerRef.current -= dt;
    if (birdSpawnTimerRef.current <= 0) {
      birdSpawnTimerRef.current = randBetween(5, 9);
      birds.push(makeBird(W, H));
    }

    // ── bird AI ────────────────────────────────────────────────────────────
    for (let bi = birds.length - 1; bi >= 0; bi--) {
      const bird = birds[bi]!;
      bird.wingT += dt;

      if (bird.phase === "soaring") {
        bird.x += bird.vx * dt;
        bird.y += bird.vy * dt;

        // Decide to dive at player?
        if (player && player.alive && phaseRef.current !== "dead" && phaseRef.current !== "won") {
          const d = dist(bird.x, bird.y, player.x, player.y);
          if (d < 200 && Math.abs(bird.x - player.x) < 160) {
            bird.phase = "diving";
            bird.strikeX = player.x;
            bird.strikeY = player.y;
            bird.diveT = 0;
          }
        }

        // Leave screen
        if (bird.x < -100 || bird.x > W + 100) birds.splice(bi, 1);

      } else if (bird.phase === "diving") {
        bird.diveT = Math.min(bird.diveT + dt * 1.6, 1);
        const startX = bird.x - bird.vx * (bird.diveT / 1.6);
        const startY = bird.y;
        bird.x = lerp(startX, bird.strikeX, bird.diveT);
        bird.y = lerp(startY, bird.strikeY - 10, bird.diveT);

        // Hit player?
        if (player && player.alive) {
          const d = dist(bird.x, bird.y, player.x, player.y);
          if (d < 28) {
            playScreech();
            burst(particles, player.x, player.y, "#ff8f00", 10);
            floats.push({ x: player.x, y: player.y - 30, vy: -55, alpha: 1, text: "🦅 SNATCHED!", color: "#ff8f00" });
            killPlayer("bird");
            bird.phase = "leaving";
            bird.vx = bird.vx > 0 ? 120 : -120;
            bird.vy = -60;
          }
        }

        if (bird.diveT >= 1) {
          bird.phase = "rising";
          bird.vy = -90;
        }

      } else if (bird.phase === "rising") {
        bird.x += bird.vx * dt;
        bird.y += bird.vy * dt;
        bird.vy = lerp(bird.vy, 0, dt * 3);
        if (bird.y < 60) { bird.phase = "leaving"; }

      } else if (bird.phase === "leaving") {
        bird.x += bird.vx * dt;
        bird.y += bird.vy * dt;
        bird.vy = lerp(bird.vy, 0, dt * 2);
        if (bird.x < -120 || bird.x > W + 120) birds.splice(bi, 1);
      }
    }

    // ── fish update ────────────────────────────────────────────────────────
    for (let fi = fishes.length - 1; fi >= 0; fi--) {
      const fish = fishes[fi]!;
      fish.t += dt;

      if (fish.phase === "rising") {
        const progress = Math.min(fish.t / 0.55, 1);
        fish.y = fish.targetY + 80 - 80 * progress;
        fish.mouthOpen = progress;
        if (progress >= 1) { fish.phase = "snapping"; fish.t = 0; }

      } else if (fish.phase === "snapping") {
        fish.mouthOpen = 1 - fish.t * 2;
        if (fish.t > 0.5) { fish.phase = "sinking"; fish.t = 0; }

      } else if (fish.phase === "sinking") {
        fish.y += dt * 60;
        fish.mouthOpen = 0;
        if (fish.t > 1.2) fishes.splice(fi, 1);
      }
    }

    // ── ripples ────────────────────────────────────────────────────────────
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rip = ripples[i]!;
      rip.r += dt * 36; rip.alpha -= dt * 1.3;
      if (rip.alpha <= 0) ripples.splice(i, 1);
    }

    // ── particles ──────────────────────────────────────────────────────────
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]!;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += 200 * dt;
      p.alpha -= dt * 2;
      if (p.alpha <= 0) particles.splice(i, 1);
    }

    // ── float texts ────────────────────────────────────────────────────────
    for (let i = floats.length - 1; i >= 0; i--) {
      const ft = floats[i]!;
      ft.y += ft.vy * dt;
      ft.vy = lerp(ft.vy, 0, dt * 4);
      ft.alpha -= dt * 1.1;
      if (ft.alpha <= 0) floats.splice(i, 1);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DRAW
    // ═══════════════════════════════════════════════════════════════════════
    ctx.clearRect(0, 0, W, H);
    drawWater(ctx, W, H, t);

    // Ripples
    for (const rip of ripples) drawRipple(ctx, rip);

    // Islands + frogs on them (back-to-front by y)
    const sorted = islands
      .map((isl, i) => ({ isl, i }))
      .sort((a, b) => a.isl.y - b.isl.y);

    for (const { isl, i } of sorted) {
      const alpha = isl.sinking ? clamp(1 - isl.sinkT * 1.5, 0, 1) : 1;
      if (alpha <= 0) continue;
      drawIsland(ctx, isl, alpha);

      // Goal flower on last island
      if (i === islands.length - 1 && phaseRef.current !== "won") {
        drawGoalFlower(ctx, isl, t);
      }

      // Glow on player's current island
      if (player && i === player.islandIdx && phaseRef.current === "idle") {
        ctx.save();
        ctx.globalAlpha = 0.22 + Math.sin(t * 3) * 0.08;
        drawGlow(ctx, isl.x, isl.y + isl.wobble, isl.r + 20, "#a5d6a7");
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      // Rival frogs sitting on islands
      for (let fi = 1; fi < frogs.length; fi++) {
        const rival = frogs[fi]!;
        if (rival.alive && rival.islandIdx === i) {
          drawFrog(ctx, rival, t, isl.wobble, 1);
        }
      }
    }

    // Fish
    for (const fish of fishes) drawFish(ctx, fish);

    // Particles
    for (const p of particles) drawParticle(ctx, p);

    // Player frog
    if (player && player.alive) {
      const onIsl = player.islandIdx >= 0 ? (islands[player.islandIdx] ?? null) : null;
      const wobOff = onIsl ? onIsl.wobble : 0;
      drawFrog(ctx, player, t, wobOff, 1);
    }

    // Birds (on top)
    for (const bird of birds) drawBird(ctx, bird);

    // Float texts
    for (const ft of floats) drawFloatText(ctx, ft);

    // ── tap-target highlights ──────────────────────────────────────────────
    if (phaseRef.current === "idle" && player) {
      for (let i = 0; i < islands.length; i++) {
        if (i === player.islandIdx) continue;
        const isl = islands[i]!;
        const d = dist(player.x, player.y, isl.x, isl.y);
        if (d <= 340) {
          ctx.save();
          ctx.globalAlpha = 0.18 + Math.sin(t * 2.5 + i) * 0.06;
          ctx.beginPath();
          ctx.arc(isl.x, isl.y + isl.wobble, isl.r + 8, 0, Math.PI * 2);
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }
      }
    }

  }, [updateHighScore]), paused);

  // ── helpers called from loop ───────────────────────────────────────────────
  function killPlayer(cause: DeathCause) {
    const player = frogsRef.current[0];
    if (!player) return;
    player.alive = false;
    player.islandIdx = -1;
    phaseRef.current = "dead";
    deathCauseRef.current = cause;
    setPhase("dead");
    setDeathCause(cause);
    updateHighScore(scoreRef.current);
    if (cause === "water" || cause === "fish") playSplash();
    burst(particlesRef.current, player.x, player.y, cause === "bird" ? "#ff8f00" : "#7ecdc2", 12);
    addRipple(ripplesRef.current, player.x, player.y);
  }

  function spawnFishAt(x: number, y: number) {
    const fish = makeFish(x, y);
    fish.phase = "rising";
    fish.t = 0;
    fishRef.current.push(fish);
  }

  // ── UI ────────────────────────────────────────────────────────────────────
  const deathMessages: Record<NonNullable<DeathCause>, { emoji: string; title: string; sub: string }> = {
    bird:  { emoji: "🦅", title: "Snatched!", sub: "A heron grabbed you!" },
    fish:  { emoji: "🐟", title: "Gulp!", sub: "You crashed into a rival — fish ate you both!" },
    water: { emoji: "💦", title: "Splashed!", sub: "You missed the lily pad!" },
  };
  const dm = deathCause ? deathMessages[deathCause] : null;
  const totalIslands = Math.max(0, islandsRef.current.length - 1);

  return (
    <GameShell topbar={
      <GameTopbar title="Frog Marsh" score={score} highScore={highScore} />
    }>
      <div ref={containerRef} className="relative w-full h-full overflow-hidden select-none">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full touch-none"
          style={{ cursor: "pointer" }}
          onPointerDown={onPointerDown}
        />

        {/* Progress HUD */}
        {(phase === "idle" || phase === "jumping") && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none">
            <div className="rounded-full px-3 py-1 text-sm font-semibold"
              style={{ background: "rgba(0,0,0,0.38)", color: "#e8f5e9", fontFamily: "Manrope, sans-serif", backdropFilter: "blur(4px)" }}>
              🐸 {score} / {totalIslands}
            </div>
          </div>
        )}

        {/* Tutorial */}
        {phase === "idle" && score === 0 && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded-2xl px-5 py-3 text-center pointer-events-none"
            style={{ background: "rgba(0,0,0,0.42)", backdropFilter: "blur(6px)", color: "#e8f5e9", fontFamily: "Manrope, sans-serif", maxWidth: "280px" }}>
            <p className="text-base font-semibold">Tap a lily pad to jump! 🐸</p>
            <p className="text-xs mt-1" style={{ color: "#a5d6a7" }}>
              Reach the flower 🌸 — avoid birds 🦅 and rival frogs!
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#ef9a9a" }}>
              Land on another frog and you both get eaten by a fish 🐟
            </p>
          </div>
        )}

        {/* Death overlay */}
        {phase === "dead" && dm && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-3xl px-8 py-8 text-center flex flex-col items-center gap-4"
              style={{ background: "rgba(8,28,22,0.88)", backdropFilter: "blur(12px)", color: "#e8f5e9", fontFamily: "Manrope, sans-serif", minWidth: "260px" }}>
              <div style={{ fontSize: "3rem" }}>{dm.emoji}</div>
              <h2 style={{ fontFamily: "Fraunces, serif", fontSize: "1.9rem", fontWeight: 700 }}>{dm.title}</h2>
              <p style={{ color: "#80cbc4", fontSize: "0.92rem" }}>{dm.sub}</p>
              <p style={{ color: "#ccc" }}>You crossed <strong style={{ color: "#fff" }}>{score}</strong> island{score !== 1 ? "s" : ""}</p>
              {highScore > 0 && (
                <p style={{ color: "#ffd54f", fontSize: "0.85rem" }}>Best: {highScore} 🏆</p>
              )}
              <button onClick={initGame}
                className="mt-1 rounded-2xl px-8 py-3 font-bold text-base"
                style={{ background: "#4caf50", color: "#fff", fontFamily: "Manrope, sans-serif", border: "none", cursor: "pointer", minHeight: "48px" }}>
                Try Again 🐸
              </button>
            </div>
          </div>
        )}

        {/* Win overlay */}
        {phase === "won" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-3xl px-8 py-8 text-center flex flex-col items-center gap-4"
              style={{ background: "rgba(8,28,22,0.88)", backdropFilter: "blur(12px)", color: "#e8f5e9", fontFamily: "Manrope, sans-serif", minWidth: "260px" }}>
              <div style={{ fontSize: "3rem" }}>🌸</div>
              <h2 style={{ fontFamily: "Fraunces, serif", fontSize: "1.9rem", fontWeight: 700, color: "#ffd54f" }}>You made it!</h2>
              <p style={{ color: "#80cbc4" }}>Crossed all <strong style={{ color: "#fff" }}>{totalIslands}</strong> islands!</p>
              {highScore > 0 && (
                <p style={{ color: "#ffd54f", fontSize: "0.85rem" }}>Best: {highScore} 🏆</p>
              )}
              <button onClick={initGame}
                className="mt-1 rounded-2xl px-8 py-3 font-bold text-base"
                style={{ background: "#ffd54f", color: "#1a1a1a", fontFamily: "Manrope, sans-serif", border: "none", cursor: "pointer", minHeight: "48px" }}>
                Play Again 🐸
              </button>
            </div>
          </div>
        )}
      </div>
    </GameShell>
  );
}
