import { useRef, useEffect, useState } from "react";
import { GameShell, GameTopbar } from "@freegamestore/games";
import { useGameLoop } from "./hooks/useGameLoop";
import { useHighScore } from "./hooks/useHighScore";
import { lerp, clamp, dist, randomInRange } from "./lib/canvas";

const GAME_TITLE = "Frog Marsh";
const HS_KEY = "frofrogjumping_hs";

// ── types ─────────────────────────────────────────────────────────────────────
interface Island { x: number; y: number; r: number; isGoal: boolean; }

interface GS {
  islands: Island[];
  fx: number; fy: number;          // frog current pos
  fromX: number; fromY: number;    // jump start
  toX: number;   toY: number;      // jump end
  jumping: boolean;
  jumpT: number;
  onIdx: number;                   // island frog is sitting on
  score: number;
  level: number;
  over: boolean;
  W: number; H: number;
  pendingX: number; pendingY: number; pending: boolean;
}

// ── level config ──────────────────────────────────────────────────────────────
const CONFS = [
  { n: 5,  min: 110, max: 160 },
  { n: 7,  min: 115, max: 175 },
  { n: 9,  min: 120, max: 190 },
  { n: 11, min: 125, max: 205 },
  { n: 13, min: 130, max: 215 },
];
function getConf(lvl: number) { return CONFS[Math.min(lvl, CONFS.length - 1)]!; }

// ── island generation ─────────────────────────────────────────────────────────
function makeIslands(lvl: number, W: number, H: number): Island[] {
  const { n, min, max } = getConf(lvl);
  const list: Island[] = [];
  const margin = 64;
  list.push({ x: W / 2, y: H / 2, r: 44, isGoal: false });
  let tries = 0;
  while (list.length < n && tries < n * 100) {
    tries++;
    const prev = list[list.length - 1]!;
    const angle = randomInRange(-Math.PI * 0.65, Math.PI * 0.65);
    const d = randomInRange(min, max);
    const nx = prev.x + Math.cos(angle) * d;
    const ny = prev.y + Math.sin(angle) * d;
    if (nx < margin || nx > W - margin || ny < margin || ny > H - margin) continue;
    let ok = true;
    for (const isl of list) {
      if (dist(isl.x, isl.y, nx, ny) < isl.r + 36) { ok = false; break; }
    }
    if (!ok) continue;
    list.push({ x: nx, y: ny, r: randomInRange(32, 46), isGoal: false });
  }
  const last = list[list.length - 1];
  if (last) last.isGoal = true;
  return list;
}

function makeGS(lvl: number, score: number, W: number, H: number): GS {
  const islands = makeIslands(lvl, W, H);
  const s = islands[0]!;
  return {
    islands, fx: s.x, fy: s.y,
    fromX: s.x, fromY: s.y, toX: s.x, toY: s.y,
    jumping: false, jumpT: 0, onIdx: 0,
    score, level: lvl, over: false,
    W, H, pendingX: 0, pendingY: 0, pending: false,
  };
}

// ── constants ─────────────────────────────────────────────────────────────────
const MAX_JUMP  = 310;
const JUMP_SPD  = 2.1;

// ── palette ───────────────────────────────────────────────────────────────────
const W1 = "#2e7d6b", W2 = "#1b5e50";
const PAD = ["#4caf50", "#388e3c", "#66bb6a"];
const GOAL_F = "#ffd54f", GOAL_R = "#ff8f00";
const FB = "#6cc24a", FD = "#3d7a30", FBL = "#b0e57c";

// ── BG shimmer ────────────────────────────────────────────────────────────────
const SHIMMER = Array.from({ length: 22 }, (_, i) => ({
  xf: ((i * 137.5) % 100) / 100,
  yf: ((i * 79.3)  % 100) / 100,
  ph: Math.random() * Math.PI * 2,
  sp: 0.4 + Math.random() * 0.5,
}));

// ── draw fns ──────────────────────────────────────────────────────────────────
function drawWater(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, W1); g.addColorStop(1, W2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1.5;
  for (const s of SHIMMER) {
    const x = s.xf * W;
    const y = s.yf * H + Math.sin(t * s.sp + s.ph) * 5;
    const len = 18 + Math.sin(t * 0.4 + s.ph) * 8;
    ctx.beginPath(); ctx.moveTo(x - len/2, y); ctx.lineTo(x + len/2, y); ctx.stroke();
  }
}

function drawIsland(ctx: CanvasRenderingContext2D, isl: Island, idx: number, t: number) {
  const wobble = Math.sin(t * 1.2 + idx * 1.7) * 1.5;
  const r = isl.r + wobble;

  if (isl.isGoal) {
    const pulse = 1 + 0.09 * Math.sin(t * 3);
    ctx.beginPath(); ctx.arc(isl.x, isl.y, r * pulse + 9, 0, Math.PI * 2);
    ctx.strokeStyle = GOAL_R; ctx.lineWidth = 3; ctx.stroke();
  }

  // shadow
  ctx.beginPath(); ctx.ellipse(isl.x + 3, isl.y + 6, r * 0.9, r * 0.32, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fill();

  // pad
  ctx.beginPath(); ctx.arc(isl.x, isl.y, r, 0, Math.PI * 2);
  ctx.fillStyle = isl.isGoal ? GOAL_F : (PAD[idx % PAD.length] ?? PAD[0]!);
  ctx.fill();

  // highlight
  ctx.beginPath(); ctx.arc(isl.x - r * 0.25, isl.y - r * 0.28, r * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.13)"; ctx.fill();

  // veins
  if (!isl.isGoal) {
    ctx.strokeStyle = "rgba(0,60,0,0.18)"; ctx.lineWidth = 1;
    for (let v = 0; v < 5; v++) {
      const a = (v / 5) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(isl.x, isl.y);
      ctx.lineTo(isl.x + Math.cos(a) * r, isl.y + Math.sin(a) * r); ctx.stroke();
    }
  }
}

function drawFrog(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, sx: number, sy: number) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(angle); ctx.scale(sx, sy);

  // shadow
  ctx.beginPath(); ctx.ellipse(2, 11, 14, 5, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fill();

  // back legs
  ctx.fillStyle = FD;
  ctx.beginPath(); ctx.ellipse(-13, 10, 7, 4, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse( 13, 10, 7, 4,  0.5, 0, Math.PI * 2); ctx.fill();

  // body
  ctx.beginPath(); ctx.ellipse(0, 0, 16, 14, 0, 0, Math.PI * 2);
  ctx.fillStyle = FB; ctx.fill();

  // belly
  ctx.beginPath(); ctx.ellipse(0, 3, 10, 8, 0, 0, Math.PI * 2);
  ctx.fillStyle = FBL; ctx.fill();

  // front legs
  ctx.fillStyle = FD;
  ctx.beginPath(); ctx.ellipse(-11, -4, 5, 3, -0.8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse( 11, -4, 5, 3,  0.8, 0, Math.PI * 2); ctx.fill();

  // eyes
  for (const ex of [-7, 7]) {
    ctx.beginPath(); ctx.arc(ex, -9, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = "#fff"; ctx.fill();
    ctx.beginPath(); ctx.arc(ex + 1, -9, 2.8, 0, Math.PI * 2);
    ctx.fillStyle = "#111"; ctx.fill();
  }

  ctx.restore();
}

function drawRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.13)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 7]); ctx.stroke(); ctx.setLineDash([]);
}

function drawHUD(ctx: CanvasRenderingContext2D, W: number, score: number, level: number) {
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath(); ctx.roundRect(W / 2 - 95, 10, 190, 38, 12); ctx.fill();
  ctx.font = "bold 15px Manrope, sans-serif";
  ctx.fillStyle = "#ffd54f"; ctx.textAlign = "center";
  ctx.fillText(`LVL ${level + 1}   ·   ${score} pts`, W / 2, 34);
}

function drawOver(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.font = "bold 44px Fraunces, serif"; ctx.fillStyle = "#ffd54f";
  ctx.fillText("Game Over", W / 2, H / 2 - 18);
  ctx.font = "20px Manrope, sans-serif"; ctx.fillStyle = "#fff";
  ctx.fillText("Tap to play again", W / 2, H / 2 + 24);
}

function arcY(fy: number, ty: number, d: number, t: number): number {
  return fy + (ty - fy) * t - Math.min(d * 0.48, 130) * Math.sin(Math.PI * t);
}

// ── component ─────────────────────────────────────────────────────────────────
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gsRef     = useRef<GS | null>(null);
  const tRef      = useRef(0);
  const [scoreDsp, setScoreDsp] = useState(0);
  const [highScore, updateHS]   = useHighScore(HS_KEY);

  // ── resize + init ──────────────────────────────────────────────────────────
  useEffect(() => {
    function resize() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const par = canvas.parentElement;
      if (!par) return;
      const W = Math.max(par.clientWidth,  320);
      const H = Math.max(par.clientHeight, 400);
      canvas.width  = W;
      canvas.height = H;
      const gs = gsRef.current;
      gsRef.current = makeGS(gs?.level ?? 0, gs?.score ?? 0, W, H);
    }
    // small delay so parent has laid out
    const id = setTimeout(resize, 30);
    window.addEventListener("resize", resize);
    return () => { clearTimeout(id); window.removeEventListener("resize", resize); };
  }, []);

  // ── pointer handler ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    function handle(cx: number, cy: number) {
      const gs = gsRef.current;
      if (!gs) return;
      const rect = canvas!.getBoundingClientRect();
      const x = (cx - rect.left) * (canvas!.width  / rect.width);
      const y = (cy - rect.top)  * (canvas!.height / rect.height);
      if (gs.over) {
        gsRef.current = makeGS(0, 0, gs.W, gs.H);
        setScoreDsp(0);
        return;
      }
      gs.pendingX = x; gs.pendingY = y; gs.pending = true;
    }
    function onMD(e: MouseEvent)  { handle(e.clientX, e.clientY); }
    function onTS(e: TouchEvent)  { const t = e.touches[0]; if (t) handle(t.clientX, t.clientY); }
    canvas.addEventListener("mousedown",  onMD);
    canvas.addEventListener("touchstart", onTS, { passive: true });
    return () => {
      canvas.removeEventListener("mousedown",  onMD);
      canvas.removeEventListener("touchstart", onTS);
    };
  }, []);

  // ── game loop ──────────────────────────────────────────────────────────────
  useGameLoop((dt) => {
    const canvas = canvasRef.current;
    const ctx    = canvas?.getContext("2d");
    const gs     = gsRef.current;
    if (!ctx || !gs) return;

    const { W, H } = gs;
    tRef.current += dt;
    const t = tRef.current;

    // ── update ────────────────────────────────────────────────────────────────
    if (!gs.over) {
      if (!gs.jumping && gs.pending) {
        gs.pending = false;
        const px = gs.pendingX, py = gs.pendingY;
        // find the island the player tapped (closest whose circle contains the tap)
        let bestIdx = -1, bestD = Infinity;
        for (let i = 0; i < gs.islands.length; i++) {
          if (i === gs.onIdx) continue;
          const isl = gs.islands[i]!;
          const tapD  = dist(px, py, isl.x, isl.y);
          const fromD = dist(gs.fx, gs.fy, isl.x, isl.y);
          if (tapD < isl.r + 28 && fromD <= MAX_JUMP && tapD < bestD) {
            bestD = tapD; bestIdx = i;
          }
        }
        if (bestIdx >= 0) {
          const tgt = gs.islands[bestIdx]!;
          gs.fromX = gs.fx; gs.fromY = gs.fy;
          gs.toX = tgt.x;   gs.toY = tgt.y;
          gs.jumping = true; gs.jumpT = 0;
          gs.onIdx = bestIdx;
        }
      }

      if (gs.jumping) {
        gs.jumpT = clamp(gs.jumpT + dt * JUMP_SPD, 0, 1);
        const d = dist(gs.fromX, gs.fromY, gs.toX, gs.toY);
        gs.fx = lerp(gs.fromX, gs.toX, gs.jumpT);
        gs.fy = arcY(gs.fromY, gs.toY, d, gs.jumpT);

        if (gs.jumpT >= 1) {
          gs.fx = gs.toX; gs.fy = gs.toY;
          gs.jumping = false;
          const landed = gs.islands[gs.onIdx];
          if (landed?.isGoal) {
            const ns = gs.score + 100 + gs.level * 50;
            updateHS(ns);
            gsRef.current = makeGS(gs.level + 1, ns, W, H);
            setScoreDsp(ns);
          } else {
            gs.score += 10;
            setScoreDsp(gs.score);
          }
        }
      }
    }

    // ── draw ──────────────────────────────────────────────────────────────────
    drawWater(ctx, W, H, t);
    for (let i = 0; i < gs.islands.length; i++) drawIsland(ctx, gs.islands[i]!, i, t);
    if (!gs.jumping && !gs.over) drawRing(ctx, gs.fx, gs.fy, MAX_JUMP);

    // squish/stretch + angle while jumping
    let sx = 1, sy = 1, angle = 0;
    if (gs.jumping) {
      const mid = Math.sin(Math.PI * gs.jumpT);
      sx = 1 - mid * 0.22; sy = 1 + mid * 0.32;
      angle = Math.atan2(gs.toY - gs.fromY, gs.toX - gs.fromX) + Math.PI / 2;
    }
    drawFrog(ctx, gs.fx, gs.fy, angle, sx, sy);
    drawHUD(ctx, W, gs.score, gs.level);
    if (gs.over) drawOver(ctx, W, H);
  });

  return (
    <GameShell topbar={<GameTopbar title={GAME_TITLE} score={scoreDsp} highScore={highScore} />}>
      <div className="w-full h-full relative overflow-hidden">
        <canvas ref={canvasRef} className="block" style={{ touchAction: "none" }} />
      </div>
    </GameShell>
  );
}
