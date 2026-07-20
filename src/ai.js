// ИИ на alpha-beta с упорядочиванием ходов поверхностной оценкой
// и транспозиционной таблицей на симметрийном canonicalKey.
import { topOf, cloneState, applyMove, generateMoves, makeMove, unmakeMove, threatsFor, zobristKey, computeZobrist } from './engine.js';

export const WIN_SCORE = 100000;

// Quiescence: на горизонте не возвращаем статику вслепую, а досчитываем «шумные» линии
// (выигрыш сейчас + вынужденный ответ на угрозу) до тишины — убирает odd-even артефакт.
let QUIESCE = false;   // дорогой (~17×) — вкл явно для анализа/экспериментов
const Q_MAX = 2;
export function setQuiesce(on) { QUIESCE = !!on; }

// Дешёвая проверка угрозы: линия, где все верхние фишки — игрока player и ровно одна пустая
// (можно достроить следующим ходом). Без генерации ходов/клонов.
function hasThreat(state, player) {
  for (const line of state.lines) {
    let mine = 0, empty = 0, foe = 0;
    for (const idx of line) { const t = topOf(state.board[idx]); if (!t) empty++; else if (t.player === player) mine++; else { foe++; break; } }
    if (foe === 0 && empty === 1 && mine === line.length - 1) return true;
  }
  return false;
}
// Мат из quiescence должен быть «дальше» любого реального мата поиска (чтобы не обгонять его в ранжировании).
const qWin = (qd, forMe) => { const v = WIN_SCORE - 20 - (Q_MAX - qd) - 1; return forMe ? v : -v; };

function quiesce(state, alpha, beta, me, qd) {
  const p = state.turn, opp = 1 - p;
  for (const m of generateMoves(state, p)) {          // 1) немедленный выигрыш ходящего
    const u = makeMove(state, m); const w = state.winner === p; unmakeMove(state, m, u);
    if (w) return qWin(qd, p === me);
  }
  const stand = evaluate(state, me);
  if (qd <= 0 || !hasThreat(state, opp)) return stand;  // тихо
  const maxing = (p === me);                            // 2) соперник грозит — перебираем ответы
  let best = maxing ? -Infinity : Infinity;
  for (const m of generateMoves(state, p)) {
    const u = makeMove(state, m);
    const v = (state.winner === opp) ? qWin(qd, !maxing) : quiesce(state, alpha, beta, me, qd - 1);
    unmakeMove(state, m, u);
    if (maxing) { if (v > best) best = v; if (best > alpha) alpha = best; }
    else { if (v < best) best = v; if (best < beta) beta = best; }
    if (alpha >= beta) break;
  }
  return best;
}

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
  if (depth === 0) return QUIESCE ? quiesce(state, alpha, beta, me, Q_MAX) : evaluate(state, me);

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

  // упорядочивание через make/unmake (без клонирования)
  const scored = moves.map(m => {
    const u = makeMove(state, m); const s = evaluate(state, p); unmakeMove(state, m, u);
    return { m, s };
  });
  scored.sort((a, b) => b.s - a.s);
  if (ttBest) { // лучший ход из TT — первым
    const i = scored.findIndex(x => moveEq(x.m, ttBest));
    if (i > 0) scored.unshift(scored.splice(i, 1)[0]);
  }

  let best, bestMove = null;
  if (p === me) {
    best = -Infinity;
    for (const { m } of scored) {
      const u = makeMove(state, m);
      const val = search(state, depth - 1, alpha, beta, me);
      unmakeMove(state, m, u);
      if (val > best) { best = val; bestMove = m; }
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
  } else {
    best = Infinity;
    for (const { m } of scored) {
      const u = makeMove(state, m);
      const val = search(state, depth - 1, alpha, beta, me);
      unmakeMove(state, m, u);
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
  const pre = moves.map(m => {
    const u = makeMove(state, m); const s = evaluate(state, me); unmakeMove(state, m, u);
    return { m, s };
  });
  pre.sort((a, b) => b.s - a.s);
  const ranked = pre.map(({ m }) => {
    const u = makeMove(state, m);
    const score = search(state, depth - 1, -Infinity, Infinity, me);
    unmakeMove(state, m, u);
    return { move: m, score };
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
    const u = makeMove(state, m); const s = evaluate(state, me); unmakeMove(state, m, u);
    return { m, s };
  });
  scored.sort((a, b) => b.s - a.s);
  for (const { m } of scored) {
    const u = makeMove(state, m);
    const val = search(state, depth - 1, -Infinity, Infinity, me);
    unmakeMove(state, m, u);
    if (val > bestVal) { bestVal = val; bestMove = m; }
  }
  return bestMove;
}
