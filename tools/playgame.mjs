// Одна партия компьютер-против-компьютера, headless и воспроизводимо (по сиду).
import { VARIANTS } from '../src/variants.js';
import { newGame, applyMove } from '../src/engine.js';
import { pickMove } from '../src/players.js';
import { setQuiesce } from '../src/ai.js';
import { moveCompact, checkSuffix } from '../src/notation.js';

// Детерминированный PRNG (mulberry32) — воспроизводимость партий по сиду.
export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function posKey(s) {
  const b = s.board.map(st => st.map(p => p.player + '' + p.size).join('.')).join('|');
  const h = s.hands.map(hh => hh.map(st => st.join('')).join(',')).join(';');
  return b + '#' + h + '#' + s.turn;
}

// white/black — ключи уровней. openingPlies — сколько первых полуходов сыграть случайно
// (диверсификация дебютов). Возвращает запись партии для базы.
export function playGame({ variantId, white, black, seed = 1, maxPlies = 300, openingPlies = 0, quiesce = false }) {
  setQuiesce(quiesce);
  const v = VARIANTS[variantId];
  const s = newGame(v);
  const rng = mulberry32(seed >>> 0);
  const levels = [white, black];       // 0 = белые/первый, 1 = чёрные/второй
  const seen = new Map();
  seen.set(posKey(s), 1);
  const moves = [];
  let result = 'draw';
  while (moves.length < maxPlies) {
    const mover = s.turn;
    // первые openingPlies полуходов — равномерно случайные (balbes = 100% рандом)
    const level = moves.length < openingPlies ? 'balbes' : levels[mover];
    const mv = pickMove(s, level, rng);
    if (!mv) break;                    // ходов нет — ничья (safety)
    const san = moveCompact(s, mv);
    applyMove(s, mv);
    moves.push(san + checkSuffix(s, mover));
    if (s.winner !== null) { result = s.winner === 0 ? 'white' : 'black'; break; }
    const k = posKey(s);
    const c = (seen.get(k) || 0) + 1; seen.set(k, c);
    if (c >= 3) break;                 // троекратное повторение — ничья
  }
  return {
    variant: variantId, white, black, seed, openingPlies,
    result, winner: result === 'white' ? 0 : result === 'black' ? 1 : null,
    plies: moves.length, moves: moves.join(' '),
  };
}
