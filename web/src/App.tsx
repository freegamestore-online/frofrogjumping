import { useRef, useEffect, useCallback, useState } from "react";
import { GameShell, GameTopbar } from "@freegamestore/games";
import { useGameLoop } from "./hooks/useGameLoop";
import { useHighScore } from "./hooks/useHighScore";
import { drawGlow, drawText, lerp, clamp } from "./lib/canvas";
import {
  generateIslands, makeFrog, addRipple, burstParticles, arcY,
  dist, randBetween, SINK_TIME,
} from "./lib/marshGame";
import type { Island, Frog, Ripple, Fly, Particle } from "./types";

// ── palette ────────────────────────────────────────────────────────────────
const C = {
  water1:  "#3a7d6e",
  water2:  "#2d6359",
  lily:    "#4caf50",
  lilyDk:  "#388e3c",
  lilyVn:  "#81c784",
  log:     "#8d6e4a",
  logDk:   "#5d4037",
  rock:    "#78909c",
  rockDk:  "#546e7a",
  frogBod: "#56c56e",
  frogDk:  "#3d9e52",
  frogBly: "#a5d6a7",
  frogEye: "#fffde7",
  frogPup: "#212121",
  tongue:  "#e53935",
  aim:     "#ffffff",
  fly:     "#1a1a1a",
  ripple:  "#7ecdc2",
  splash:  "#b2dfdb",
  gold:    "#ffd54f",
};

// ── water ripple pattern ───────────────────────────────────────────────────
const BG_RIPPLES = Array.from({ length: 18 }, (_, i) => ({
  x: (i * 137.5) % 1,
  y: ((i * 79.3) % 1),
  phase: Math.random() * Math.PI * 2,
  speed: 0.4 + Math.random() * 0.6,
}));

// ── drawing ────────────────────────────────────────────────────────────────
function drawWater(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  // Base
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, C.water1);
  grad.addColorStop(1, C.water2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Animated surface lines
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1.5;
  for (const r of BG_RIPPLES) {
    const x = r.x * W;
    const y = r.y * H + Math.sin(t * r.speed + r.phase) * 4;
    const len = 20 + Math.sin(t * 0.5 + r.phase) * 10;
    ctx.beginPath();
    ctx.moveTo(x - len / 2, y);
    ctx.lineTo(x + len / 2, y);
    ctx.stroke();
  }
}

function drawIsland(ctx: CanvasRenderingContext2D, isl: Island, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(isl.x, isl.y + isl.wobble);

  if (isl.type === "lily") {
    // Shadow
    ctx.beginPath();
    ctx.ellipse(2, 4, isl.r * 0.9, isl.r * 0.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fill();

    // Pad body
    ctx.beginPath();
    ctx.arc(0, 0, isl.r, 0, Math.PI * 2);
    ctx.fillStyle = C.lily;
    ctx.fill();

    // Notch
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, isl.r, -Math.PI * 0.15, Math.PI * 0.15);
    ctx.closePath();
    ctx.fillStyle = C.lilyDk;
    ctx.fill();

    // Veins
    ctx.strokeStyle = C.lilyVn;
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = alpha * 0.5;
    for (let i = 0; i < 5; i++) {
      const a = (-Math.PI * 0.7) + (i / 4) * Math.PI * 1.4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * isl.r * 0.9, Math.sin(a) * isl.r * 0.9);
      ctx.stroke();
    }
    ctx.globalAlpha = alpha;

    // Flower (on goal island)
    // drawn separately if needed

  } else if (isl.type === "log") {
    // Shadow
    ctx.beginPath();
    ctx.ellipse(3, 6, isl.r * 1.1, isl.r * 0.45, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.fill();

    // Log cylinder top
    ctx.beginPath();
    ctx.ellipse(0, 0, isl.r, isl.r * 0.42, 0, 0, Math.PI * 2);
    ctx.fillStyle = C.log;
    ctx.fill();
    ctx.strokeStyle = C.logDk;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Rings
    ctx.strokeStyle = C.logDk;
    ctx.lineWidth = 1;
    ctx.globalAlpha = alpha * 0.4;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.ellipse(0, 0, (isl.r * i) / 3.5, (isl.r * i) / 3.5 * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = alpha;

  } else {
    // Rock shadow
    ctx.beginPath();
    ctx.ellipse(4, 6, isl.r * 0.85, isl.r * 0.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fill();

    // Rock body
    ctx.beginPath();
    ctx.arc(0, 0, isl.r, 0, Math.PI * 2);
    ctx.fillStyle = C.rock;
    ctx.fill();

    // Highlight
    ctx.beginPath();
    ctx.arc(-isl.r * 0.25, -isl.r * 0.3, isl.r * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fill();

    // Dark side
    ctx.beginPath();
    ctx.arc(isl.r * 0.2, isl.r * 0.25, isl.r * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = C.rockDk;
    ctx.globalAlpha = alpha * 0.35;
    ctx.fill();
    ctx.globalAlpha = alpha;
  }

  ctx.restore();
}

function drawGoalFlower(ctx: CanvasRenderingContext2D, isl: Island, t: number) {
  ctx.save();
  ctx.translate(isl.x, isl.y + isl.wobble - isl.r * 0.3);
  const bob = Math.sin(t * 1.8) * 2;
  ctx.translate(0, bob);

  // Petals
  const pColors = ["#f48fb1", "#f06292", "#ff80ab", "#f48fb1", "#f8bbd0"];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(0, -8, 4, 7, 0, 0, Math.PI * 2);
    ctx.fillStyle = pColors[i % pColors.length] ?? "#f48fb1";
    ctx.fill();
    ctx.restore();
  }
  // Center
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fillStyle = C.gold;
  ctx.fill();

  ctx.restore();
}

function drawFrog(ctx: CanvasRenderingContext2D, frog: Frog, t: number) {
  ctx.save();
  ctx.translate(frog.x, frog.y);
  ctx.rotate(frog.angle);
  ctx.scale(frog.squishX, frog.squishY);

  const r = 16;

  // Shadow (only when on ground)
  if (frog.jumpT >= 1) {
    ctx.beginPath();
    ctx.ellipse(2, r * 0.8, r * 0.7 * frog.squishX, r * 0.25, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fill();
  }

  // Hind legs
  const legBob = Math.sin(t * 6) * (frog.jumpT < 1 ? 3 : 1);
  ctx.fillStyle = C.frogDk;
  // Left hind
  ctx.beginPath();
  ctx.ellipse(-r * 0.9, r * 0.55 + legBob, 7, 5, Math.PI * 0.35, 0, Math.PI * 2);
  ctx.fill();
  // Right hind
  ctx.beginPath();
  ctx.ellipse(r * 0.9, r * 0.55 + legBob, 7, 5, -Math.PI * 0.35, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.85, 0, 0, Math.PI * 2);
  ctx.fillStyle = C.frogBod;
  ctx.fill();

  // Belly
  ctx.beginPath();
  ctx.ellipse(0, r * 0.2, r * 0.6, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = C.frogBly;
  ctx.fill();

  // Front legs
  ctx.fillStyle = C.frogDk;
  ctx.beginPath();
  ctx.ellipse(-r * 0.75, r * 0.1, 5, 4, Math.PI * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(r * 0.75, r * 0.1, 5, 4, -Math.PI * 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  const eyeY = -r * 0.45;
  for (const ex of [-r * 0.45, r * 0.45]) {
    // Eye bulge
    ctx.beginPath();
    ctx.arc(ex, eyeY, 6, 0, Math.PI * 2);
    ctx.fillStyle = C.frogBod;
    ctx.fill();
    // White
    ctx.beginPath();
    ctx.arc(ex, eyeY, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = C.frogEye;
    ctx.fill();
    // Pupil
    ctx.beginPath();
    ctx.arc(ex + 1, eyeY + 1, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = C.frogPup;
    ctx.fill();
    // Shine
    ctx.beginPath();
    ctx.arc(ex + 0.5, eyeY - 0.5, 1, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
  }

  // Tongue
  if (frog.tongueOut) {
    const tLen = frog.tongueT * 28;
    ctx.strokeStyle = C.tongue;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.3);
    ctx.lineTo(0, -r * 0.3 - tLen);
    ctx.stroke();
    if (frog.tongueT > 0.5) {
      ctx.beginPath();
      ctx.arc(0, -r * 0.3 - tLen, 4, 0, Math.PI * 2);
      ctx.fillStyle = C.tongue;
      ctx.fill();
    }
  }

  ctx.restore();
}

function drawAimArrow(
  ctx: CanvasRenderingContext2D,
  fx: number, fy: number,
  tx: number, ty: number,
  canReach: boolean,
) {
  const dx = tx - fx, dy = ty - fy;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 10) return;

  const angle = Math.atan2(dy, dx);
  const dotCount = 8;
  const step = Math.min(d / dotCount, 28);

  ctx.save();
  for (let i = 1; i <= dotCount; i++) {
    const t = i / dotCount;
    const px = fx + Math.cos(angle) * step * i;
    const py = fy + Math.sin(angle) * step * i;
    const alpha = canReach ? (1 - t * 0.5) : (1 - t * 0.7) * 0.5;
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fillStyle = canReach
      ? `rgba(255,255,255,${alpha})`
      : `rgba(255,80,80,${alpha})`;
    ctx.fill();
  }

  // Arrowhead
  if (canReach) {
    const ax = fx + Math.cos(angle) * Math.min(d, step * dotCount);
    const ay = fy + Math.sin(angle) * Math.min(d, step * dotCount);
    ctx.translate(ax, ay);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-4, -4);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fill();
  }

  ctx.restore();
}

function drawFly(ctx: CanvasRenderingContext2D, fly: Fly, islands: Island[]) {
  const isl = islands[fly.islandIdx];
  if (!isl) return;
  ctx.save();
  ctx.translate(fly.x, fly.y + isl.wobble);

  const wingFlap = Math.sin(fly.wingT * 18) * 0.4;

  // Wings
  ctx.save();
  ctx.rotate(-wingFlap);
  ctx.beginPath();
  ctx.ellipse(-5, -3, 6, 3, -0.3, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(200,230,255,0.7)";
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.rotate(wingFlap);
  ctx.beginPath();
  ctx.ellipse(5, -3, 6, 3, 0.3, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(200,230,255,0.7)";
  ctx.fill();
  ctx.restore();

  // Body
  ctx.beginPath();
  ctx.ellipse(0, 0, 3, 4, 0, 0, Math.PI * 2);
  ctx.fillStyle = C.fly;
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
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.fillStyle = p.color.replace(")", `,${p.alpha})`).replace("rgb", "rgba");
  ctx.globalAlpha = p.alpha;
  ctx.fill();
  ctx.globalAlpha = 1;
}

// ── main component ─────────────────────────────────────────────────────────
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Game state refs (mutated in loop, no re-render)
  const islandsRef = useRef<Island[]>([]);
  const frogRef = useRef<Frog | null>(null);
  const rippleRef = useRef<Ripple[]>([]);
  const particleRef = useRef<Particle[]>([]);
  const flyRef = useRef<Fly[]>([]);
  const currentIslandRef = useRef(0);
  const sinkTimerRef = useRef(0);
  const timeRef = useRef(0);
  const aimRef = useRef<{ x: number; y: number } | null>(null);
  const phaseRef = useRef<"idle" | "aiming" | "jumping" | "dead" | "won">("idle");
  const scoreRef = useRef(0);
  const isDraggingRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // React state for UI
  const [score, setScore] = useState(0);
  const [phase, setPhase] = useState<"idle" | "aiming" | "jumping" | "dead" | "won">("idle");
  const [highScore, updateHighScore] = useHighScore("frofrogjumping_hs");
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });

  // ── audio ──────────────────────────────────────────────────────────────
  function ensureAudio() {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  }

  function playPlop(pitched = false) {
    try {
      const ctx = ensureAudio();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(pitched ? 520 : 280, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(pitched ? 800 : 140, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    } catch { /* muted */ }
  }

  function playSplash() {
    try {
      const ctx = ensureAudio();
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.06));
      }
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      src.buffer = buf;
      src.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.22, ctx.currentTime);
      src.start(ctx.currentTime);
    } catch { /* muted */ }
  }

  // ── init / resize ──────────────────────────────────────────────────────
  const initGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.width;
    const H = canvas.height;

    const islandCount = Math.min(14, Math.max(8, Math.floor((W * H) / 28000)));
    const startX = W * 0.15;
    const startY = H * 0.5 + randBetween(-H * 0.15, H * 0.15);

    const islands = generateIslands(W, H, islandCount, startX, startY);
    islandsRef.current = islands;
    currentIslandRef.current = 0;
    sinkTimerRef.current = 0;
    scoreRef.current = 0;
    rippleRef.current = [];
    particleRef.current = [];
    timeRef.current = 0;
    phaseRef.current = "idle";
    setScore(0);
    setPhase("idle");

    const start = islands[0];
    if (start) {
      frogRef.current = makeFrog(start.x, start.y);
    }

    // Spawn flies on random islands (not start or last)
    flyRef.current = [];
    for (let i = 1; i < islands.length - 1; i++) {
      if (Math.random() < 0.45) {
        const isl = islands[i]!;
        flyRef.current.push({
          x: isl.x + randBetween(-isl.r * 0.4, isl.r * 0.4),
          y: isl.y - isl.r * 0.6,
          islandIdx: i,
          wingT: Math.random() * 10,
        });
      }
    }
  }, []);

  useEffect(() => {
    const obs = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.round(width);
      canvas.height = Math.round(height);
      setCanvasSize({ w: Math.round(width), h: Math.round(height) });
      initGame();
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [initGame]);

  // ── pointer helpers ────────────────────────────────────────────────────
  function getPointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (phaseRef.current === "dead" || phaseRef.current === "won") return;
    isDraggingRef.current = true;
    const pos = getPointerPos(e);
    aimRef.current = pos;
    phaseRef.current = "aiming";
    setPhase("aiming");
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDraggingRef.current) return;
    const pos = getPointerPos(e);
    aimRef.current = pos;
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    if (phaseRef.current !== "aiming") return;

    const frog = frogRef.current;
    const aim = aimRef.current;
    if (!frog || !aim) return;

    // Jump toward aim point (inverted — frog launches away from drag)
    const dx = frog.x - aim.x;
    const dy = frog.y - aim.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 15) { phaseRef.current = "idle"; setPhase("idle"); return; }

    const maxDist = 300;
    if (d > maxDist + 40) { phaseRef.current = "idle"; setPhase("idle"); return; }

    // Find nearest island in that direction
    const nx = frog.x + (dx / d) * Math.min(d, maxDist);
    const ny = frog.y + (dy / d) * Math.min(d, maxDist);

    const islands = islandsRef.current;
    let bestIsl = -1, bestDist = 9999;
    for (let i = 0; i < islands.length; i++) {
      if (i === currentIslandRef.current) continue;
      const isl = islands[i]!;
      if (isl.sinking && isl.sinkT > 0.5) continue;
      const dd = dist(nx, ny, isl.x, isl.y);
      if (dd < isl.r + 20 && dd < bestDist) { bestDist = dd; bestIsl = i; }
    }

    if (bestIsl === -1) {
      // Missed — fall into water
      frog.fromX = frog.x; frog.fromY = frog.y;
      frog.toX = nx; frog.toY = ny;
      frog.jumpT = 0;
      frog.jumpDuration = 0.55;
      frog.angle = Math.atan2(dy, dx);
      phaseRef.current = "jumping";
      setPhase("jumping");
      // Will detect miss in loop
      (frog as Frog & { missJump: boolean }).missJump = true;
      return;
    }

    const target = islands[bestIsl]!;
    frog.fromX = frog.x; frog.fromY = frog.y;
    frog.toX = target.x; frog.toY = target.y;
    frog.jumpT = 0;
    frog.angle = Math.atan2(dy, dx);
    const jumpDist = dist(frog.fromX, frog.fromY, frog.toX, frog.toY);
    frog.jumpDuration = clamp(jumpDist / 420, 0.3, 0.75);
    frog.squishX = 0.7; frog.squishY = 1.4;
    phaseRef.current = "jumping";
    setPhase("jumping");
    (frog as Frog & { missJump: boolean }).missJump = false;
    (frog as Frog & { targetIsland: number }).targetIsland = bestIsl;

    playPlop(false);
    addRipple(rippleRef.current, frog.x, frog.y);
  }

  // ── game loop ──────────────────────────────────────────────────────────
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
    const frog = frogRef.current;
    const ripples = rippleRef.current;
    const particles = particleRef.current;
    const flies = flyRef.current;

    // ── update islands ───────────────────────────────────────────────────
    for (const isl of islands) {
      isl.wobble += isl.wobbleDir * dt * 6;
      if (Math.abs(isl.wobble) > 2.5) isl.wobbleDir *= -1;

      if (isl.sinking) {
        isl.sinkT = Math.min(isl.sinkT + dt / SINK_TIME, 1);
        if (isl.sinkT >= 0.98) {
          isl.y += dt * 40; // sink below surface
        }
      }
    }

    // ── update frog ──────────────────────────────────────────────────────
    if (frog && phaseRef.current === "jumping") {
      frog.jumpT = Math.min(frog.jumpT + dt / frog.jumpDuration, 1);
      const t01 = frog.jumpT;

      const jumpDist = dist(frog.fromX, frog.fromY, frog.toX, frog.toY);
      frog.x = lerp(frog.fromX, frog.toX, t01);
      frog.y = arcY(frog.fromY, frog.toY, jumpDist, t01);

      // Squash & stretch
      if (t01 < 0.5) {
        frog.squishX = lerp(0.7, 1.3, t01 * 2);
        frog.squishY = lerp(1.4, 0.7, t01 * 2);
      } else {
        frog.squishX = lerp(1.3, 1.0, (t01 - 0.5) * 2);
        frog.squishY = lerp(0.7, 1.0, (t01 - 0.5) * 2);
      }

      if (frog.jumpT >= 1) {
        const isMiss = (frog as Frog & { missJump?: boolean }).missJump;

        if (isMiss) {
          // Fell in water
          playSplash();
          burstParticles(particles, frog.x, frog.y, "rgb(126,205,194)", 12);
          addRipple(ripples, frog.x, frog.y);
          addRipple(ripples, frog.x + 8, frog.y + 5);
          phaseRef.current = "dead";
          setPhase("dead");
          updateHighScore(scoreRef.current);
        } else {
          // Landed on island
          const targetIdx = (frog as Frog & { targetIsland?: number }).targetIsland ?? 0;
          const prevIdx = currentIslandRef.current;
          const prevIsl = islands[prevIdx];

          // Start sinking previous island
          if (prevIsl && !prevIsl.sinking && prevIdx !== 0) {
            prevIsl.sinking = true;
            prevIsl.sinkT = 0;
          }

          currentIslandRef.current = targetIdx;
          sinkTimerRef.current = 0;

          const newIsl = islands[targetIdx];
          if (newIsl) {
            frog.x = newIsl.x;
            frog.y = newIsl.y;
          }
          frog.squishX = 1.3;
          frog.squishY = 0.7;
          frog.jumpT = 1;

          // Score
          const newScore = scoreRef.current + 1;
          scoreRef.current = newScore;
          setScore(newScore);

          // Eat fly?
          for (let fi = flies.length - 1; fi >= 0; fi--) {
            const fly = flies[fi]!;
            if (fly.islandIdx === targetIdx) {
              flies.splice(fi, 1);
              frog.tongueOut = true;
              frog.tongueT = 0;
              playPlop(true);
            }
          }

          playPlop(false);
          addRipple(ripples, frog.x, frog.y);
          burstParticles(particles, frog.x, frog.y + 10, "rgb(76,175,80)", 6);

          // Check win — reached last island
          if (targetIdx === islands.length - 1) {
            phaseRef.current = "won";
            setPhase("won");
            updateHighScore(newScore);
            burstParticles(particles, frog.x, frog.y, "rgb(255,213,79)", 20);
          } else {
            phaseRef.current = "idle";
            setPhase("idle");
          }
        }
      }
    }

    // Squish recovery
    if (frog && phaseRef.current === "idle") {
      frog.squishX = lerp(frog.squishX, 1, dt * 8);
      frog.squishY = lerp(frog.squishY, 1, dt * 8);
    }

    // Tongue animation
    if (frog && frog.tongueOut) {
      frog.tongueT = Math.min(frog.tongueT + dt * 4, 1);
      if (frog.tongueT >= 1) frog.tongueOut = false;
    }

    // ── update ripples ───────────────────────────────────────────────────
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rip = ripples[i]!;
      rip.r += dt * 38;
      rip.alpha -= dt * 1.4;
      if (rip.alpha <= 0) ripples.splice(i, 1);
    }

    // ── update particles ─────────────────────────────────────────────────
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]!;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 180 * dt; // gravity
      p.alpha -= dt * 2.2;
      if (p.alpha <= 0) particles.splice(i, 1);
    }

    // ── update flies ─────────────────────────────────────────────────────
    for (const fly of flies) {
      fly.wingT += dt;
      const isl = islands[fly.islandIdx];
      if (isl) {
        fly.x = isl.x + Math.sin(t * 1.2 + fly.wingT) * isl.r * 0.3;
      }
    }

    // ── DRAW ─────────────────────────────────────────────────────────────
    ctx.clearRect(0, 0, W, H);
    drawWater(ctx, W, H, t);

    // Ripples
    for (const rip of ripples) drawRipple(ctx, rip);

    // Islands (back to front, sorted by y)
    const sortedIslands = [...islands].map((isl, i) => ({ isl, i }))
      .sort((a, b) => a.isl.y - b.isl.y);

    for (const { isl, i } of sortedIslands) {
      const alpha = isl.sinking ? clamp(1 - isl.sinkT * 1.4, 0, 1) : 1;
      if (alpha <= 0) continue;
      drawIsland(ctx, isl, alpha);

      // Goal flower on last island
      if (i === islands.length - 1 && phaseRef.current !== "won") {
        drawGoalFlower(ctx, isl, t);
      }

      // Highlight current island
      if (i === currentIslandRef.current && phaseRef.current === "idle") {
        ctx.save();
        ctx.globalAlpha = 0.25 + Math.sin(t * 3) * 0.1;
        drawGlow(ctx, isl.x, isl.y + isl.wobble, isl.r + 18, "#a5d6a7");
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    }

    // Flies
    for (const fly of flies) drawFly(ctx, fly, islands);

    // Particles
    for (const p of particles) drawParticle(ctx, p);

    // Frog
    if (frog) drawFrog(ctx, frog, t);

    // Aim line
    if (phaseRef.current === "aiming" && aimRef.current && frog) {
      const aim = aimRef.current;
      const dx = frog.x - aim.x;
      const dy = frog.y - aim.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const canReach = d <= 300;
      drawAimArrow(ctx, frog.x, frog.y, frog.x + dx, frog.y + dy, canReach);
    }

    // Island number labels (debug off)
    // for (let i=0;i<islands.length;i++) { drawText(ctx, String(i), islands[i].x, islands[i].y, {color:'#fff',font:'12px Manrope'}); }

  }, [updateHighScore]), paused);

  // ── restart ────────────────────────────────────────────────────────────
  function restart() {
    initGame();
  }

  const lastIsland = islandsRef.current[islandsRef.current.length - 1];
  const totalIslands = Math.max(0, islandsRef.current.length - 1);

  return (
    <GameShell topbar={
      <GameTopbar
        title="Frog Marsh"
        score={score}
        highScore={highScore}
      />
    }>
      <div ref={containerRef} className="relative w-full h-full overflow-hidden select-none">
        {/* Canvas */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full touch-none"
          style={{ cursor: phase === "idle" ? "crosshair" : "default" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />

        {/* HUD — progress */}
        {(phase === "idle" || phase === "aiming" || phase === "jumping") && canvasSize.w > 0 && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 pointer-events-none">
            <div
              className="rounded-full px-3 py-1 text-sm font-semibold"
              style={{
                background: "rgba(0,0,0,0.35)",
                color: "#e8f5e9",
                fontFamily: "Manrope, sans-serif",
                backdropFilter: "blur(4px)",
              }}
            >
              🐸 {score} / {totalIslands}
            </div>
          </div>
        )}

        {/* Instruction overlay */}
        {phase === "idle" && score === 0 && canvasSize.w > 0 && (
          <div
            className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded-2xl px-5 py-3 text-center pointer-events-none"
            style={{
              background: "rgba(0,0,0,0.4)",
              backdropFilter: "blur(6px)",
              color: "#e8f5e9",
              fontFamily: "Manrope, sans-serif",
              maxWidth: "260px",
            }}
          >
            <p className="text-base font-semibold">Drag &amp; release to jump!</p>
            <p className="text-xs mt-1" style={{ color: "#a5d6a7" }}>
              Reach the flower 🌸 — don't fall in!
            </p>
          </div>
        )}

        {/* Dead overlay */}
        {phase === "dead" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="rounded-3xl px-8 py-8 text-center flex flex-col items-center gap-4"
              style={{
                background: "rgba(10,30,25,0.82)",
                backdropFilter: "blur(10px)",
                color: "#e8f5e9",
                fontFamily: "Manrope, sans-serif",
                minWidth: "240px",
              }}
            >
              <div style={{ fontSize: "3rem" }}>💦</div>
              <h2 style={{ fontFamily: "Fraunces, serif", fontSize: "1.8rem", fontWeight: 700 }}>
                Splashed!
              </h2>
              <p style={{ color: "#80cbc4" }}>
                You hopped <strong style={{ color: "#fff" }}>{score}</strong> island{score !== 1 ? "s" : ""}
              </p>
              {highScore > 0 && (
                <p style={{ color: "#ffd54f", fontSize: "0.85rem" }}>
                  Best: {highScore} 🏆
                </p>
              )}
              <button
                onClick={restart}
                className="mt-2 rounded-2xl px-8 py-3 font-bold text-base"
                style={{
                  background: "#4caf50",
                  color: "#fff",
                  fontFamily: "Manrope, sans-serif",
                  border: "none",
                  cursor: "pointer",
                  minWidth: "44px",
                  minHeight: "44px",
                }}
              >
                Try Again 🐸
              </button>
            </div>
          </div>
        )}

        {/* Win overlay */}
        {phase === "won" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="rounded-3xl px-8 py-8 text-center flex flex-col items-center gap-4"
              style={{
                background: "rgba(10,30,25,0.85)",
                backdropFilter: "blur(10px)",
                color: "#e8f5e9",
                fontFamily: "Manrope, sans-serif",
                minWidth: "240px",
              }}
            >
              <div style={{ fontSize: "3rem" }}>🌸</div>
              <h2 style={{ fontFamily: "Fraunces, serif", fontSize: "1.8rem", fontWeight: 700, color: "#ffd54f" }}>
                You made it!
              </h2>
              <p style={{ color: "#80cbc4" }}>
                Crossed <strong style={{ color: "#fff" }}>{totalIslands}</strong> islands!
              </p>
              {highScore > 0 && (
                <p style={{ color: "#ffd54f", fontSize: "0.85rem" }}>
                  Best: {highScore} 🏆
                </p>
              )}
              <button
                onClick={restart}
                className="mt-2 rounded-2xl px-8 py-3 font-bold text-base"
                style={{
                  background: "#ffd54f",
                  color: "#1a1a1a",
                  fontFamily: "Manrope, sans-serif",
                  border: "none",
                  cursor: "pointer",
                  minWidth: "44px",
                  minHeight: "44px",
                }}
              >
                Play Again 🐸
              </button>
            </div>
          </div>
        )}
      </div>
    </GameShell>
  );
}
