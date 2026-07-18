import React, { useRef, useState, useCallback } from "react";
import { GameShell, GameTopbar } from "@freegamestore/games";
import useControls from "./hooks/useControls";
import useGameLoop from "./hooks/useGameLoop";
import useHighScore from "./hooks/useHighScore";
import { drawGlow, drawText, lerp, clamp, dist, hexToRgba, randomInRange } from "./lib/canvas";

const GAME_TITLE = "Frog jumping on islands in the marsh";
const HIGH_SCORE_KEY = "frofrogjumping_highscore";

// Level definitions
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
  // Prevent overlap
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
  // Start in center
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

  // Canvas sizing
  const width = 420;
  const height = 700;

  // Start/reset game
  const startGame = useCallback(() => {
    setScore(0);
    setLevel(0);
    setGameOver(false);
    const lvlIslands = makeLevel(0, width, height);
    setIslands(lvlIslands);
    setFrog({ x: lvlIslands[0].x, y: lvlIslands[0].y, radius: 24, jumping: false, jumpProgress: 0 });
  }, []);

  // Advance to next level (no dialog)
  const nextLevel = useCallback(() => {
    const nextIdx = level + 1;
    setLevel(nextIdx);
    const lvlIslands = makeLevel(nextIdx, width, height);
    setIslands(lvlIslands);
    setFrog({ x: lvlIslands[0].x, y: lvlIslands[0].y, radius: 24, jumping: false, jumpProgress: 0 });
  }, [level]);

  // Game loop
  useGameLoop((dt) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !frog || islands.length === 0) return;
    ctx.clearRect(0, 0, width, height);
    // Draw marsh background
    ctx.fillStyle = "#d1f2e5";
    ctx.fillRect(0, 0, width, height);
    // Draw islands
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
    // Draw frog
    ctx.save();
    let frogColor = FROG_COLORS[level % FROG_COLORS.length];
    ctx.beginPath();
    ctx.arc(frog.x, frog.y, frog.radius, 0, Math.PI * 2);
    ctx.fillStyle = frogColor;
    ctx.shadowColor = "#3b7b47";
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.restore();
    // Draw score
    drawText(ctx, `Score: ${score}`, width / 2, 36, {
      font: "24px Fraunces",
      color: "#277a39",
      align: "center",
      glow: true,
      glowColor: "#fff",
    });
    // Jump input
    if (!frog.jumping && !gameOver) {
      let targetIdx = -1;
      // Touch or click: jump to nearest island ahead
      if (controls.mouse.down || controls.touch.active) {
        // Find nearest island not the current
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
      // Keyboard: Space or Up Arrow jumps to next island
      if (controls.keys[" "] || controls.keys["ArrowUp"]) {
        targetIdx = islands.findIndex(
          (isl) => dist(frog.x, frog.y, isl.x, isl.y) > 20
        );
      }
      if (targetIdx > -1) {
        const isl = islands[targetIdx];
        setFrog({ ...frog, jumping: true, target: { x: isl.x, y: isl.y }, jumpProgress: 0 });
      }
    }
    // Handle jump animation
    if (frog.jumping && frog.target) {
      const jumpSpeed = 1.3;
      let prog = frog.jumpProgress + dt * jumpSpeed;
      prog = clamp(prog, 0, 1);
      const nx = lerp(frog.x, frog.target.x, prog);
      const ny = lerp(frog.y, frog.target.y, prog);
      // Frog arc up
      const arcY = Math.sin(prog * Math.PI) * 38;
      const drawY = ny - arcY;
      // Draw frog moving
      ctx.save();
      ctx.beginPath();
      ctx.arc(nx, drawY, frog.radius, 0, Math.PI * 2);
      ctx.fillStyle = frogColor;
      ctx.shadowColor = "#3b7b47";
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.restore();
      if (prog >= 1) {
        // Land on island
        const idx = islands.findIndex(
          (isl) => dist(isl.x, isl.y, frog.target!.x, frog.target!.y) < 2
        );
        if (idx === islands.length - 1) {
          // Finished level
          setScore((s) => {
            const ns = s + 100;
            updateHighScore(ns);
            return ns;
          });
          nextLevel(); // Move to next level immediately
        } else {
          setScore((s) => s + 10);
          setFrog({ x: frog.target.x, y: frog.target.y, radius: 24, jumping: false, jumpProgress: 0 });
        }
      } else {
        setFrog({ ...frog, x: nx, y: ny, jumping: true, jumpProgress: prog });
      }
    }
    // Game over when all levels beaten
    if (level >= LEVELS.length && !gameOver) {
      setGameOver(true);
      updateHighScore(score);
    }
    // Draw game over
    if (gameOver) {
      drawGlow(ctx, width / 2, height / 2 - 60, 170, "#fff7", 18);
      drawText(ctx, "Game Over!", width / 2, height / 2 - 60, {
        font: "34px Fraunces",
        color: "#277a39",
        align: "center",
        glow: true,
        glowColor: "#fff",
      });
      drawText(ctx, `Score: ${score}`, width / 2, height / 2, {
        font: "26px Manrope",
        color: "#277a39",
        align: "center",
      });
      drawText(ctx, `High Score: ${highScore}`, width / 2, height / 2 + 38, {
        font: "20px Manrope",
        color: "#1e5c2a",
        align: "center",
      });
    }
  }, false);

  // Start game on load
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
          className="rounded-2xl bg-[#d1f2e5] shadow-xl mt-2"
          style={{ maxWidth: "98vw", maxHeight: "78vh" }}
        />
        {/* Restart button only on game over */}
        {gameOver && (
          <button
            className="mt-6 px-7 py-3 rounded-lg bg-[#277a39] text-white font-manrope text-lg shadow-md"
            onClick={startGame}
            style={{ minWidth: 120 }}
          >
            Restart
          </button>
        )}
      </div>
    </GameShell>
  );
}

export default App;
