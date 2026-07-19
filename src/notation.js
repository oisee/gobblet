// Нотация ходов и полей (шахматного стиля).
import { topOf, threatsFor } from './engine.js';

const FILES = 'abcdefgh';

// Имя поля: файлы a.. слева направо, ранги 1..N снизу вверх (a1 — нижний левый).
export function squareName(v, i) {
  const N = v.boardSize;
  const r = Math.floor(i / N), c = i % N;
  return FILES[c] + (N - r);
}

// Стиль подписи размера: буквы (S M L X) или цифры (1 2 3 4). Глобально, влияет
// и на фишки, и на нотацию — переключается из настроек.
let LABEL_STYLE = 'letters'; // 'letters' | 'numbers'
export function setLabelStyle(s) { LABEL_STYLE = (s === 'numbers') ? 'numbers' : 'letters'; }

// Подпись размера: буква (S < M < L < X) или цифра.
export function sizeLetter(v, size) {
  if (LABEL_STYLE === 'numbers') return String(size);
  const L = v.sizes >= 4 ? ['', 'S', 'M', 'L', 'X'] : ['', 'S', 'M', 'L'];
  return L[size] || String(size);
}

// Русское слово-размер (винительный падеж, для развёрнутого описания).
export function sizeWord(v, size) {
  const W = v.sizes >= 4
    ? ['', 'малую', 'среднюю', 'большую', 'огромную']
    : ['', 'малую', 'среднюю', 'большую'];
  return W[size] || ('размер ' + size);
}

// Компактная запись хода (вычисляется на состоянии ДО хода).
//   резерв на пустое:   Lc3     (ведущая буква размера ⇒ из резерва)
//   резерв с накрытием: Lxc3
//   ход по доске:       c3-d4   (ведущая буква поля ⇒ перестановка)
//   ход с накрытием:    c3xd4
export function moveCompact(state, move) {
  const v = state.v;
  const gob = topOf(state.board[move.to]) !== null;
  const dst = squareName(v, move.to);
  if (move.kind === 'hand') return sizeLetter(v, move.size) + (gob ? 'x' : '') + dst;
  return squareName(v, move.index) + (gob ? 'x' : '-') + dst;
}

// Развёрнутое описание хода на русском (для подсказок).
export function moveVerbose(state, move) {
  const v = state.v, me = state.turn;
  const dst = squareName(v, move.to);
  const covered = topOf(state.board[move.to]);
  const cover = covered ? `, накрыв ${covered.player === me ? 'свою' : 'чужую'} ${sizeWord(v, covered.size)}` : '';
  if (move.kind === 'hand') return `${cap(sizeWord(v, move.size))} из резерва на ${dst}${cover}`;
  return `${cap(sizeWord(v, move.size))} ${squareName(v, move.index)}→${dst}${cover}`;
}

// Суффикс шаха/победы, вычисляется на состоянии ПОСЛЕ хода. mover — кто ходил.
export function checkSuffix(stateAfter, mover) {
  if (stateAfter.winner === mover) return '#';         // победа
  const t = threatsFor(stateAfter, mover).size;
  return t >= 2 ? '++' : (t === 1 ? '+' : '');          // шах / двойной шах
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
