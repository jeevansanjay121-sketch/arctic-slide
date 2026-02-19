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
  // Simple generator based on level index
  const size = Math.min(6 + Math.floor(level / 10), 15);
  const grid: Tile[][] = Array(size).fill(0).map(() => Array(size).fill('.'));
  
  // Randomly place obstacles and a fish
  const seed = level * 12345;
  const pseudoRandom = (s: number) => Math.sin(s) * 10000 % 1;
  
  for (let i = 0; i < size * 2; i++) {
    const rx = Math.floor(Math.abs(pseudoRandom(seed + i)) * size);
    const ry = Math.floor(Math.abs(pseudoRandom(seed + i * 2)) * size);
    if (grid[ry][rx] === '.') grid[ry][rx] = 'X';
  }
  
  grid[0][0] = 'P';
  grid[size - 1][size - 1] = 'G';
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
          ctx.fillStyle = tile === 'X' ? COLORS.wall : tile === '~' ? COLORS.water : COLORS.ice;
          ctx.fillRect(x * size, y * size, size - 1, size - 1);
          if (tile === 'G') {
            ctx.fillStyle = COLORS.fish;
            ctx.beginPath();
            ctx.ellipse(x * size + size / 2, y * size + size / 2, size * 0.3, size * 0.2, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        });
      });

      // Draw Penguin
      const px = pos.x * size + size / 2;
      const py = pos.y * size + size / 2;
      ctx.fillStyle = status === 'lost' ? '#60A5FA' : COLORS.penguinBody;
      ctx.beginPath();
      ctx.arc(px, py, size * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFF';
      ctx.beginPath();
      ctx.arc(px, py + size * 0.1, size * 0.2, 0, Math.PI * 2);
      ctx.fill();

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