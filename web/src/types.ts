export type GamePhase = "idle" | "aiming" | "jumping" | "landing" | "dead" | "win";

export interface Island {
  x: number;
  y: number;
  r: number;          // radius
  wobble: number;     // current wobble offset
  wobbleDir: number;  // +1 / -1
  sinking: boolean;
  sinkT: number;      // 0→1 sinking progress
  type: "lily" | "log" | "rock";
}

export interface Frog {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;      // body rotation
  squishX: number;    // scale x (squash & stretch)
  squishY: number;    // scale y
  jumpT: number;      // 0→1 jump arc progress
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  jumpDuration: number;
  tongueOut: boolean;
  tongueT: number;
}

export interface Ripple {
  x: number;
  y: number;
  r: number;
  alpha: number;
}

export interface Fly {
  x: number;
  y: number;
  islandIdx: number;
  wingT: number;
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
