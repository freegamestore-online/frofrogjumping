import { useRef, useEffect, useState, useCallback } from "react";
import { GameShell, GameTopbar } from "@freegamestore/games";
import { useGameLoop } from "./hooks/useGameLoop";
import { useHighScore } from "./hooks/useHighScore";
import { lerp, clamp, dist, randomInRange } from "./lib/canvas";

const GAME_TITLE = "Frog Marsh";
const HIGH_SCORE_KEY = "frofrogjumping_highscore";

// ── types ────────────────────────────────────────────────────────────────────
interface Island {
  x: number;
  y: number;
  r: number;
  isGoal: boolean;
}

interface GameState {
  islands: Island[];
  frogX: number;
  frogY: number;
  frogFromX: number;
  frogFromY: number;
  frogToX: number;
  frogToY: number;
  jumping: boolean;
  jumpT: number;          // 0..1
  onIslandIdx: number;    // which island frog is on
  score: number;
  level: number;
  over: boolean;
  canvasW: number;
  canvasH: number;
  // click/tap target
  clickX: number;
  clickY: number;
  clicked: boolean;
}

// ── level config ─────────────────────────────────────────────────────────────
const LEVEL_CONF = [
  { count: 5,  minD: 110, maxD: 160 },
  { count: 7,  minD: 120, maxD: 175 },
  { count: 9,  minD: 130, maxD: 190 },
  { count: 11, minD: 140, maxD: 210 },
  { count: 13, minD: 140, maxD: 220 },
];

function conf(lvl: number) {
  return LEVEL_CONF[Math.min(lvl, LEVEL_CONF.length - 1)]!;
}

// ── island generation ─────────────────────────────────────────────────────────
function makeIslands(lvl: number, W: number, H: number): Island[] {
  const { count, minD, maxD } = conf(lvl);
  const islands: Island[] = [];
  const margin = 60;

  islands.push({ x: W / 2, y: H / 2, r: 44, isGoal: false });

  let attempts = 0;
  while (islands.length < count && attempts < count * 80) {
    attempts++;
    const prev = islands[islands.length - 1]!;
    const angle = randomInRange(-Math.PI * 0.65, Math.PI * 0.65);
    const d = randomInRange(minD, maxD);
    const nx = prev.x + Math.cos(angle) * d;
    const ny = prev.y + Math.sin(angle) * d;
    if (nx < margin || nx > W - margin || ny < margin || ny > H - margin) continue;
    let ok = true;
    for (const isl of islands) {
      if (dist(isl.x, isl.y, nx, ny) < isl.r + 38) { ok = false; break; }
    }
    if (!ok) continue;
    islands.push({ x: nx, y: ny, r: randomInRange(32, 46), isGoal: false });
  }

  const last = islands[islands.length - 1];
  if (last) last.isGoal = true;
  return islands;
}

// ── initial state ─────────────────────────────────────────────────────────────
function initState(lvl: number, W: number, H: number, score: number): GameState {
  const islands = makeIslands(lvl, W, H);
  const start = islands[0]!;
  return {
    islands,
    frogX: start.x, frogY: start.y,
    frogFromX: start.x, frogFromY: start.y,
    frogToX: start.x, frogToY: start.y,
    jumping: false, jumpT: 0,
    onIslandIdx: 0,
    score, level: lvl,
    over: false,
    canvasW: W, canvasH: H,
    clickX: 0, clickY: 0, clicked: false,
  };
}

// ── palette ───────────────────────────────────────────────────────────────────
const PAD_COLORS  = ["#4caf50", "#388e3c", "#66bb6a"];
const GOAL_COLOR  = "#ffd54f";
const GOAL_RING   = "#ff8f00";
const WATER1      = "#2e7d6b";
const WATER2      = "#1b5e50";
const FROG_BODY   = "#6cc24a";
const FROG_DARK   = "#3d7a30";
const FROG_BELLY  = "#b0e57c";
const FROG_EYE    = "#fff";
const FROG_PUPIL  = "#111";
const RIPPLE_CLR  = "rgba(255,255,255,0.18)";
const RANGE_CLR   = "rgba(255,255,255,0.12)";

// ── BG shimmer lines ──────────────────────────────────────────────────────────
const SHIMMER = Array.from({ length: 22 }, (_, i) => ({
  xFrac: ((i * 137.5) % 100) / 100,
  yFrac: ((i * 79.3)  % 100) / 100,
  phase: Math.random() * Math.PI * 2,
  speed: 0.4 + Math.random() * 0.5,
}));

// ── draw helpers ──────────────────────────────────────────────────────────────
function drawWater(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, WATER1);
  g.addColorStop(1, WATER2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = RIPPLE_CLR;
  ctx.lineWidth = 1.5;
  for (const s of SHIMMER) {
    const x = s.xFrac * W;
    const y = s.yFrac * H + Math.sin(t * s.speed + s.phase) * 5;
    const len = 18 + Math.sin(t * 0.4 + s.phase) * 8;
    ctx.beginPath();
    ctx.moveTo(x - len / 2, y);
    ctx.lineTo(x + len / 2, y);
    ctx.stroke();
  }
}

function drawIsland(ctx: CanvasRenderingContext2D, isl: Island, idx: number, t: number) {
  const wobble = Math.sin(t * 1.2 + idx * 1.7) * 1.8;
  const r = isl.r + wobble;

  if (isl.isGoal) {
    // pulsing gold ring
    const pulse = 1 + 0.08 * Math.sin(t * 3);
    ctx.beginPath();
    ctx.arc(isl.x, isl.y, r * pulse + 8, 0, Math.PI * 2);
    ctx.strokeStyle = GOAL_RING;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // shadow
  ctx.beginPath();
  ctx.ellipse(isl.x + 3, isl.y + 5, r * 0.9, r * 0.35, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fill();

  // pad
  ctx.beginPath();
  ctx.arc(isl.x, isl.y, r, 0, Math.PI * 2);
  ctx.fillStyle = isl.isGoal ? GOAL_COLOR : (PAD_COLORS[idx % PAD_COLORS.length] ?? PAD_COLORS[0]!);
  ctx.fill();

  // highlight
  ctx.beginPath();
  ctx.arc(isl.x - r * 0.25, isl.y - r * 0.25, r * 0.38, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fill();

  // veins on lily pads
  if (!isl.isGoal) {
    ctx.strokeStyle = "rgba(0,80,0,0.2)";
    ctx.lineWidth = 1;
    for (let v = 0; v < 5; v++) {
      const a = (v / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(isl.x, isl.y);
      ctx.lineTo(isl.x + Math.cos(a) * r, isl.y + Math.sin(a) * r);
      ctx.stroke();
    }
  }
}

function drawFrog(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, squishX: number, squishY: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(squishX, squishY);

  // shadow
  ctx.beginPath();
  ctx.ellipse(2, 10, 14, 5, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.fill();

  // body
  ctx.beginPath();
  ctx.ellipse(0, 0, 16, 14, 0, 0, Math.PI * 2);
  ctx.fillStyle = FROG_BODY;
  ctx.fill();

  // belly
  ctx.beginPath();
  ctx.ellipse(0, 3, 10, 8, 0, 0, Math.PI * 2);
  ctx.fillStyle = FROG_BELLY;
  ctx.fill();

  // back legs
  ctx.fillStyle = FROG_DARK;
  ctx.beginPath(); ctx.ellipse(-12, 10, 7, 4, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse( 12, 10, 7, 4,  0.5, 0, Math.PI * 2); ctx.fill();

  // front legs
  ctx.beginPath(); ctx.ellipse(-10, -4, 5, 3, -0.8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse( 10, -4, 5, 3,  0.8, 0, Math.PI * 2); ctx.fill();

  // eyes
  const eyeY = -9;
  for (const ex of [-7, 7]) {
    ctx.beginPath();
    ctx.arc(ex, eyeY, 5, 0, Math.PI * 2);
    ctx.fillStyle = FROG_EYE;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + 1, eyeY, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = FROG_PUPIL;
    ctx.fill();
  }

  ctx.restore();
}

function drawJumpRange(ctx: CanvasRenderingContext2D, x: number, y: number, maxDist: number) {
  ctx.beginPath();
  ctx.arc(x, y, maxDist, 0, Math.PI * 2);
  ctx.strokeStyle = RANGE_CLR;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawHUD(ctx: CanvasRenderingContext2D, W: number, score: number, level: number) {
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.roundRect(W / 2 - 90, 10, 180, 38, 12);
  ctx.fill();

  ctx.font = "bold 15px Manrope, sans-serif";
  ctx.fillStyle = "#ffd54f";
  ctx.textAlign = "center";
  ctx.fillText(`LVL ${level + 1}   ·   ${score} pts`, W / 2, 34);
}

function drawGameOver(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.fillStyle = "rgba(0,0,0,0.52)";
  ctx.fillRect(0, 0, W, H);
  ctx.font = "bold 42px Fraunces, serif";
  ctx.fillStyle = "#ffd54f";
  ctx.textAlign = "center";
  ctx.fillText("Game Over", W / 2, H / 2 - 20);
  ctx.font = "20px Manrope, sans-serif";
  ctx.fillStyle = "#fff";
  ctx.fillText("Tap to play again", W / 2, H / 2 + 22);
}

// ── jump arc ──────────────────────────────────────────────────────────────────
function arcY(fromY: number, toY: number, d: number, t: number): number {
  const base = fromY + (toY - fromY) * t;
  const peak = Math.min(d * 0.5, 140);
  return base - peak * Math.sin(Math.PI * t);
}

const MAX_JUMP = 320;
const JUMP_SPEED = 2.0; // t units per second

// ── main component ────────────────────────────────────────────────────────────
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gsRef = useRef<GameState | null>(null);
  const tRef = useRef(0);
  const [scoreDisplay, setScoreDisplay] = useState(0);
  const [highScore, updateHighScore] = useHighScore(HIGH_SCORE_KEY);
  const highScoreRef = useRef(highScore);
  highScoreRef.current = highScore;

  // canvas size (responsive)
  const sizeRef = useRef({ W: 400, H: 600 });

  const initGame = useCallback((lvl: number, score: number) => {
    const { W, H } = sizeRef.current;
    gsRef.current = initState(lvl, W, H, score);
  }, []);

  // resize canvas to fill container
  useEffect(() => {
    function resize() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const parent = canvas.parentElement;
      if (!parent) return;
      const W = parent.clientWidth;
      const H = parent.clientHeight;
      canvas.width = W;
      canvas.height = H;
      sizeRef.current = { W, H };
      // re-init preserving score/level
      const gs = gsRef.current;
      gsRef.current = initState(gs?.level ?? 0, W, H, gs?.score ?? 0);
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // start on mount
  useEffect(() => {
    initGame(0, 0);
  }, [initGame]);

  // tap / click handler
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function handlePointer(clientX: number, clientY: number) {
      const gs = gsRef.current;
      if (!gs) return;
      const rect = canvas!.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      if (gs.over) {
        // restart
        const { W, H } = sizeRef.current;
        gsRef.current = initState(0, W, H, 0);
        setScoreDisplay(0);
        return;
      }
      gs.clickX = x;
      gs.clickY = y;
      gs.clicked = true;
    }

    function onMouseDown(e: MouseEvent) { handlePointer(e.clientX, e.clientY); }
    function onTouchStart(e: TouchEvent) {
      const t = e.touches[0];
      if (t) handlePointer(t.clientX, t.clientY);
    }

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    return () => {
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("touchstart", onTouchStart);
    };
  }, []);

  // game loop
  useGameLoop((dt) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const gs = gsRef.current;
    if (!ctx || !gs) return;

    const { W, H } = sizeRef.current;
    tRef.current += dt;
    const t = tRef.current;

    // ── update ────────────────────────────────────────────────────────────────
    if (!gs.over) {
      if (!gs.jumping) {
        // handle tap → jump to nearest reachable island that isn't current
        if (gs.clicked) {
          gs.clicked = false;
          let bestIdx = -1;
          let bestDist = Infinity;
          for (let i = 0; i < gs.islands.length; i++) {
            if (i === gs.onIslandIdx) continue;
            const isl = gs.islands[i]!;
            const d = dist(gs.clickX, gs.clickY, isl.x, isl.y);
            const fromD = dist(gs.frogX, gs.frogY, isl.x, isl.y);
            if (d < isl.r + 24 && fromD <= MAX_JUMP && fromD < bestDist) {
              bestDist = fromD;
              bestIdx = i;
            }
          }
          if (bestIdx >= 0) {
            const target = gs.islands[bestIdx]!;
            gs.frogFromX = gs.frogX;
            gs.frogFromY = gs.frogY;
            gs.frogToX = target.x;
            gs.frogToY = target.y;
            gs.jumping = true;
            gs.jumpT = 0;
            gs.onIslandIdx = bestIdx;
          }
        }
      } else {
        // advance jump
        gs.jumpT = clamp(gs.jumpT + dt * JUMP_SPEED, 0, 1);
        const d = dist(gs.frogFromX, gs.frogFromY, gs.frogToX, gs.frogToY);
        gs.frogX = lerp(gs.frogFromX, gs.frogToX, gs.jumpT);
        gs.frogY = arcY(gs.frogFromY, gs.frogToY, d, gs.jumpT);

        if (gs.jumpT >= 1) {
          gs.frogX = gs.frogToX;
          gs.frogY = gs.frogToY;
          gs.jumping = false;

          const landed = gs.islands[gs.onIslandIdx];
          if (landed?.isGoal) {
            // next level — seamless, no dialog
            const newScore = gs.score + 100 + gs.level * 50;
            updateHighScore(newScore);
            const { W: nW, H: nH } = sizeRef.current;
            gsRef.current = initState(gs.level + 1, nW, nH, newScore);
            setScoreDisplay(newScore);
          } else {
            gs.score += 10;
            setScoreDisplay(gs.score);
          }
        }
      }
    }

    // ── draw ──────────────────────────────────────────────────────────────────
    drawWater(ctx, W, H, t);

    // islands
    for (let i = 0; i < gs.islands.length; i++) {
      drawIsland(ctx, gs.islands[i]!, i, t);
    }

    // jump range ring (only when idle)
    if (!gs.jumping && !gs.over) {
      drawJumpRange(ctx, gs.frogX, gs.frogY, MAX_JUMP);
    }

    // frog squish/stretch
    let squishX = 1, squishY = 1;
    let angle = 0;
    if (gs.jumping) {
      const mid = Math.sin(Math.PI * gs.jumpT);
      squishX = 1 - mid * 0.25;
      squishY = 1 + mid * 0.35;
      angle = Math.atan2(gs.frogToY - gs.frogFromY, gs.frogToX - gs.frogFromX) + Math.PI / 2;
    }
    drawFrog(ctx, gs.frogX, gs.frogY, angle, squishX, squishY);

    drawHUD(ctx, W, gs.score, gs.level);

    if (gs.over) drawGameOver(ctx, W, H);
  });

  return (
    <GameShell topbar={<GameTopbar title={GAME_TITLE} score={scoreDisplay} highScore={highScore} />}>
      <div className="w-full h-full relative">
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          style={{ touchAction: "none" }}
        />
      </div>
    </GameShell>
  );
}
