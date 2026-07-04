import type { Island, Frog, Ripple, Fly, Particle } from "../types";

// ── constants ──────────────────────────────────────────────────────────────
export const ISLAND_TYPES = ["lily", "log", "rock"] as const;
export const SINK_TIME = 2.2;      // seconds after landing before island sinks
export const JUMP_SPEED = 520;     // px/s baseline
export const MAX_JUMP_DIST = 320;  // px
export const GRAVITY_PEAK = 0.55;  // arc peak height as fraction of distance

// ── helpers ────────────────────────────────────────────────────────────────
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

// ── island generation ──────────────────────────────────────────────────────
export function generateIslands(
  canvasW: number,
  canvasH: number,
  count: number,
  startX: number,
  startY: number,
): Island[] {
  const islands: Island[] = [];

  // First island is the start pad (always a lily)
  islands.push({
    x: startX,
    y: startY,
    r: 46,
    wobble: 0,
    wobbleDir: 1,
    sinking: false,
    sinkT: 0,
    type: "lily",
  });

  const margin = 60;
  let attempts = 0;

  while (islands.length < count && attempts < count * 40) {
    attempts++;
    const prev = islands[islands.length - 1]!;
    const angle = randBetween(-Math.PI * 0.55, Math.PI * 0.55);
    const d = randBetween(120, MAX_JUMP_DIST - 20);
    const nx = prev.x + Math.cos(angle) * d;
    const ny = prev.y + Math.sin(angle) * d;

    if (nx < margin || nx > canvasW - margin || ny < margin || ny > canvasH - margin) continue;

    // Ensure no overlap with existing islands
    let overlap = false;
    for (const isl of islands) {
      if (dist(isl.x, isl.y, nx, ny) < isl.r + 38) { overlap = true; break; }
    }
    if (overlap) continue;

    const typeIdx = Math.floor(Math.random() * 3);
    const type = ISLAND_TYPES[typeIdx] ?? "lily";
    const r = type === "lily" ? randBetween(34, 50) : type === "log" ? randBetween(28, 38) : randBetween(26, 36);

    islands.push({
      x: nx, y: ny, r,
      wobble: 0, wobbleDir: Math.random() < 0.5 ? 1 : -1,
      sinking: false, sinkT: 0,
      type,
    });
  }

  return islands;
}

// ── frog init ──────────────────────────────────────────────────────────────
export function makeFrog(x: number, y: number): Frog {
  return {
    x, y, vx: 0, vy: 0, angle: 0,
    squishX: 1, squishY: 1,
    jumpT: 1,
    fromX: x, fromY: y, toX: x, toY: y,
    jumpDuration: 0.5,
    tongueOut: false, tongueT: 0,
  };
}

// ── ripple helpers ─────────────────────────────────────────────────────────
export function addRipple(ripples: Ripple[], x: number, y: number) {
  ripples.push({ x, y, r: 4, alpha: 0.7 });
}

// ── particle burst ─────────────────────────────────────────────────────────
export function burstParticles(particles: Particle[], x: number, y: number, color: string, count = 8) {
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count + randBetween(-0.3, 0.3);
    const speed = randBetween(40, 130);
    particles.push({
      x, y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      r: randBetween(2, 5),
      alpha: 1,
      color,
    });
  }
}

// ── arc height at t (0→1) ──────────────────────────────────────────────────
export function arcY(fromY: number, toY: number, d: number, t: number): number {
  const base = fromY + (toY - fromY) * t;
  const peak = Math.min(d * GRAVITY_PEAK, 160);
  return base - peak * Math.sin(Math.PI * t);
}
