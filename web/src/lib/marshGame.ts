import type { Island, Frog, Bird, Fish } from "../types";

export const ISLAND_TYPES = ["lily", "log", "rock"] as const;
export const SINK_TIME = 3.0;
export const MAX_JUMP_DIST = 340;
export const GRAVITY_PEAK = 0.52;
export const RIVAL_HOP_RANGE = 280; // max dist a rival will hop

export function randBetween(a: number, b: number) {
  return a + Math.random() * (b - a);
}

export function dist(ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export function arcY(fromY: number, toY: number, d: number, t: number): number {
  const base = fromY + (toY - fromY) * t;
  const peak = Math.min(d * GRAVITY_PEAK, 150);
  return base - peak * Math.sin(Math.PI * t);
}

// ── island generation ──────────────────────────────────────────────────────
export function generateIslands(
  W: number,
  H: number,
  count: number,
  startX: number,
  startY: number,
): Island[] {
  const islands: Island[] = [];

  islands.push({
    x: startX, y: startY, r: 46,
    wobble: 0, wobbleDir: 1,
    sinking: false, sinkT: 0,
    type: "lily",
  });

  const margin = 70;
  let attempts = 0;

  while (islands.length < count && attempts < count * 60) {
    attempts++;
    const prev = islands[islands.length - 1]!;
    const angle = randBetween(-Math.PI * 0.6, Math.PI * 0.6);
    const d = randBetween(110, MAX_JUMP_DIST - 30);
    const nx = prev.x + Math.cos(angle) * d;
    const ny = prev.y + Math.sin(angle) * d;

    if (nx < margin || nx > W - margin || ny < margin || ny > H - margin) continue;

    let overlap = false;
    for (const isl of islands) {
      if (dist(isl.x, isl.y, nx, ny) < isl.r + 42) { overlap = true; break; }
    }
    if (overlap) continue;

    const typeIdx = Math.floor(Math.random() * 3);
    const type = ISLAND_TYPES[typeIdx] ?? "lily";
    const r = type === "lily" ? randBetween(34, 50)
            : type === "log"  ? randBetween(28, 38)
            :                   randBetween(26, 36);

    islands.push({
      x: nx, y: ny, r,
      wobble: 0, wobbleDir: Math.random() < 0.5 ? 1 : -1,
      sinking: false, sinkT: 0,
      type,
    });
  }

  return islands;
}

// ── frog factory ───────────────────────────────────────────────────────────
const RIVAL_COLORS = [
  { body: "#e57373", eye: "#fff9c4" },
  { body: "#ffb74d", eye: "#f3e5f5" },
  { body: "#ba68c8", eye: "#fff9c4" },
  { body: "#4dd0e1", eye: "#fff9c4" },
  { body: "#fff176", eye: "#e8f5e9" },
];

export function makePlayerFrog(x: number, y: number, islandIdx: number): Frog {
  return {
    x, y, fromX: x, fromY: y, toX: x, toY: y,
    jumpT: 1, jumpDuration: 0.5, angle: 0,
    squishX: 1, squishY: 1,
    islandIdx, alive: true, isPlayer: true,
    color: "#56c56e", eyeColor: "#fffde7",
    hopTimer: 0, jumping: false, targetIsland: -1,
  };
}

export function makeRivalFrog(x: number, y: number, islandIdx: number): Frog {
  const palette = RIVAL_COLORS[Math.floor(Math.random() * RIVAL_COLORS.length)]!;
  return {
    x, y, fromX: x, fromY: y, toX: x, toY: y,
    jumpT: 1, jumpDuration: 0.5, angle: 0,
    squishX: 1, squishY: 1,
    islandIdx, alive: true, isPlayer: false,
    color: palette.body, eyeColor: palette.eye,
    hopTimer: randBetween(2, 6), // stagger starts
    jumping: false, targetIsland: -1,
  };
}

// ── bird factory ───────────────────────────────────────────────────────────
export function makeBird(W: number, _H: number): Bird {
  const fromLeft = Math.random() < 0.5;
  return {
    x: fromLeft ? -60 : W + 60,
    y: randBetween(40, 120),
    vx: fromLeft ? randBetween(90, 140) : randBetween(-140, -90),
    vy: 0,
    phase: "soaring",
    targetX: 0, targetY: 0,
    wingT: 0,
    diveT: 0,
    strikeX: 0, strikeY: 0,
  };
}

// ── fish factory ───────────────────────────────────────────────────────────
export function makeFish(x: number, y: number): Fish {
  return {
    x, y: y + 80,
    phase: "hidden",
    t: 0,
    targetX: x, targetY: y,
    mouthOpen: 0,
  };
}
