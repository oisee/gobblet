// Политика уровней компьютера — DOM-независимая (используется и в UI, и в headless).
import { generateMoves, applyMove, cloneState, threatsFor } from './engine.js';
import { chooseAIMove } from './ai.js';

// random — доля случайных ходов; depth — глубина «серьёзного» хода ('max' по варианту);
// tactical — реактивная тактика (ловит выигрыш/шах, иначе случайно).
export const AI_LEVELS = {
  balbes: { random: 1.0, depth: 1 },
  novice: { random: 0.5, depth: 2 },
  amateur: { tactical: true, depth: 2 },
  student: { random: 0.2, depth: 2 },
  club: { random: 0.0, depth: 2 },
  medium: { random: 0.0, depth: 3 },
  hard: { random: 0.0, depth: 'max' },
};
export const LEVEL_ORDER = ['balbes', 'novice', 'amateur', 'student', 'club', 'medium', 'hard'];
export function maxDepth(v) { return v.boardSize >= 4 ? 4 : 5; }

// Выбор хода по уровню. rng() ∈ [0,1) — для воспроизводимости можно передать сид-PRNG.
export function pickMove(state, levelKey, rng = Math.random) {
  const lvl = AI_LEVELS[levelKey] || AI_LEVELS.medium;
  const me = state.turn, opp = 1 - me;
  const moves = generateMoves(state, me);
  if (!moves.length) return null;
  const rnd = (arr) => arr[(rng() * arr.length) | 0];

  if (lvl.tactical) {
    for (const m of moves) { const c = applyMove(cloneState(state), m); if (c.winner === me) return m; } // выиграть
    if (threatsFor(state, opp).size > 0) {                            // снять угрозу
      const kills = []; let best = null, bestT = Infinity;
      for (const m of moves) {
        const c = applyMove(cloneState(state), m);
        if (c.winner === opp) continue;
        const tt = threatsFor(c, opp).size;
        if (tt === 0) kills.push(m);
        if (tt < bestT) { bestT = tt; best = m; }
      }
      if (kills.length) return rnd(kills);
      if (best) return best;
    }
    const safe = moves.filter(m => applyMove(cloneState(state), m).winner !== opp);
    return rnd(safe.length ? safe : moves);
  }

  if (lvl.random > 0 && rng() < lvl.random) return rnd(moves);
  const d = lvl.depth === 'max' ? maxDepth(state.v) : lvl.depth;
  return chooseAIMove(state, me, d);
}
