import React, { useRef, useState, useCallback } from "react";
import { GameShell, GameTopbar } from "@freegamestore/games";
import { useControls } from "./hooks/useControls";
import { useGameLoop } from "./hooks/useGameLoop";
import { useHighScore } from "./hooks/useHighScore";
import { drawGlow, drawText, lerp, clamp, dist, hexToRgba, randomInRange } from "./lib/canvas";

const GAME_TITLE = "Frog jumping on islands in the marsh";
const HIGH_SCORE_KEY = "frofrogjumping_highscore";

const LEVELS = [
  { islands: 5, minDist: 100, maxDist: 160 },
  { islands: 7, minDist: 110, maxDist: 180 },
  { islands: 9, minDist: 120, maxDist: 200 },
  { islands: 11, minDist: 130, maxDist: 220 },
];

interface Island {
  x: number;
  y: number;
  radius: number;
}

interface Frog {
  x: number;
  y: number;
  radius: number;
  jumping: boolean;
  target?: { x: number; y: number };
  jumpProgress: number;
}

function randomIsland(cx: number, cy: number, minDist: number, maxDist: number, prevIslands: Island[]): Island {
  let angle = randomInRange(0, Math.PI * 2);
  let distVal = randomInRange(minDist, maxDist);
  let x = cx + Math.cos(angle) * distVal;
  let y = cy + Math.sin(angle) * distVal;
  for (let tries = 0; tries < 10; tries++) {
    if (
      prevIslands.every(
        (isl) => dist(isl.x, isl.y, x, y) > isl.radius + 40
      )
    ) {
      break;
    }
    angle = randomInRange(0, Math.PI * 2);
    distVal = randomInRange(minDist, maxDist);
    x = cx + Math.cos(angle) * distVal;
    y = cy + Math.sin(angle) * distVal;
  }
  return {
    x,
    y,
    radius: randomInRange(32, 48),
  };
}

function makeLevel(levelIdx: number, width: number, height: number): Island[] {
  const lvl = LEVELS[levelIdx] ?? LEVELS[LEVELS.length - 1];
  const islands: Island[] = [];
  islands.push({ x: width / 2, y: height / 2, radius: 44 });
  let last = islands[0];
  for (let i = 1; i < lvl.islands; i++) {
    const isl = randomIsland(last.x, last.y, lvl.minDist, lvl.maxDist, islands);
    islands.push(isl);
    last = isl;
  }
  return islands;
}

const FROG_COLORS = ["#6cc24a", "#4a8c37", "#b0e57c"];

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(0);
  const [highScore, updateHighScore] = useHighScore(HIGH_SCORE_KEY);
  const [gameOver, setGameOver] = useState(false);
  const [islands, setIslands] = useState<Island[]>([]);
  const [frog, setFrog] = useState<Frog | null>(null);
  const controls = useControls();

  const width = 420;
  const height = 700;

  const startGame = useCallback(() => {
    setScore(0);
    setLevel(0);
    setGameOver(false);
    const lvlIslands = makeLevel(0, width, height);
    setIslands(lvlIslands);
    setFrog({ x: lvlIslands[0].x, y: lvlIslands[0].y, radius: 24, jumping: false, jumpProgress: 0 });
  }, []);

  const nextLevel = useCallback(() => {
    const nextIdx = level + 1;
    setLevel(nextIdx);
    const lvlIslands = makeLevel(nextIdx, width, height);
    setIslands(lvlIslands);
    setFrog({ x: lvlIslands[0].x, y: lvlIslands[0].y, radius: 24, jumping: false, jumpProgress: 0 });
  }, [level]);

  useGameLoop((dt) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !frog || islands.length === 0) return;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#d1f2e5";
    ctx.fillRect(0, 0, width, height);
    islands.forEach((isl, idx) => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(isl.x, isl.y, isl.radius, 0, Math.PI * 2);
      ctx.fillStyle = idx === islands.length - 1 ? "#ffe066" : "#85c7a7";
      ctx.shadowColor = "#3b7b47";
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.restore();
    });
    ctx.save();
    let frogColor = FROG_COLORS[level % FROG_COLORS.length];
    ctx.beginPath();
    ctx.arc(frog.x, frog.y, frog.radius, 0, Math.PI * 2);
    ctx.fillStyle = frogColor;
    ctx.shadowColor = "#3b7b47";
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.restore();
    drawText(ctx, `Score: ${score}`, width / 2, 36, {
      font: "24px Fraunces",
      color: "#277a39",
      align: "center",
      glow: true,
      glowColor: "#fff",
    });
    if (!frog.jumping && !gameOver) {
      let targetIdx = -1;
      if (controls.mouse.down || controls.touch.active) {
        let minD = 9999;
        for (let i = 0; i < islands.length; i++) {
          const isl = islands[i];
          const d = dist(frog.x, frog.y, isl.x, isl.y);
          if (d < minD && d > 20) {
            minD = d;
            targetIdx = i;
          }
        }
      }
      if (controls.keys.has(" ") || controls.keys.has("ArrowUp")) {
        const curIdx = islands.findIndex((isl) => dist(frog.x, frog.y, isl.x, isl.y) < 2);
        if (curIdx !== -1 && curIdx < islands.length - 1) {
          targetIdx = curIdx + 1;
        }
      }
      if (targetIdx > 0) {
        const target = islands[targetIdx];
        setFrog({ ...frog, jumping: true, target: { x: target.x, y: target.y }, jumpProgress: 0 });
      }
    }
    if (frog.jumping && frog.target) {
      let prog = clamp(frog.jumpProgress + dt * 2.2, 0, 1);
      let nx = lerp(frog.x, frog.target.x, prog);
      let ny = lerp(frog.y, frog.target.y, prog);
      setFrog({ ...frog, x: nx, y: ny, jumpProgress: prog });
      if (prog >= 1) {
        const targetIdx = islands.findIndex((isl) => dist(nx, ny, isl.x, isl.y) < 2);
        if (targetIdx === islands.length - 1) {
          setScore((s) => s + 100);
          updateHighScore(score + 100);
          nextLevel();
        } else {
          setScore((s) => s + 10);
          updateHighScore(score + 10);
          setFrog({ ...frog, x: nx, y: ny, jumping: false, jumpProgress: 0 });
        }
      }
    }
  });

  React.useEffect(() => {
    startGame();
  }, []);

  return (
    <GameShell topbar={<GameTopbar title={GAME_TITLE} score={score} highScore={highScore} />}> 
      <div className="flex flex-col items-center justify-center w-full h-full">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="rounded-xl shadow-lg bg-[#d1f2e5]"
          style={{ touchAction: "none", maxWidth: "100vw", maxHeight: "calc(100vh - 64px)" }}
        />
        {gameOver && (
          <button
            className="mt-6 px-4 py-2 rounded bg-green-500 text-white text-lg font-fraunces"
            onClick={startGame}
          >
            Restart
          </button>
        )}
      </div>
    </GameShell>
  );
}

export default App;
