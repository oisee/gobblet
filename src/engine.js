// Движок Gobblet: чистые функции, ничего не знают про DOM.
// Состояние (state):
//   v        — вариант
//   board    — массив клеток; каждая клетка — стопка фишек {player,size}, top = последний
//   hands    — hands[player][size] = кол-во доступных фишек в резерве
//   turn     — 0|1
//   winner   — 0|1|null
//   winLine  — массив индексов победной линии | null
//   lines    — предвычисленные линии

export function winLen(v) { return v.boardSize; }

export function makeLines(v) {
  const N = v.boardSize, lines = [];
  const at = (r, c) => r * N + c;
  for (let r = 0; r < N; r++) {
    const row = [], col = [];
    for (let c = 0; c < N; c++) { row.push(at(r, c)); col.push(at(c, r)); }
    lines.push(row, col);
  }
  const d1 = [], d2 = [];
  for (let i = 0; i < N; i++) { d1.push(at(i, i)); d2.push(at(i, N - 1 - i)); }
  lines.push(d1, d2);
  return lines; // при winLength===N это ровно выигрышные линии
}

// Резерв обоих вариантов моделируется единообразно: массив «стопок»,
// каждая стопка — массив размеров, верхняя (доступная) фишка = последний элемент.
//   loose  (3×3): по одной фишке в стопке -> все доступны сразу
//   stacks (4×4): стопки вложены [1,2,3,4], верхняя = самая большая, берётся первой
export function emptyHand(v) {
  const stacks = [];
  if (v.reserve === 'stacks') {
    for (let n = 0; n < v.piecesPerSize; n++) {
      const st = [];
      for (let s = 1; s <= v.sizes; s++) st.push(s); // top = last = самая большая
      stacks.push(st);
    }
  } else {
    for (let s = 1; s <= v.sizes; s++)
      for (let n = 0; n < v.piecesPerSize; n++) stacks.push([s]);
  }
  return stacks;
}

// Верхняя (доступная) фишка стопки резерва.
const topReserve = (st) => (st.length ? st[st.length - 1] : null);

// Забрать из резерва одну фишку размера size (из любой подходящей стопки).
export function takeReserve(hand, size) {
  for (const st of hand) {
    if (st.length && st[st.length - 1] === size) { st.pop(); return true; }
  }
  return false;
}

// Клетки, входящие в линию с >=3 верхними фишками игрока opp (угроза).
function threatCells(state, opp) {
  const cells = new Set();
  for (const line of state.lines) {
    let cnt = 0;
    for (const idx of line) { const t = topOf(state.board[idx]); if (t && t.player === opp) cnt++; }
    if (cnt >= 3)
      for (const idx of line) { const t = topOf(state.board[idx]); if (t && t.player === opp) cells.add(idx); }
  }
  return cells;
}

export function newGame(v) {
  const N = v.boardSize;
  return {
    v,
    board: Array.from({ length: N * N }, () => []),
    hands: [emptyHand(v), emptyHand(v)],
    turn: 0,
    winner: null,
    winLine: null,
    lines: makeLines(v),
    zh: [0, 0], // Zobrist-хэш (пустая доска, ход 0)
  };
}

export const topOf = (stack) => (stack.length ? stack[stack.length - 1] : null);

// Доступные для взятия размеры из резерва игрока (различимые верхние фишки стопок).
export function reserveSizes(state, p) {
  const set = new Set();
  for (const st of state.hands[p]) { const top = topReserve(st); if (top !== null) set.add(top); }
  return [...set].sort((a, b) => a - b);
}

// Легальные клетки-назначения для источника {kind:'hand'|'board', size, index?}.
export function legalTargets(state, src) {
  const v = state.v;
  const mover = state.turn;
  // спец-правило 4×4: фишкой из резерва накрыть фишку соперника можно,
  // только если та входит в линию из 3 (блокирование угрозы).
  const restrict = v.reserveGobbleRule && src.kind === 'hand';
  const threat = restrict ? threatCells(state, 1 - mover) : null;
  const t = [];
  for (let i = 0; i < state.board.length; i++) {
    if (src.kind === 'board' && src.index === i) continue; // нельзя на себя же
    const top = topOf(state.board[i]);
    if (top !== null && top.size >= src.size) continue;     // не помещается
    if (restrict && top !== null && top.player !== mover && !threat.has(i)) continue;
    t.push(i);
  }
  return t;
}

export function cloneState(state) {
  return {
    v: state.v,
    board: state.board.map(st => st.map(pc => ({ player: pc.player, size: pc.size }))),
    hands: state.hands.map(h => h.map(st => st.slice())),
    turn: state.turn,
    winner: state.winner,
    winLine: state.winLine,
    lines: state.lines,
    zh: state.zh ? state.zh.slice() : [0, 0],
  };
}

// Применить ход (мутирует state). move: {kind:'hand'|'board', size, index?, to}
export function applyMove(state, move) {
  const p = state.turn;
  const Z = zobristTable(state.v);
  const zh = state.zh || (state.zh = [0, 0]);
  let piece;
  if (move.kind === 'hand') {
    takeReserve(state.hands[p], move.size);
    piece = { player: p, size: move.size };
    const z = Z.piece[move.to][move.size][p];        // фишка появилась на to
    zh[0] ^= z[0]; zh[1] ^= z[1];
  } else {
    piece = state.board[move.index].pop();
    const zf = Z.piece[move.index][piece.size][piece.player]; // ушла с index
    const zt = Z.piece[move.to][piece.size][piece.player];    // легла на to
    zh[0] ^= zf[0] ^ zt[0]; zh[1] ^= zf[1] ^ zt[1];
  }
  state.board[move.to].push(piece);
  const res = checkWinner(state, p);
  if (res) { state.winner = res.player; state.winLine = res.line; }
  else { state.turn = 1 - p; zh[0] ^= Z.turn[0]; zh[1] ^= Z.turn[1]; } // ход сменился
  return state;
}

// Победитель с учётом правила «вскрытия»: приоритет у сделавшего ход;
// иначе, если вскрылась линия соперника — побеждает соперник.
export function checkWinner(state, mover) {
  const found = { 0: null, 1: null };
  for (const line of state.lines) {
    let owner = -1, ok = true;
    for (const idx of line) {
      const t = topOf(state.board[idx]);
      if (!t) { ok = false; break; }
      if (owner === -1) owner = t.player;
      else if (owner !== t.player) { ok = false; break; }
    }
    if (ok && owner !== -1 && !found[owner]) found[owner] = line;
  }
  if (found[mover]) return { player: mover, line: found[mover] };
  const other = 1 - mover;
  if (found[other]) return { player: other, line: found[other] };
  return null;
}

// Угрозы игрока player («шах»): множество линий, которые player может
// ДОСТРОИТЬ до победы одним ходом (если бы сейчас был его ход).
// Размер множества: 1 — шах, >=2 — двойной шах (форк).
export function threatsFor(state, player) {
  const base = cloneState(state);
  base.turn = player; base.winner = null; base.winLine = null;
  const lines = new Set();
  for (const m of generateMoves(base, player)) {
    const c = cloneState(base);
    applyMove(c, m);
    if (c.winner === player && c.winLine) lines.add(c.winLine); // ссылки на общие line-массивы
  }
  return lines;
}

// ---- Симметрии доски (группа D4) и канонический ключ позиции ----
// Повороты/отражения квадратной доски — автоморфизмы игры (строки/столбцы/диагонали
// переходят друг в друга). Резервы и сторона хода симметрию не меняют. Канонический
// ключ = минимальная сериализация доски по всем 8 симметриям → повороты и зеркала
// одной позиции дают ОДИН ключ. Сжимает пространство состояний до 8× (меньше у краёв).
const SYM_CACHE = {};
export function boardSymmetries(N) {
  if (SYM_CACHE[N]) return SYM_CACHE[N];
  const idx = (r, c) => r * N + c;
  const T = [
    (r, c) => [r, c],                 // id
    (r, c) => [c, N - 1 - r],         // поворот 90
    (r, c) => [N - 1 - r, N - 1 - c], // поворот 180
    (r, c) => [N - 1 - c, r],         // поворот 270
    (r, c) => [r, N - 1 - c],         // отражение по горизонтали
    (r, c) => [N - 1 - r, c],         // отражение по вертикали
    (r, c) => [c, r],                 // транспонирование (гл. диагональ)
    (r, c) => [N - 1 - c, N - 1 - r], // антидиагональ
  ];
  const perms = T.map(f => {
    const perm = new Array(N * N);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const [r2, c2] = f(r, c);
      perm[idx(r2, c2)] = idx(r, c); // клетка назначения ← исходная
    }
    return perm;
  });
  return (SYM_CACHE[N] = perms);
}

const cellStr = (stack) => stack.map(p => p.player + '' + p.size).join('.');
const handsStr = (state) => state.hands.map(hh => hh.map(st => st.join('')).join(',')).join(';');

// Канонический ключ с учётом всех 8 симметрий доски.
export function canonicalKey(state) {
  const cells = state.board.map(cellStr);
  let best = null;
  for (const perm of boardSymmetries(state.v.boardSize)) {
    let s = '';
    for (let j = 0; j < perm.length; j++) s += cells[perm[j]] + '|';
    if (best === null || s < best) best = s;
  }
  return best + '#' + handsStr(state) + '#' + state.turn;
}

// Каноничный ключ ещё и по цвету: нормализуем так, будто ходят всегда «белые».
// Полезно для дебютных книг, где важна позиция «с точки зрения того, кто ходит».
export function canonicalKeyColor(state) {
  const a = canonicalKey(state);
  const swapped = cloneState(state);
  for (const st of swapped.board) for (const pc of st) pc.player = 1 - pc.player;
  swapped.hands = [state.hands[1].map(s => s.slice()), state.hands[0].map(s => s.slice())];
  swapped.turn = 1 - state.turn;
  const b = canonicalKey(swapped);
  return a < b ? a : b;
}

// ---- Zobrist-хэш: инкрементальный ключ позиции (для транспозиций) ----
// Резерв не хэшируем — он выводится из доски. Ключ = XOR по фишкам доски + ход.
// 64 бита как две 32-битных половины [hi, lo].
const ZCACHE = {};
const rnd32 = () => (Math.random() * 0x100000000) >>> 0;
function zobristTable(v) {
  const k = v.boardSize + 'x' + v.sizes;
  if (ZCACHE[k]) return ZCACHE[k];
  const cells = v.boardSize * v.boardSize;
  const piece = [];
  for (let c = 0; c < cells; c++) {
    piece[c] = [];
    for (let s = 0; s <= v.sizes; s++) piece[c][s] = [[rnd32(), rnd32()], [rnd32(), rnd32()]];
  }
  return (ZCACHE[k] = { piece, turn: [rnd32(), rnd32()] });
}
// Полный пересчёт (якорим корень поиска; дальше — инкрементально в applyMove).
export function computeZobrist(state) {
  const Z = zobristTable(state.v);
  let hi = 0, lo = 0;
  for (let c = 0; c < state.board.length; c++)
    for (const pc of state.board[c]) { const z = Z.piece[c][pc.size][pc.player]; hi ^= z[0]; lo ^= z[1]; }
  if (state.turn === 1) { hi ^= Z.turn[0]; lo ^= Z.turn[1]; }
  return [hi >>> 0, lo >>> 0];
}
export function zobristKey(state) { return state.zh[0] + ',' + state.zh[1]; }

// Все легальные ходы игрока p.
export function generateMoves(state, p) {
  const moves = [];
  for (const size of reserveSizes(state, p)) {
    const src = { kind: 'hand', size };
    for (const to of legalTargets(state, src)) moves.push({ kind: 'hand', size, to });
  }
  for (let i = 0; i < state.board.length; i++) {
    const top = topOf(state.board[i]);
    if (top && top.player === p) {
      const src = { kind: 'board', size: top.size, index: i };
      for (const to of legalTargets(state, src)) moves.push({ kind: 'board', size: top.size, index: i, to });
    }
  }
  return moves;
}
