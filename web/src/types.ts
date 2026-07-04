export type GamePhase = "idle" | "jumping" | "dead" | "won";
export type DeathCause = "bird" | "fish" | "water" | null;

export interface Island {
  x: number;
  y: number;
  r: number;
  wobble: number;
  wobbleDir: number;
  sinking: boolean;
  sinkT: number;
  type: "lily" | "log" | "rock";
}

export interface Frog {
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  jumpT: number;
  jumpDuration: number;
  angle: number;
  squishX: number;
  squishY: number;
  islandIdx: number;   // which island it's on (-1 = in air / water)
  alive: boolean;
  isPlayer: boolean;
  color: string;
  eyeColor: string;
  // rival-only fields
  hopTimer: number;    // countdown until next hop attempt
  jumping: boolean;    // is rival currently mid-jump?
  targetIsland: number; // where the rival is jumping to (-1 = none)
}

export interface Bird {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: "soaring" | "diving" | "rising" | "leaving";
  targetX: number;
  targetY: number;
  wingT: number;
  diveT: number;
  strikeX: number;
  strikeY: number;
}

export interface Fish {
  x: number;
  y: number;
  phase: "hidden" | "rising" | "snapping" | "sinking";
  t: number;
  targetX: number;
  targetY: number;
  mouthOpen: number;
}

export interface Ripple {
  x: number;
  y: number;
  r: number;
  alpha: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  alpha: number;
  color: string;
}

export interface FloatText {
  x: number;
  y: number;
  vy: number;
  alpha: number;
  text: string;
  color: string;
}
