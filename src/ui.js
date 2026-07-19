// Рендер и ввод. Знает про DOM; логику держит в движке/ИИ.
import { VARIANTS, } from './variants.js';
import { newGame, winLen, topOf, legalTargets, cloneState, applyMove, reserveSizes, threatsFor } from './engine.js';
import { topMoves, principalVariation, search, evaluate, WIN_SCORE } from './ai.js';
import { LEVEL_ORDER, maxDepth, pickMove } from './players.js';
import { moveCompact, checkSuffix, sizeLetter, setLabelStyle, squareName } from './notation.js';
import { t, setLanguage, LANGUAGES } from './i18n.js';

// Имена игроков по действующей палитре (локализуемые).
function playerNames(pal) { return [t('players.' + pal + '.0'), t('players.' + pal + '.1')]; }

// Развёрнутое описание хода (локализованное) — для панели подсказок.
function moveVerboseL(state, move) {
  const v = state.v, me = state.turn;
  const sz = t('piece.' + move.size);
  const cap = sz.charAt(0).toUpperCase() + sz.slice(1);
  const dst = squareName(v, move.to);
  const covered = topOf(state.board[move.to]);
  const cover = covered
    ? t(covered.player === me ? 'verbose.coverOwn' : 'verbose.coverOpp', { size: t('piece.' + covered.size) })
    : '';
  if (move.kind === 'hand') return t('verbose.reserve', { size: cap, sq: dst, cover });
  return t('verbose.move', { size: cap, from: squareName(v, move.index), to: dst, cover });
}

// Применить перевод ко всем статическим [data-i18n] элементам.
function applyStaticI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
}

// Перезаполнить оба списка уровней локализованными названиями (сохранив выбор).
function refreshLevelSelects() {
  for (const id of ['setLevel0', 'setLevel1']) {
    const sel = $(id);
    if (!sel) continue;
    const val = sel.value;
    sel.innerHTML = LEVEL_ORDER.map(k => `<option value="${k}">${t('level.' + k)}</option>`).join('');
    if (val) sel.value = val;
  }
}

const UI = {
  state: null,
  history: [],       // стек состояний для undo
  moves: [],         // запись партии: [{text, player}]
  selected: null,    // {kind:'hand',size} | {kind:'board',index}
  hints: [],         // подсказанные ходы [{move, score, reply}], до 2
  mode: 'hotseat',
  busy: false,
  autorun: false,        // Комп↔Комп играет только после «Играть»
  assist: 'off',         // 'off' | 'analysis' | 'coach'
  analysisResult: null,  // {scoreP0, lines, mate, depth, deepening}
  analysisToken: 0,      // защита от устаревших асинхронных вычислений
  coachWarn: null,       // предупреждение тренера о слабом ходе
  coachToken: 0,
  draw: false,           // ничья по троекратному повторению
  settings: { palette: 'auto', labels: 'letters', levels: ['medium', 'medium'], language: 'ru' },
};

function analysisOn() { return UI.assist !== 'off'; }        // рейтинг/анализ/тренер — считаем оценку
function linesOn() { return UI.assist === 'analysis' || UI.assist === 'coach'; } // показывать линии
function coachOn() { return UI.assist === 'coach'; }

// Ключ позиции для детекции повторения (доска + резервы + чей ход).
function positionKey(s) {
  const b = s.board.map(st => st.map(p => p.player + '' + p.size).join('.')).join('|');
  const h = s.hands.map(hh => hh.map(st => st.join('')).join(',')).join(';');
  return b + '#' + h + '#' + s.turn;
}
// Троекратное повторение по всем достигнутым позициям (история + текущая).
function repetitionDraw() {
  const counts = new Map();
  let max = 0;
  for (const s of [...UI.history, UI.state]) {
    const k = positionKey(s);
    const c = (counts.get(k) || 0) + 1;
    counts.set(k, c);
    if (c > max) max = c;
  }
  return max >= 3;
}
// Список ходов для оверлея на доске: ручная подсказка, иначе (в «Тренере») — лучшие линии.
function overlayList() {
  if (UI.hints.length) return UI.hints.map((h, i) => ({ move: h.move, rank: i + 1 }));
  if (coachOn() && UI.analysisResult && UI.analysisResult.lines)
    return UI.analysisResult.lines.map((ln, i) => ({ move: ln.pv[0].move, rank: i + 1 }));
  return [];
}

function loadSettings() {
  const def = { palette: 'auto', labels: 'letters', levels: ['medium', 'medium'], language: 'ru' };
  try {
    const raw = localStorage.getItem('gobblet.settings');
    if (raw) {
      const s = Object.assign(def, JSON.parse(raw));
      if (!Array.isArray(s.levels)) s.levels = ['medium', s.difficulty || 'medium']; // совместимость
      return s;
    }
  } catch (_) {}
  return def;
}
function saveSettings() {
  try { localStorage.setItem('gobblet.settings', JSON.stringify(UI.settings)); } catch (_) {}
}
// Действующая палитра: 'auto' берёт дефолт варианта, иначе — выбор пользователя.
function effPalette() {
  const s = UI.settings.palette;
  return (s === 'auto') ? (UI.state.v.palette || 'rb') : s;
}
// Является ли данный игрок компьютером в текущем режиме.
function isAI(player) {
  if (UI.mode === 'cvc') return true;
  if (UI.mode === 'ai') return player === 1; // человек ходит первым
  return false;
}
// Ход компьютера по уровню игрока (логика — в players.js, общая с headless).
function aiPickMove(state) { return pickMove(state, UI.settings.levels[state.turn]); }
// PV → цветная строка нотации: ход1 → ход2 → …
function pvToHtml(line) {
  return line.map(step => {
    const san = moveCompact(step.pre, step.move) + checkSuffix(step.post, step.player);
    return `<span class="pv-mv p${step.player}">${san}</span>`;
  }).join('<span class="pv-sep">→</span>');
}

// Храним ход и суффикс; сам текст (с учётом стиля подписей) пересчитываем при рендере
// из парного пред-хода состояния UI.history[i]. Суффикс +/++/# — из состояния после хода.
function recordMove(preState, move) {
  UI.moves.push({ move, player: preState.turn, mover: preState.turn, suffix: '', pending: true });
}
function finishRecord() {
  const last = UI.moves[UI.moves.length - 1];
  if (last && last.pending) { last.suffix = checkSuffix(UI.state, last.mover); last.pending = false; }
}

const $ = (id) => document.getElementById(id);

function pieceDiameter(v, size) {
  const base = 24, step = 13;
  return base + (size - 1) * step + (v.sizes <= 3 ? 8 : 0);
}

function makePieceEl(v, player, size, draggable) {
  const el = document.createElement('div');
  const d = pieceDiameter(v, size);
  el.className = 'piece p' + player;
  el.style.width = d + 'px';
  el.style.height = d + 'px';
  el.style.fontSize = Math.round(d * 0.4) + 'px';
  el.textContent = sizeLetter(v, size); // буква размера: S M L X
  if (draggable) el.setAttribute('draggable', 'true');
  return el;
}

// текущий человек может взаимодействовать (не ИИ, не занято, нет победителя)
function interactive() {
  const st = UI.state;
  if (st.winner !== null || UI.draw || UI.busy) return false;
  if (isAI(st.turn)) return false;
  return true;
}

function selectedSrc() {
  const st = UI.state, sel = UI.selected;
  if (!sel) return null;
  if (sel.kind === 'hand') return { kind: 'hand', size: sel.size };
  const top = topOf(st.board[sel.index]);
  if (!top) return null;
  return { kind: 'board', size: top.size, index: sel.index };
}

function currentLegalTargets() {
  const src = selectedSrc();
  if (!src || !interactive()) return new Set();
  return new Set(legalTargets(UI.state, src));
}

// Разметка подсказок: куда ставить (toCell), откуда двигать (fromCell),
// какую фишку из резерва брать (handSize). Значение — ранг подсказки (1..2).
function hintDecorations() {
  const toCell = new Map(), fromCell = new Map(), handSize = new Map();
  overlayList().forEach(({ move: m, rank }) => {
    if (!toCell.has(m.to)) toCell.set(m.to, rank);
    if (m.kind === 'board') { if (!fromCell.has(m.index)) fromCell.set(m.index, rank); }
    else { if (!handSize.has(m.size)) handSize.set(m.size, rank); }
  });
  return { toCell, fromCell, handSize };
}

function render() {
  const st = UI.state, v = st.v, N = v.boardSize;
  $('variantSub').textContent = `${v.name} · ${t('app.tagline', { n: winLen(v) })}`;
  const app = $('app');
  const pal = effPalette();
  if (app) { app.classList.remove('pal-rb', 'pal-bw'); app.classList.add('pal-' + pal); }
  const names = playerNames(pal);

  const board = $('board');
  board.style.gridTemplateColumns = `repeat(${N},1fr)`;
  board.innerHTML = '';
  const legalSet = currentLegalTargets();
  const hints = hintDecorations();
  const cells = new Array(N * N);
  // призрак постановки из резерва: полупрозрачная фишка на клетке назначения
  const ghostAt = new Map();
  overlayList().forEach(({ move: m, rank }) => {
    if (m.kind === 'hand' && !ghostAt.has(m.to)) ghostAt.set(m.to, { size: m.size, rank });
  });
  for (let i = 0; i < N * N; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.index = i;
    cells[i] = cell;
    const stack = st.board[i];
    const top = topOf(stack);
    if (top) {
      const canDrag = !st.winner && top.player === st.turn && interactive();
      const pe = makePieceEl(v, top.player, top.size, canDrag);
      if (UI.selected && UI.selected.kind === 'board' && UI.selected.index === i) pe.classList.add('sel');
      if (canDrag) {
        pe.addEventListener('dragstart', e => onDragStart(e, { kind: 'board', size: top.size, index: i }));
        pe.addEventListener('dragend', onDragEnd);
      }
      cell.appendChild(pe);
      if (stack.length > 1) {
        const b = document.createElement('div');
        b.className = 'stackbadge';
        b.textContent = '×' + stack.length;
        cell.appendChild(b);
      }
    }
    if (UI.selected && UI.selected.kind === 'board' && UI.selected.index === i) cell.classList.add('selsrc');
    if (legalSet.has(i)) cell.classList.add('legal');
    if (st.winLine && st.winLine.includes(i)) cell.classList.add('win');
    if (hints.fromCell.has(i)) cell.classList.add('hintfrom');
    if (hints.toCell.has(i)) {
      cell.classList.add('hintto', 'hint' + hints.toCell.get(i));
      const hb = document.createElement('div');
      hb.className = 'hintbadge';
      hb.textContent = hints.toCell.get(i);
      cell.appendChild(hb);
    }
    if (ghostAt.has(i)) {
      const g = ghostAt.get(i);
      const ge = makePieceEl(v, st.turn, g.size, false);
      ge.classList.add('ghost', 'hint' + g.rank);
      cell.appendChild(ge);
    }

    cell.addEventListener('click', () => onCellClick(i));
    cell.addEventListener('dragover', e => { if (legalSet.has(i)) e.preventDefault(); });
    cell.addEventListener('drop', e => { e.preventDefault(); onDrop(i); });
    board.appendChild(cell);
  }
  drawArrows(board, cells); // стрелки для ходов-перестановок

  // подписи доски: файлы a..d снизу, ранги N..1 слева
  const filesHost = $('files'), ranksHost = $('ranks');
  if (filesHost) { filesHost.innerHTML = ''; for (let c = 0; c < N; c++) { const s = document.createElement('span'); s.textContent = String.fromCharCode(97 + c); filesHost.appendChild(s); } }
  if (ranksHost) { ranksHost.innerHTML = ''; for (let r = 0; r < N; r++) { const s = document.createElement('span'); s.textContent = String(N - r); ranksHost.appendChild(s); } }

  renderRack(0);
  renderRack(1);
  const live = !st.winner && !UI.draw;
  $('rack0').classList.toggle('active', live && st.turn === 0);
  $('rack1').classList.toggle('active', live && st.turn === 1);

  const who0 = $('who0'), who1 = $('who1');
  if (who0) { who0.textContent = names[0]; who0.style.color = 'var(--p0)'; }
  if (who1) { who1.textContent = names[1]; who1.style.color = 'var(--p1)'; }

  // уровни игроков в настройках: подписи по именам, значения, доступность (только для компьютеров)
  const ll0 = $('lvlLabel0'), ll1 = $('lvlLabel1'), ls0 = $('setLevel0'), ls1 = $('setLevel1');
  if (ll0) ll0.textContent = t('settings.levelFor', { name: names[0] });
  if (ll1) ll1.textContent = t('settings.levelFor', { name: names[1] });
  if (ls0) { ls0.value = UI.settings.levels[0]; ls0.disabled = false; } // всегда можно выставить заранее
  if (ls1) { ls1.value = UI.settings.levels[1]; ls1.disabled = false; }

  const dot = $('turnDot'), text = $('statusText');
  if (st.winner !== null) {
    dot.style.background = st.winner === 0 ? 'var(--p0)' : 'var(--p1)';
    text.innerHTML = `<span class="win-banner">${t('status.win', { name: names[st.winner] })}</span>`;
  } else if (UI.draw) {
    dot.style.background = 'var(--muted)';
    text.innerHTML = `<span class="draw-banner">${t('status.draw')}</span>`;
  } else {
    dot.style.background = st.turn === 0 ? 'var(--p0)' : 'var(--p1)';
    const aiTurn = isAI(st.turn);
    const base = aiTurn ? t('status.thinking') : t('status.turn', { name: names[st.turn] });
    const nThreat = threatsFor(st, 1 - st.turn).size;
    const chk = nThreat >= 2 ? ` · <span class="check">${t('check.double')}</span>`
      : nThreat === 1 ? ` · <span class="check">${t('check.single')}</span>` : '';
    text.innerHTML = base + chk;
  }
  $('undo').disabled = UI.history.length === 0 || UI.busy;
  $('hint').disabled = !interactive();
  const copyBtn = $('copyNotation');
  if (copyBtn) copyBtn.disabled = UI.moves.length === 0;

  // Играть/Пауза — только в режиме Комп↔Комп
  const pp = $('playpause');
  if (pp) {
    if (UI.mode === 'cvc') { pp.style.display = ''; pp.textContent = UI.autorun ? t('btn.pause') : t('btn.play'); }
    else pp.style.display = 'none';
  }

  // помощник — выпадающий список: синхронизируем значение
  const asel = $('assist');
  if (asel) asel.value = UI.assist;

  // баннер тренера о слабом ходе
  const cb = $('coachbar');
  if (cb) {
    if (coachOn() && UI.coachWarn) {
      const w = UI.coachWarn;
      cb.style.display = '';
      cb.innerHTML = `<span class="cw-text">${t(w.severe ? 'coach.weakStrong' : 'coach.weak', { best: `<b>${w.bestSan}</b>` })}</span>` +
        `<button id="coachUndo" class="cw-btn">${t('coach.undo')}</button>`;
      const cu = $('coachUndo');
      if (cu) cu.addEventListener('click', (e) => { e.stopPropagation(); undo(); });
    } else { cb.style.display = 'none'; cb.innerHTML = ''; }
  }

  renderScoresheet();
  renderHints();
  renderAnalysis();
}

// Стрелки для ходов-перестановок (доска→доска). SVG-оверлей поверх сетки.
function drawArrows(board, cells) {
  const old = board.querySelector('svg.arrows');
  if (old) old.remove();
  const moves = overlayList().map(o => ({ m: o.move, rank: o.rank })).filter(x => x.m.kind === 'board');
  if (moves.length === 0) return;
  const W = board.clientWidth, H = board.clientHeight;
  if (!W || !H) return;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'arrows');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const colors = { 1: '#f5c542', 2: '#6ea8fe' };
  const defs = document.createElementNS(NS, 'defs');
  for (const rank of [1, 2]) {
    const mk = document.createElementNS(NS, 'marker');
    mk.setAttribute('id', 'ah' + rank);
    mk.setAttribute('viewBox', '0 0 10 10'); mk.setAttribute('refX', '7'); mk.setAttribute('refY', '5');
    mk.setAttribute('markerWidth', '6'); mk.setAttribute('markerHeight', '6'); mk.setAttribute('orient', 'auto-start-reverse');
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', 'M0,0 L10,5 L0,10 z'); p.setAttribute('fill', colors[rank]);
    mk.appendChild(p); defs.appendChild(mk);
  }
  svg.appendChild(defs);
  for (const { m, rank } of moves) {
    const s = cells[m.index], d = cells[m.to];
    if (!s || !d) continue;
    let sx = s.offsetLeft + s.offsetWidth / 2, sy = s.offsetTop + s.offsetHeight / 2;
    let dx = d.offsetLeft + d.offsetWidth / 2, dy = d.offsetTop + d.offsetHeight / 2;
    const ang = Math.atan2(dy - sy, dx - sx), pull = s.offsetWidth * 0.32;
    sx += Math.cos(ang) * pull; sy += Math.sin(ang) * pull;
    dx -= Math.cos(ang) * pull; dy -= Math.sin(ang) * pull;
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', sx); line.setAttribute('y1', sy);
    line.setAttribute('x2', dx); line.setAttribute('y2', dy);
    line.setAttribute('stroke', colors[rank]); line.setAttribute('stroke-width', '5');
    line.setAttribute('stroke-linecap', 'round'); line.setAttribute('marker-end', 'url(#ah' + rank + ')');
    line.setAttribute('opacity', '0.92');
    svg.appendChild(line);
  }
  board.appendChild(svg);
}

// Запись партии в две колонки (Красные / Синие), как бланк.
function renderScoresheet() {
  const host = $('scoresheet');
  if (!host) return;
  if (UI.moves.length === 0) { host.innerHTML = `<div class="sheet-empty">${t('scoresheet.empty')}</div>`; return; }
  let rows = '';
  for (let i = 0; i < UI.moves.length; i += 2) {
    const n = i / 2 + 1;
    rows += `<div class="sheet-row"><span class="sheet-n">${n}.</span><span class="sheet-m p0">${moveText(i)}</span><span class="sheet-m p1">${moveText(i + 1)}</span></div>`;
  }
  host.innerHTML = rows;
  host.scrollTop = host.scrollHeight;
}

// Панель подсказок: топ-2 хода с оценкой и ответом соперника.
function renderHints() {
  const host = $('hintpanel');
  if (!host) return;
  if (UI.hints.length === 0) { host.style.display = 'none'; host.innerHTML = ''; return; }
  host.style.display = '';
  let html = `<div class="hp-title">${t('hint.title')}</div>`;
  UI.hints.forEach((h, i) => {
    const rank = i + 1;
    const verbose = moveVerboseL(UI.state, h.move);
    const tail = (h.pv || []).slice(1); // продолжение после самого хода
    const cont = tail.length ? `<div class="hp-pv">${t('hint.next')} ${pvToHtml(tail)}</div>` : '';
    html += `<div class="hp-row hint${rank}"><span class="hp-badge">${rank}</span>` +
      `<span class="hp-move">${verbose}</span>` +
      `<span class="hp-eval">${evalLabel(h.score)}</span></div>${cont}`;
  });
  host.innerHTML = html;
}

/* ---- режим анализа: живая оценка позиции ---- */
// Оценка позиции с точки зрения игрока 0 (белые/красные): + хорошо для p0.
// withLines=false (режим «Рейтинг») — считаем только оценку, без построения линий.
function analyze(state, depth, withLines) {
  if (state.winner !== null) {
    return { mate: true, scoreP0: state.winner === 0 ? WIN_SCORE : -WIN_SCORE, lines: [], depth };
  }
  const me = state.turn;
  const tops = topMoves(state, me, depth, withLines ? 2 : 1);
  let lines = [];
  if (withLines) {
    const maxPlies = Math.min(12, depth + 4);                        // полная линия — сколько влезает
    const pvDepth = Math.min(depth, state.v.boardSize >= 4 ? 3 : 4); // глубина продолжения
    lines = tops.map(t => {
      const child = applyMove(cloneState(state), t.move);
      const head = { pre: cloneState(state), move: t.move, post: cloneState(child), player: me, score: t.score };
      const tail = child.winner === null ? principalVariation(child, pvDepth, maxPlies - 1) : [];
      return { pv: [head, ...tail], score: t.score }; // score — с точки зрения ходящего
    });
  }
  const scoreP0 = tops.length
    ? (me === 0 ? tops[0].score : -tops[0].score)
    : (me === 0 ? 1 : -1) * evaluate(state, me);
  return { mate: Math.abs(scoreP0) >= WIN_SCORE - 100, scoreP0, lines, depth };
}

// Итеративное углубление: старт с ANALYSIS_START, дальше лесенкой глубже в фоне,
// пока каждый уровень укладывается в бюджет времени. Между уровнями уступаем поток.
const ANALYSIS_START = 4;
const ANALYSIS_BUDGET_MS = 700;
function analysisCeiling(v) { return v.boardSize >= 4 ? 6 : 7; }

function scheduleAnalysis() {
  const token = ++UI.analysisToken;
  if (!analysisOn()) { UI.analysisResult = null; renderAnalysis(); return; }
  UI.analysisResult = null; // «считаю…», пока не готов первый уровень
  renderAnalysis();
  const snap = cloneState(UI.state);
  const ceiling = analysisCeiling(snap.v);
  const withLines = linesOn();
  const step = (d) => {
    if (token !== UI.analysisToken) return;         // позиция сменилась — бросаем
    const t0 = (typeof performance !== 'undefined') ? performance.now() : 0;
    const res = analyze(snap, d, withLines);
    const elapsed = ((typeof performance !== 'undefined') ? performance.now() : 0) - t0;
    if (token !== UI.analysisToken) return;
    res.deepening = d < ceiling && !res.mate && elapsed < ANALYSIS_BUDGET_MS;
    UI.analysisResult = res;
    renderAnalysis();
    if (res.deepening) setTimeout(() => step(d + 1), 0); // углубляемся, отпустив поток
  };
  setTimeout(() => step(ANALYSIS_START), 20);
}

function renderAnalysis() {
  const host = $('analysisPanel');
  const lineHost = $('analysisLine');
  if (!host) return;
  if (!analysisOn()) { host.style.display = 'none'; if (lineHost) lineHost.style.display = 'none'; return; }
  host.style.display = '';
  const names = playerNames(effPalette());
  const res = UI.analysisResult;
  let p0share = 0.5, numTxt = '…';
  if (res) {
    if (res.mate) {
      p0share = res.scoreP0 > 0 ? 1 : 0;
      numTxt = (res.scoreP0 > 0 ? names[0] : names[1]) + ' #';
    } else {
      p0share = 0.5 + 0.5 * Math.tanh(res.scoreP0 / 40);
      numTxt = (res.scoreP0 > 0 ? '+' : '') + res.scoreP0;
    }
  }
  const pct = Math.round(p0share * 100);
  const depthN = res ? res.depth : ANALYSIS_START;
  const depthTxt = t('analysis.depth', { n: depthN }) + ((res && res.deepening) ? '…' : '');
  const title = UI.assist === 'rating' ? t('analysis.rating') : t('analysis.analysis');
  host.innerHTML =
    `<div class="an-title">${title} · ${depthTxt}</div>` +
    `<div class="an-num">${numTxt}</div>` +
    `<div class="an-bar"><div class="an-top" style="height:${100 - pct}%"></div><div class="an-bot" style="height:${pct}%"></div></div>` +
    `<div class="an-legend"><span style="color:var(--p0)">▲ ${names[0]}</span><span style="color:var(--p1)">▼ ${names[1]}</span></div>`;
  if (lineHost) {
    if (!linesOn()) { lineHost.style.display = 'none'; return; } // «Рейтинг» — только шкала
    lineHost.style.display = '';
    let inner;
    if (!res) inner = `<span class="an-pv-label">${t('analysis.computing')}</span>`;
    else if (res.lines && res.lines.length) {
      inner = `<div class="an-pv-head">${t('analysis.lines', { d: depthTxt, name: names[UI.state.turn] })}</div>` +
        res.lines.map((ln, i) =>
          `<div class="an-pv-row"><span class="an-pv-n">${i + 1}</span>` +
          `<span class="an-pv-score">(${evalLabel(ln.score)})</span> ${pvToHtml(ln.pv)}</div>`
        ).join('');
    } else inner = `<span class="an-pv-label">${res.mate ? t('analysis.gameover') : '—'}</span>`;
    lineHost.innerHTML = inner;
  }
}

function renderRack(p) {
  const st = UI.state, v = st.v;
  const host = $('piles' + p);
  host.innerHTML = '';
  // подсказка про фишку из резерва — только для рэка ходящего игрока
  const handHint = (p === st.turn) ? hintDecorations().handSize : new Map();

  // одна визуальная «стопка/пила» резерва
  const makePile = (size, count, isSelected) => {
    const pile = document.createElement('div');
    pile.className = 'pile';
    if (size === null) {
      const empty = document.createElement('div');
      empty.className = 'pile-empty';
      pile.appendChild(empty);
      host.appendChild(pile);
      return;
    }
    const canDrag = !st.winner && p === st.turn && count > 0 && interactive();
    const pe = makePieceEl(v, p, size, canDrag);
    if (count === 0) pe.classList.add('dimmed');
    if (isSelected) pe.classList.add('sel');
    if (handHint.has(size)) pe.classList.add('hintpiece', 'hint' + handHint.get(size));
    if (canDrag) {
      pe.addEventListener('dragstart', e => onDragStart(e, { kind: 'hand', size }));
      pe.addEventListener('dragend', onDragEnd);
    }
    pe.addEventListener('click', (e) => { e.stopPropagation(); onHandClick(p, size); });
    const c = document.createElement('div');
    c.className = 'count';
    c.textContent = '×' + count;
    pile.appendChild(pe);
    pile.appendChild(c);
    host.appendChild(pile);
  };

  const selSize = (UI.selected && UI.selected.kind === 'hand' && p === st.turn) ? UI.selected.size : null;

  if (v.reserve === 'stacks') {
    // 4×4: показываем каждую физическую стопку, кликабельна её верхняя фишка
    for (const stack of st.hands[p]) {
      const top = stack.length ? stack[stack.length - 1] : null;
      makePile(top, stack.length, top !== null && top === selSize);
    }
  } else {
    // 3×3: группируем россыпь по размеру с количеством
    for (let s = 1; s <= v.sizes; s++) {
      let cnt = 0;
      for (const stk of st.hands[p]) if (stk.length && stk[stk.length - 1] === s) cnt++;
      makePile(s, cnt, s === selSize);
    }
  }
}

/* ---- клики ---- */
function onHandClick(p, s) {
  if (!interactive()) return;
  const st = UI.state;
  if (p !== st.turn || !reserveSizes(st, p).includes(s)) return;
  UI.selected = (UI.selected && UI.selected.kind === 'hand' && UI.selected.size === s) ? null : { kind: 'hand', size: s };
  render();
}

function onCellClick(i) {
  if (!interactive()) return;
  const st = UI.state;
  const legal = currentLegalTargets();
  if (legal.has(i)) { doMoveFromSelection(i); return; }
  const top = topOf(st.board[i]);
  if (top && top.player === st.turn) {
    UI.selected = (UI.selected && UI.selected.kind === 'board' && UI.selected.index === i) ? null : { kind: 'board', index: i };
  } else {
    UI.selected = null;
  }
  render();
}

function doMoveFromSelection(to) {
  const src = selectedSrc();
  if (!src) return;
  const move = src.kind === 'hand'
    ? { kind: 'hand', size: src.size, to }
    : { kind: 'board', size: src.size, index: src.index, to };
  commitMove(move);
}

/* ---- drag & drop ---- */
let dragSrc = null;
function onDragStart(e, src) {
  if (!interactive()) { e.preventDefault(); return; }
  dragSrc = src;
  UI.selected = src.kind === 'hand' ? { kind: 'hand', size: src.size } : { kind: 'board', index: src.index };
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', 'x'); } catch (_) {}
  e.target.classList.add('dragging');
  render();
}
function onDragEnd(e) { e.target.classList.remove('dragging'); dragSrc = null; }
function onDrop(to) {
  const src = dragSrc || selectedSrc();
  if (!src) return;
  const legal = new Set(legalTargets(UI.state, src));
  if (!legal.has(to)) return;
  const move = src.kind === 'hand'
    ? { kind: 'hand', size: src.size, to }
    : { kind: 'board', size: src.size, index: src.index, to };
  commitMove(move);
}

/* ---- применение хода + ИИ ---- */
function commitMove(move) {
  if (!interactive()) return;
  const pre = cloneState(UI.state);       // для оценки хода тренером
  const mover = UI.state.turn;
  UI.history.push(cloneState(UI.state));
  recordMove(UI.state, move);
  applyMove(UI.state, move);
  finishRecord();
  UI.draw = repetitionDraw();
  UI.selected = null;
  UI.hints = [];
  UI.coachWarn = null;
  render();
  scheduleAnalysis();
  scheduleCoachCheck(pre, mover);         // «Тренер»: насколько ход хорош
  maybeAIMove();
}

// Тренер: сравнить сыгранный ход с лучшим; если сильно хуже — предупредить.
function scheduleCoachCheck(pre, mover) {
  if (!coachOn() || UI.state.winner !== null || UI.draw) return;
  const post = cloneState(UI.state);
  const token = ++UI.coachToken;
  setTimeout(() => {
    if (token !== UI.coachToken) return;
    const warn = coachCheckBlunder(pre, post, mover);
    if (token !== UI.coachToken) return;
    UI.coachWarn = warn;
    render();
  }, 15);
}
function coachCheckBlunder(pre, post, mover) {
  const depth = pre.v.boardSize >= 4 ? 3 : 4;
  const best = topMoves(pre, mover, depth, 1)[0];
  if (!best) return null;
  const played = search(post, depth - 1, -Infinity, Infinity, mover); // ценность сыгранного
  const drop = best.score - played;
  const lostWin = best.score >= WIN_SCORE - 100 && played < WIN_SCORE - 100;
  const intoLoss = played <= -WIN_SCORE + 100 && best.score > -WIN_SCORE + 100;
  if (lostWin || intoLoss || drop >= 40) {
    const bestPost = applyMove(cloneState(pre), best.move);
    return {
      bestSan: moveCompact(pre, best.move) + checkSuffix(bestPost, mover),
      drop, severe: lostWin || intoLoss,
    };
  }
  return null;
}

// Подсказка: два лучших хода + оценка + продолжение (принципиальная вариация вперёд).
function onHint() {
  if (!interactive()) return;
  const me = UI.state.turn;
  const depth = maxDepth(UI.state.v);         // подсказка — всегда на максимуме
  const pvDepth = Math.min(depth, UI.state.v.boardSize >= 4 ? 3 : 4);
  const top = topMoves(UI.state, me, depth, 2);
  UI.hints = top.map(h => {
    const child = applyMove(cloneState(UI.state), h.move);
    const head = { pre: cloneState(UI.state), move: h.move, post: cloneState(child), player: me, score: h.score };
    const tail = child.winner === null ? principalVariation(child, pvDepth, 3) : [];
    return { move: h.move, score: h.score, me, pv: [head, ...tail] };
  });
  UI.selected = null;
  render();
}

function evalLabel(score) {
  if (score >= WIN_SCORE - 100) return t('eval.win');
  if (score <= -WIN_SCORE + 100) return t('eval.loss');
  return (score > 0 ? '+' : '') + score;
}

// Текст одного хода записи (с учётом стиля подписей и суффикса).
function moveText(i) {
  const m = UI.moves[i];
  if (!m) return '';
  const pre = UI.history[i]; // пред-ходовое состояние, парное этому ходу
  return (pre ? moveCompact(pre, m.move) : '') + (m.suffix || '');
}
// Вся партия в текст: «1. Xa4 Xc2\n2. …»
function notationText() {
  let out = '';
  for (let i = 0; i < UI.moves.length; i += 2) {
    const a = moveText(i), b = moveText(i + 1);
    out += `${i / 2 + 1}. ${a}${b ? ' ' + b : ''}\n`;
  }
  return out.trim();
}
function flashCopy(msg) {
  const b = $('copyNotation');
  if (!b) return;
  const prev = b.textContent;
  b.textContent = msg;
  setTimeout(() => { b.textContent = prev; }, 1400);
}
function copyNotation() {
  const txt = notationText();
  if (!txt) return;
  const ok = () => flashCopy(t('copy.done'));
  const fallback = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
      ok();
    } catch (_) { flashCopy(t('copy.fail')); }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(ok).catch(fallback);
  } else fallback();
}

function maybeAIMove() {
  const st = UI.state;
  if (!isAI(st.turn) || st.winner !== null || UI.draw) return;
  if (UI.mode === 'cvc' && !UI.autorun) return;   // ждём нажатия «Играть»
  UI.busy = true;
  render();
  setTimeout(() => {
    const move = aiPickMove(UI.state);
    if (move) {
      UI.history.push(cloneState(UI.state));
      recordMove(UI.state, move);
      applyMove(UI.state, move);
      finishRecord();
    }
    UI.draw = repetitionDraw();
    if (UI.state.winner !== null || UI.draw) UI.autorun = false; // партия окончена — стоп
    UI.busy = false;
    UI.selected = null;
    render();
    scheduleAnalysis();
    maybeAIMove(); // безопасно, если ИИ вдруг ходит подряд
  }, 350);
}

/* ---- управление ---- */
function startNewGame() {
  const vid = $('variant').value;
  UI.state = newGame(VARIANTS[vid]);
  UI.history = [];
  UI.moves = [];
  UI.selected = null;
  UI.hints = [];
  UI.busy = false;
  UI.draw = false;
  UI.autorun = false;      // Комп↔Комп не стартует сам — только по «Играть»
  UI.coachWarn = null;
  UI.mode = $('mode').value;
  render();
  scheduleAnalysis();
  maybeAIMove();
}

// Играть/Пауза для режима Комп↔Комп.
function playPause() {
  if (UI.mode !== 'cvc') return;
  if (UI.state.winner !== null || UI.draw) { startNewGame(); } // окончена — начать заново
  UI.autorun = !UI.autorun;
  render();
  if (UI.autorun) maybeAIMove();
}

function undo() {
  if (UI.busy || UI.history.length === 0) return;
  const steps = (UI.mode === 'ai') ? Math.min(2, UI.history.length) : 1;
  for (let i = 0; i < steps; i++) { UI.state = UI.history.pop(); UI.moves.pop(); }
  UI.selected = null;
  UI.hints = [];
  UI.coachWarn = null;
  UI.draw = repetitionDraw();
  render();
  scheduleAnalysis();
}

export function initUI() {
  UI.settings = loadSettings();
  setLabelStyle(UI.settings.labels);
  setLanguage(UI.settings.language);

  $('newgame').addEventListener('click', startNewGame);
  $('playpause').addEventListener('click', playPause);
  $('undo').addEventListener('click', undo);
  $('hint').addEventListener('click', onHint);
  $('assist').addEventListener('change', (e) => {
    UI.assist = e.target.value;
    UI.coachWarn = null;
    render();
    scheduleAnalysis();
  });
  $('mode').addEventListener('change', startNewGame);
  $('variant').addEventListener('change', startNewGame);
  const cpy = $('copyNotation');
  if (cpy) cpy.addEventListener('click', (e) => { e.stopPropagation(); copyNotation(); });

  // настройки
  const sp = $('setPalette'), sl = $('setLabels'), l0 = $('setLevel0'), l1 = $('setLevel1'),
    lang = $('setLanguage'), sg = $('settingsBtn'), panel = $('settings');
  if (sp) { sp.value = UI.settings.palette; sp.addEventListener('change', () => { UI.settings.palette = sp.value; saveSettings(); render(); }); }
  if (sl) { sl.value = UI.settings.labels; sl.addEventListener('change', () => { UI.settings.labels = sl.value; setLabelStyle(sl.value); saveSettings(); render(); }); }
  refreshLevelSelects();
  if (l0) { l0.value = UI.settings.levels[0]; l0.addEventListener('change', () => { UI.settings.levels[0] = l0.value; saveSettings(); }); }
  if (l1) { l1.value = UI.settings.levels[1]; l1.addEventListener('change', () => { UI.settings.levels[1] = l1.value; saveSettings(); }); }
  if (lang) {
    lang.innerHTML = LANGUAGES.map(l => `<option value="${l.code}">${l.name}${l.reviewed ? '' : ' •'}</option>`).join('');
    lang.value = UI.settings.language;
    lang.addEventListener('change', () => {
      UI.settings.language = lang.value;
      setLanguage(lang.value);
      saveSettings();
      applyStaticI18n();
      refreshLevelSelects();
      render();
      scheduleAnalysis();
    });
  }
  if (sg && panel) { sg.addEventListener('click', (e) => { e.stopPropagation(); panel.classList.toggle('open'); sg.classList.toggle('on'); }); }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.cell') && !e.target.closest('.pile')) { UI.selected = null; render(); }
  });

  applyStaticI18n();
  startNewGame();
}
