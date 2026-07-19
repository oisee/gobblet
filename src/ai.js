// ИИ на alpha-beta с упорядочиванием ходов поверхностной оценкой.
import { topOf, cloneState, applyMove, generateMoves } from './engine.js';

export const WIN_SCORE = 100000;

export function evaluate(state, me) {
  const opp = 1 - me;
  let score = 0;
  for (const line of state.lines) {
    let mine = 0, theirs = 0;
    for (const idx of line) {
      const t = topOf(state.board[idx]);
      if (t) { if (t.player === me) mine++; else theirs++; }
    }
    if (mine > 0 && theirs > 0) continue;       // линия оспорена — нейтрально
    if (mine > 0) score += mine >= 2 ? 40 : 6;
    if (theirs > 0) score -= theirs >= 2 ? 40 : 6;
  }
  // небольшой бонус за контроль центра (нечётная доска)
  const N = state.v.boardSize;
  if (N % 2 === 1) {
    const c = (N * N - 1) / 2;
    const t = topOf(state.board[c]);
    if (t) score += (t.player === me ? 3 : -3);
  }
  return score;
}

export function search(state, depth, alpha, beta, me) {
  if (state.winner !== null) {
    return state.winner === me ? WIN_SCORE - (20 - depth) : -WIN_SCORE + (20 - depth);
  }
  if (depth === 0) return evaluate(state, me);

  const p = state.turn;
  const moves = generateMoves(state, p);
  if (moves.length === 0) return evaluate(state, me);

  const scored = moves.map(m => {
    const c = applyMove(cloneState(state), m);
    return { c, s: evaluate(c, p) };
  });
  scored.sort((a, b) => b.s - a.s);

  if (p === me) {
    let best = -Infinity;
    for (const { c } of scored) {
      const val = search(c, depth - 1, alpha, beta, me);
      if (val > best) best = val;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const { c } of scored) {
      const val = search(c, depth - 1, alpha, beta, me);
      if (val < best) best = val;
      if (best < beta) beta = best;
      if (alpha >= beta) break;
    }
    return best;
  }
}

// Топ-N лучших ходов для игрока me (для режима подсказок).
// Возвращает [{move, score}] по убыванию оценки.
export function topMoves(state, me, depth, n) {
  const moves = generateMoves(state, me);
  // предварительная сортировка ускоряет отсечения в полном поиске
  const pre = moves.map(m => {
    const c = applyMove(cloneState(state), m);
    return { m, s: evaluate(c, me) };
  });
  pre.sort((a, b) => b.s - a.s);
  const ranked = pre.map(({ m }) => {
    const c = applyMove(cloneState(state), m);
    return { move: m, score: search(c, depth - 1, -Infinity, Infinity, me) };
  });
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, n);
}

// Принципиальная вариация: цепочка лучших ходов на maxPlies полуходов вперёд.
// Возвращает [{pre, move, post, player, score}] — состояния до/после каждого хода.
export function principalVariation(state, depth, maxPlies) {
  const line = [];
  let cur = cloneState(state);
  for (let k = 0; k < maxPlies; k++) {
    if (cur.winner !== null) break;
    const best = topMoves(cur, cur.turn, depth, 1)[0];
    if (!best) break;
    const pre = cloneState(cur);
    applyMove(cur, best.move);
    line.push({ pre, move: best.move, post: cloneState(cur), player: pre.turn, score: best.score });
  }
  return line;
}

export function chooseAIMove(state, me, depth) {
  const moves = generateMoves(state, me);
  let bestMove = null, bestVal = -Infinity;
  const scored = moves.map(m => {
    const c = applyMove(cloneState(state), m);
    return { m, c, s: evaluate(c, me) };
  });
  scored.sort((a, b) => b.s - a.s);
  for (const { m, c } of scored) {
    const val = search(c, depth - 1, -Infinity, Infinity, me);
    if (val > bestVal) { bestVal = val; bestMove = m; }
  }
  return bestMove;
}
