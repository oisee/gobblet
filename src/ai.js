// ИИ на alpha-beta с упорядочиванием ходов поверхностной оценкой
// и транспозиционной таблицей на симметрийном canonicalKey.
import { topOf, cloneState, applyMove, generateMoves, zobristKey, computeZobrist } from './engine.js';

export const WIN_SCORE = 100000;

// ---- Транспозиционная таблица ----
// Ключ — canonicalKey (8 симметрий доски). Значение — с точки зрения игрока `me`,
// поэтому таблица валидна, пока `me` не сменился; при смене — сбрасываем.
// flag: 0 EXACT, 1 LOWER (истина ≥ value), 2 UPPER (истина ≤ value).
const TT_EXACT = 0, TT_LOWER = 1, TT_UPPER = 2, TT_CAP = 1_500_000;
let TT = new Map();
let TT_ME = -1;
let TT_ON = true;
export function ttStats() { return { size: TT.size, me: TT_ME }; }
export function ttReset() { TT = new Map(); TT_ME = -1; }
export function setTT(on) { TT_ON = !!on; if (!on) ttReset(); } // для бенчмарка/сравнения

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

const moveEq = (a, b) => a.kind === b.kind && a.size === b.size && a.to === b.to && a.index === b.index;

export function search(state, depth, alpha, beta, me) {
  if (me !== TT_ME) { TT = new Map(); TT_ME = me; } // таблица валидна только для этого me
  if (state.winner !== null) {
    return state.winner === me ? WIN_SCORE - (20 - depth) : -WIN_SCORE + (20 - depth);
  }
  if (depth === 0) return evaluate(state, me);

  const alphaOrig = alpha, betaOrig = beta;
  const key = TT_ON ? zobristKey(state) : null;
  let ttBest = null;
  if (TT_ON) {
    const e = TT.get(key);
    if (e) {
      ttBest = e.best;
      if (e.depth >= depth) {
        if (e.flag === TT_EXACT) return e.value;
        if (e.flag === TT_LOWER) { if (e.value > alpha) alpha = e.value; }
        else if (e.value < beta) beta = e.value;         // TT_UPPER
        if (alpha >= beta) return e.value;
      }
    }
  }

  const p = state.turn;
  const moves = generateMoves(state, p);
  if (moves.length === 0) return evaluate(state, me);

  const scored = moves.map(m => {
    const c = applyMove(cloneState(state), m);
    return { m, c, s: evaluate(c, p) };
  });
  scored.sort((a, b) => b.s - a.s);
  if (ttBest) { // лучший ход из TT — первым (главный ускоритель)
    const i = scored.findIndex(x => moveEq(x.m, ttBest));
    if (i > 0) scored.unshift(scored.splice(i, 1)[0]);
  }

  let best, bestMove = null;
  if (p === me) {
    best = -Infinity;
    for (const { m, c } of scored) {
      const val = search(c, depth - 1, alpha, beta, me);
      if (val > best) { best = val; bestMove = m; }
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
  } else {
    best = Infinity;
    for (const { m, c } of scored) {
      const val = search(c, depth - 1, alpha, beta, me);
      if (val < best) { best = val; bestMove = m; }
      if (best < beta) beta = best;
      if (alpha >= beta) break;
    }
  }

  if (TT_ON) {
    const flag = best <= alphaOrig ? TT_UPPER : (best >= betaOrig ? TT_LOWER : TT_EXACT);
    if (TT.size > TT_CAP) TT.clear();
    TT.set(key, { depth, value: best, flag, best: bestMove });
  }
  return best;
}

// Топ-N лучших ходов для игрока me (для режима подсказок).
// Возвращает [{move, score}] по убыванию оценки.
export function topMoves(state, me, depth, n) {
  state.zh = computeZobrist(state);   // якорим корень: дальше zh инкрементально верен
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
  state.zh = computeZobrist(state);   // якорим корень
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
