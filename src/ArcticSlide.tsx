import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, Trophy, AlertTriangle, ChevronRight, ChevronLeft } from 'lucide-react';

// --- Types & Constants ---
type Tile = 'P' | '.' | 'X' | 'G' | '~' | 'U' | 'D' | 'L' | 'R';

const COLORS = {
  ice: '#E0F2FE',
  wall: '#7DD3FC',
  water: '#0C4A6E',
  fish: '#FB923C',
  penguinBody: '#111',
  penguinBelly: '#FFF',
  penguinOrange: '#F97316',
};

// --- Game Logic Helper ---
// generate a sliding-puzzle grid for a given level
const getLevelGrid = (level: number): Tile[][] => {
  // grid dimensions grow slowly with level but cap for performance
  const size = Math.min(6 + Math.floor(level / 10), 15);
  // start with everything walled – we'll carve out a single guaranteed path
  const grid: Tile[][] = Array(size)
    .fill(null)
    .map(() => Array(size).fill('X'));

  // seeded pseudo-random helper so levels are deterministic
  const seed = level * 12345;
  const pseudoRandom = (s: number) => (Math.sin(s) * 10000) % 1;
  let rndIndex = 0;
  const nextRandom = () => {
    const v = pseudoRandom(seed + rndIndex);
    rndIndex++;
    return Math.abs(v);
  };

  // build a simple monotonic path from top‑left to bottom‑right
  const path: { x: number; y: number }[] = [];
  let x = 0;
  let y = 0;
  path.push({ x, y });

  while (x !== size - 1 || y !== size - 1) {
    const dirs: Array<[number, number]> = [];
    if (x < size - 1) dirs.push([1, 0]);
    if (y < size - 1) dirs.push([0, 1]);
    const [dx, dy] = dirs[Math.floor(nextRandom() * dirs.length)];
    x += dx;
    y += dy;
    path.push({ x, y });
  }

  // carve the corridor (all other cells remain walls)
  path.forEach(p => {
    grid[p.y][p.x] = '.';
  });

  // mark start and goal
  grid[0][0] = 'P';
  grid[size - 1][size - 1] = 'G';

  // put a small backstopper beyond the goal so the penguin can't slide past it
  if (path.length >= 2) {
    const last = path[path.length - 1]; // goal
    const prev = path[path.length - 2];
    const dx = last.x - prev.x;
    const dy = last.y - prev.y;
    const backX = last.x + dx;
    const backY = last.y + dy;
    if (
      backX >= 0 && backX < size &&
      backY >= 0 && backY < size &&
      grid[backY][backX] === '.'
    ) {
      grid[backY][backX] = 'X';
    }
  }

  return grid;
};

// --- Main Component ---
export default function ArcticSlide() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [level, setLevel] = useState(0);
  const [status, setStatus] = useState<'playing' | 'won' | 'lost'>('playing');
  const [moves, setMoves] = useState(0);
  
  // Internal Game State (using ref to avoid React re-render lag in the loop)
  const state = useRef({
    pos: { x: 0, y: 0 },
    grid: getLevelGrid(0),
    isSliding: false,
    dir: { x: 0, y: 0 },
    fishCollected: 0,
    totalFish: 1,
  });

  // level names for flavour
  const LEVEL_NAMES = [
    'First Slide',
    'Penguin Path',
    'Ice Drift',
    'Frosty Turn',
    'Snowy Stretch',
    'Glacial Rush',
    'Aurora Run',
    'Blizzard Bend',
    'Crystal Corridor',
    'Midnight Melt',
  ];

  // Initialization/reset helper is now above (initializeLevel)
  useEffect(() => {
    initializeLevel(level);
  }, [level]);

  // when retrying we just re-run initializer for current level
  const handleRetry = () => initializeLevel(level);


  // helper to (re)initialize game state for a given level
  const initializeLevel = (lvl: number) => {
    const grid = getLevelGrid(lvl);
    let startPos = { x: 0, y: 0 };
    let fishCount = 0;

    grid.forEach((row, y) =>
      row.forEach((tile, x) => {
        if (tile === 'P') startPos = { x, y };
        if (tile === 'G') fishCount++;
      })
    );

    state.current = {
      pos: startPos,
      grid,
      isSliding: false,
      dir: { x: 0, y: 0 },
      fishCollected: 0,
      totalFish: fishCount,
    };
    setMoves(0);
    setStatus('playing');
  };

  // Movement Logic
  const handleMove = useCallback((dx: number, dy: number) => {
    if (state.current.isSliding || status !== 'playing') return;

    state.current.isSliding = true;
    state.current.dir = { x: dx, y: dy };
    setMoves(m => m + 1);

    const slideInterval = setInterval(() => {
      const nextX = state.current.pos.x + dx;
      const nextY = state.current.pos.y + dy;
      const grid = state.current.grid;

      // if our next step would leave the grid treat it as hitting a wall
      if (nextY < 0 || nextY >= grid.length || nextX < 0 || nextX >= grid[0].length) {
        // simply stop sliding instead of losing
        state.current.isSliding = false;
        clearInterval(slideInterval);
        return;
      }

      const nextTile = grid[nextY][nextX];

      if (nextTile === 'X') {
        state.current.isSliding = false;
        clearInterval(slideInterval);
      } else if (nextTile === '~') {
        state.current.pos = { x: nextX, y: nextY };
        setStatus('lost');
        clearInterval(slideInterval);
      } else {
        state.current.pos = { x: nextX, y: nextY };
        if (nextTile === 'G') {
          grid[nextY][nextX] = '.'; // Collect fish
          state.current.fishCollected++;
          if (state.current.fishCollected >= state.current.totalFish) {
            setStatus('won');
            clearInterval(slideInterval);
          }
        }
      }
    }, 100);
  }, [status]);

  // Drawing Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let frame: number;

    const draw = () => {
      const { grid, pos } = state.current;
      const size = canvas.width / grid.length;

      // add a gentle wobble when standing still to make penguin more alive
      const t = performance.now();
      const bounce = Math.sin(t * 0.005) * size * 0.05;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw Grid with simple 3D shading
      grid.forEach((row, y) => {
        row.forEach((tile, x) => {
          const px = x * size;
          const py = y * size;

          // base color gradient for depth effect
          const grad = ctx.createLinearGradient(px, py, px + size, py + size);
          if (tile === 'X') {
            grad.addColorStop(0, '#6fb0ea');
            grad.addColorStop(1, '#7dd3fc');
          } else if (tile === '~') {
            grad.addColorStop(0, '#074267');
            grad.addColorStop(1, '#0c4a6e');
          } else {
            grad.addColorStop(0, COLORS.ice);
            grad.addColorStop(1, COLORS.ice);
          }
          ctx.fillStyle = grad;
          ctx.fillRect(px, py, size, size);

          // thin dark border to accentuate blocks
          ctx.strokeStyle = 'rgba(0,0,0,0.15)';
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);

          // ice sheen overlay for floor tiles
          if (tile === '.') {
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.beginPath();
            ctx.moveTo(px + size * 0.2, py + size * 0.1);
            ctx.lineTo(px + size * 0.8, py + size * 0.1);
            ctx.lineTo(px + size * 0.6, py + size * 0.4);
            ctx.lineTo(px + size * 0.3, py + size * 0.3);
            ctx.closePath();
            ctx.fill();
          }

          // fish (goal) with a little heart eye for cuteness
          if (tile === 'G') {
            const cx = px + size / 2;
            const cy = py + size / 2;
            ctx.fillStyle = COLORS.fish;
            ctx.beginPath();
            ctx.ellipse(cx, cy, size * 0.3, size * 0.2, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = COLORS.ice;
            ctx.beginPath();
            ctx.moveTo(cx + size * 0.3, cy);
            ctx.lineTo(cx + size * 0.45, cy - size * 0.15);
            ctx.lineTo(cx + size * 0.45, cy + size * 0.15);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.arc(cx - size * 0.1, cy - size * 0.05, size * 0.05, 0, Math.PI * 2);
            ctx.fill();

            // little heart next to eye
            ctx.fillStyle = '#ff4081';
            ctx.beginPath();
            ctx.moveTo(cx - size * 0.08, cy - size * 0.12);
            ctx.bezierCurveTo(
              cx - size * 0.12, cy - size * 0.18,
              cx - size * 0.02, cy - size * 0.18,
              cx - size * 0.05, cy - size * 0.12
            );
            ctx.bezierCurveTo(
              cx - size * 0.02, cy - size * 0.08,
              cx - size * 0.12, cy - size * 0.06,
              cx - size * 0.08, cy - size * 0.12
            );
            ctx.fill();
          }
        });
      });

      // Draw Penguin (cute with gradient, blush and slight wobble)
      const px = pos.x * size + size / 2;
      const py = pos.y * size + size / 2 + bounce; // apply bounce
      const bodyColor = status === 'lost' ? '#60A5FA' : COLORS.penguinBody;

      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(px, py + size * 0.25, size * 0.4, size * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();

      // body gradient for softness
      const bodyGrad = ctx.createRadialGradient(px, py, size * 0.1, px, py, size * 0.35);
      bodyGrad.addColorStop(0, '#444');
      bodyGrad.addColorStop(1, bodyColor);
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.arc(px, py, size * 0.35, 0, Math.PI * 2);
      ctx.fill();

      // belly
      ctx.fillStyle = '#FFF';
      ctx.beginPath();
      ctx.arc(px, py + size * 0.1, size * 0.2, 0, Math.PI * 2);
      ctx.fill();

      // eyes with cute sparkle
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(px - size * 0.12, py - size * 0.1, size * 0.05, 0, Math.PI * 2);
      ctx.arc(px + size * 0.12, py - size * 0.1, size * 0.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(px - size * 0.125, py - size * 0.105, size * 0.02, 0, Math.PI * 2);
      ctx.arc(px + size * 0.115, py - size * 0.105, size * 0.02, 0, Math.PI * 2);
      ctx.fill();

      // rosy cheeks for cuteness
      ctx.fillStyle = 'rgba(255,192,203,0.6)';
      ctx.beginPath();
      ctx.arc(px - size * 0.15, py - size * 0.02, size * 0.07, 0, Math.PI * 2);
      ctx.arc(px + size * 0.15, py - size * 0.02, size * 0.07, 0, Math.PI * 2);
      ctx.fill();

      // beak
      ctx.fillStyle = COLORS.penguinOrange;
      ctx.beginPath();
      ctx.moveTo(px, py - size * 0.02);
      ctx.lineTo(px - size * 0.08, py + size * 0.05);
      ctx.lineTo(px + size * 0.08, py + size * 0.05);
      ctx.closePath();
      ctx.fill();

      // flippers
      ctx.strokeStyle = bodyColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px - size * 0.3, py);
      ctx.quadraticCurveTo(px - size * 0.4, py + size * 0.1, px - size * 0.2, py + size * 0.15);
      ctx.moveTo(px + size * 0.3, py);
      ctx.quadraticCurveTo(px + size * 0.4, py + size * 0.1, px + size * 0.2, py + size * 0.15);
      ctx.stroke();

      // sliding effects
      if (state.current.isSliding) {
        const dir = state.current.dir;
        // snow blobs
        for (let i = 0; i < 5; i++) {
          const offset = i * size * 0.1;
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.beginPath();
          ctx.arc(px - dir.x * offset, py - dir.y * offset, size * 0.05, 0, Math.PI * 2);
          ctx.fill();
        }
        // sparkles on ice
        for (let i = 0; i < 3; i++) {
          const sx = px + (Math.random() - 0.5) * size * 0.6;
          const sy = py + (Math.random() - 0.5) * size * 0.6;
          const len = size * 0.1;
          ctx.strokeStyle = 'rgba(255,255,255,0.8)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(sx - len / 2, sy);
          ctx.lineTo(sx + len / 2, sy);
          ctx.moveTo(sx, sy - len / 2);
          ctx.lineTo(sx, sy + len / 2);
          ctx.stroke();
        }
      }

      frame = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(frame);
  }, [status]);

  // Keyboard Support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') handleMove(0, -1);
      if (e.key === 'ArrowDown') handleMove(0, 1);
      if (e.key === 'ArrowLeft') handleMove(-1, 0);
      if (e.key === 'ArrowRight') handleMove(1, 0);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleMove]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 p-4 text-white">
      {/* HUD */}
      <div className="w-full max-w-[500px] flex justify-between items-center mb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tighter">ARCTIC SLIDE</h1>
          <p className="text-xs opacity-50 uppercase">Moves: {moves}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setLevel(l => Math.max(0, l - 1))} className="p-2 bg-white/10 rounded-lg hover:bg-white/20"><ChevronLeft size={20}/></button>
          <span className="bg-blue-600 px-3 py-1 rounded-lg font-mono">Lvl {level + 1}</span>
          <button onClick={() => setLevel(l => l + 1)} className="p-2 bg-white/10 rounded-lg hover:bg-white/20"><ChevronRight size={20}/></button>
          <button onClick={handleRetry} className="p-2 bg-red-500/20 text-red-400 rounded-lg"><RefreshCw size={20}/></button>
        </div>
        <div className="text-xs mt-1 opacity-60">
          {LEVEL_NAMES[level % LEVEL_NAMES.length] || `Lvl ${level + 1}`}
        </div>
      </div>

      {/* Game Canvas */}
      <div
        className="relative border-4 border-white/10 rounded-2xl overflow-hidden shadow-2xl transform-gpu"
        style={{ perspective: 800 }}
      >
        <canvas
          ref={canvasRef}
          width={500}
          height={500}
          className="max-w-full aspect-square touch-none cursor-pointer"
          style={{ transform: 'rotateX(10deg)' }}
          onClick={(e) => {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;

            // adjust for perspective transform when computing direction
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;

            if (Math.abs(x) > Math.abs(y)) {
              handleMove(x > 0 ? 1 : -1, 0);
            } else {
              handleMove(0, y > 0 ? 1 : -1);
            }
          }}
        />

        {/* Overlays */}
        <AnimatePresence>
          {status !== 'playing' && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center"
            >
              {status === 'won' ? (
                <>
                  <Trophy className="text-yellow-400 mb-2" size={48} />
                  <h2 className="text-3xl font-black">DELICIOUS!</h2>
                  <p className="opacity-70 mb-4">You collected the fish in {moves} moves.</p>
                  <button onClick={() => setLevel(l => l + 1)} className="bg-blue-500 w-full py-3 rounded-xl font-bold">NEXT LEVEL</button>
                </>
              ) : (
                <>
                  <AlertTriangle className="text-red-400 mb-2" size={48} />
                  <h2 className="text-3xl font-black">OH NO!</h2>
                  <p className="opacity-70 mb-4">You fell into the water or out of bounds.</p>
                  <button onClick={() => setLevel(level)} className="bg-white text-slate-900 w-full py-3 rounded-xl font-bold">RETRY</button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <p className="mt-6 text-sm opacity-40">Use Arrow Keys to Slide</p>
    </div>
  );
}