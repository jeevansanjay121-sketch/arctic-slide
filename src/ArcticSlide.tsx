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
const getLevelGrid = (level: number): Tile[][] => {
  // build a grid with a guaranteed path from start (0,0) to goal
  const size = Math.min(6 + Math.floor(level / 10), 15);
  const grid: Tile[][] = Array(size).fill(0).map(() => Array(size).fill('.'));

  // deterministic pseudo-random helper based on level seed
  const seed = level * 12345;
  const pseudoRandom = (s: number) => (Math.sin(s) * 10000) % 1;
  let rndIndex = 0;
  const nextRandom = () => {
    const v = pseudoRandom(seed + rndIndex);
    rndIndex++;
    return Math.abs(v);
  };

  // carve a backward path from goal to start using seeded randomness
  const path: {x:number,y:number}[] = [];
  let x = size - 1;
  let y = size - 1;
  path.push({x,y});

  while (x !== 0 || y !== 0) {
    const dirs: Array<[number,number]> = [];
    if (x > 0) dirs.push([-1,0]);
    if (y > 0) dirs.push([0,-1]);
    const choice = Math.floor(nextRandom() * dirs.length);
    const [dx,dy] = dirs[choice];
    x += dx;
    y += dy;
    path.push({x,y});
  }
  // cells along path remain '.'

  // place start and goal markers
  grid[0][0] = 'P';
  grid[size - 1][size - 1] = 'G';

  // add a backstopper wall behind the goal relative to path direction
  if (path.length >= 2) {
    const last = path[0]; // goal
    const prev = path[1];
    const dx = last.x - prev.x;
    const dy = last.y - prev.y;
    const backX = last.x + dx;
    const backY = last.y + dy;
    if (backX >= 0 && backX < size && backY >= 0 && backY < size) {
      if (grid[backY][backX] === '.') grid[backY][backX] = 'X';
    }
  }

  // populate obstacles deterministically off the path
  const isOnPath = (xx: number, yy: number) => path.some(p => p.x === xx && p.y === yy);
  const obstacleCount = size * 2;
  for (let i = 0; i < obstacleCount; i++) {
    const rx = Math.floor(nextRandom() * size);
    const ry = Math.floor(nextRandom() * size);
    if (!isOnPath(rx, ry) && grid[ry][rx] === '.') grid[ry][rx] = 'X';
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

  // Initialization
  useEffect(() => {
    const grid = getLevelGrid(level);
    let startPos = { x: 0, y: 0 };
    let fishCount = 0;
    
    grid.forEach((row, y) => row.forEach((tile, x) => {
      if (tile === 'P') startPos = { x, y };
      if (tile === 'G') fishCount++;
    }));

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
  }, [level]);

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

      // Check Bounds
      if (nextY < 0 || nextY >= grid.length || nextX < 0 || nextX >= grid[0].length) {
        setStatus('lost');
        clearInterval(slideInterval);
        state.current.isSliding = false;
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

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw Grid
      grid.forEach((row, y) => {
        row.forEach((tile, x) => {
          // base color
          ctx.fillStyle = tile === 'X' ? COLORS.wall : tile === '~' ? COLORS.water : COLORS.ice;
          ctx.fillRect(x * size, y * size, size - 1, size - 1);

          // ice sheen overlay
          if (tile === '.') {
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.beginPath();
            ctx.moveTo(x * size + size * 0.2, y * size + size * 0.1);
            ctx.lineTo(x * size + size * 0.8, y * size + size * 0.1);
            ctx.lineTo(x * size + size * 0.6, y * size + size * 0.4);
            ctx.lineTo(x * size + size * 0.3, y * size + size * 0.3);
            ctx.closePath();
            ctx.fill();
          }

          // fish
          if (tile === 'G') {
            // cute fish with tail and eye
            const cx = x * size + size / 2;
            const cy = y * size + size / 2;
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
          }
        });
      });

      // Draw Penguin (cute with eyes, beak, flippers)
      const px = pos.x * size + size / 2;
      const py = pos.y * size + size / 2;
      const bodyColor = status === 'lost' ? '#60A5FA' : COLORS.penguinBody;

      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(px, py + size * 0.25, size * 0.4, size * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.arc(px, py, size * 0.35, 0, Math.PI * 2);
      ctx.fill();

      // belly
      ctx.fillStyle = '#FFF';
      ctx.beginPath();
      ctx.arc(px, py + size * 0.1, size * 0.2, 0, Math.PI * 2);
      ctx.fill();

      // eyes
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(px - size * 0.12, py - size * 0.1, size * 0.05, 0, Math.PI * 2);
      ctx.arc(px + size * 0.12, py - size * 0.1, size * 0.05, 0, Math.PI * 2);
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
          <button onClick={() => setLevel(level)} className="p-2 bg-red-500/20 text-red-400 rounded-lg"><RefreshCw size={20}/></button>
        </div>
      </div>

      {/* Game Canvas */}
      <div className="relative border-4 border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        <canvas 
          ref={canvasRef} 
          width={500} 
          height={500} 
          className="max-w-full aspect-square touch-none cursor-pointer"
          onClick={(e) => {
  const rect = canvasRef.current?.getBoundingClientRect();
  if (!rect) return;
  
  // Calculate where the click happened relative to the center
  const x = e.clientX - rect.left - rect.width / 2;
  const y = e.clientY - rect.top - rect.height / 2;

  // Move in the direction of the click
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