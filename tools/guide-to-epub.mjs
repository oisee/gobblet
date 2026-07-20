// Конвертирует docs/guide-ru.html → docs/guide-ru.epub.
// Доски/задачник в guide рисуются JS — в EPUB скриптов нет, поэтому ПРЕ-РЕНДЕРИМ
// всё в статические таблицы с инлайн-стилями (надёжно для любых читалок), потом pandoc.
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);

const GUIDE = 'docs/guide-ru.html';
const OUT = 'docs/guide-ru.epub';

// Одна доска → статическая таблица. pos: 16-глифов или клетки через '/'; win: индексы.
function board(pos, win) {
  const cells = pos.includes('/')
    ? pos.split('/').map(c => (c === '-' || c === '.') ? [] : [...c])
    : [...pos].map(c => (c === '.' || c === '-') ? [] : [c]);
  const W = new Set((win || '').split(',').filter(x => x !== '').map(Number));
  const dia = { S: 16, M: 20, L: 25, X: 30 };
  const disc = (ch) => { const w = ch === ch.toUpperCase(), s = ch.toUpperCase(), d = dia[s] || 24;
    return `<span style="display:inline-block;width:${d}px;height:${d}px;line-height:${d}px;border-radius:50%;background:${w ? '#efe6cf' : '#2b2f36'};color:${w ? '#4a4030' : '#eef1f4'};font-weight:800;font-size:${Math.round(d * .42)}px;text-align:center;">${s}</span>`; };
  const pip = (ch) => { const w = ch === ch.toUpperCase();
    return `<span style="display:inline-block;width:9px;height:9px;line-height:9px;border-radius:50%;font-size:6px;text-align:center;background:${w ? '#cdbd94' : '#2b2f36'};color:${w ? '#4a4030' : '#eef1f4'};">${ch.toUpperCase()}</span>`; };
  let rows = '';
  for (let r = 0; r < 4; r++) {
    let tds = `<td style="color:#877b69;font-size:10px;text-align:center;padding:0 3px;">${4 - r}</td>`;
    for (let c = 0; c < 4; c++) {
      const i = r * 4 + c, st = cells[i] || [];
      const bg = W.has(i) ? '#f4e2b0' : ((r + c) % 2 ? '#d8ccae' : '#e6dcc4');
      let inner = '';
      if (st.length) { inner = disc(st[st.length - 1]); if (st.length > 1) inner += '<br>' + st.slice(0, -1).map(pip).join(''); }
      tds += `<td style="width:36px;height:36px;text-align:center;vertical-align:middle;background:${bg};">${inner || '&#160;'}</td>`;
    }
    rows += `<tr>${tds}</tr>`;
  }
  let fl = '<td></td>';
  for (let c = 0; c < 4; c++) fl += `<td style="color:#877b69;font-size:10px;text-align:center;">${'abcd'[c]}</td>`;
  return `<table style="border-collapse:separate;border-spacing:2px;display:inline-table;">${rows}<tr>${fl}</tr></table>`;
}

const CAT = { mate1: 'Мат в 1 ход', mate2: 'Мат в 2 хода', mate3: 'Мат в 3 хода' };

async function main() {
  let html = await readFile(GUIDE, 'utf8');
  const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];
  let body = (html.match(/<body>([\s\S]*?)<\/body>/) || [, html])[1];

  // 1) распарсить задачник из встроенных данных
  const pd = body.match(/\/\*PUZZLES\*\/([\s\S]*?)\/\*END\*\//);
  let puzzles = { mate1: [], mate2: [], mate3: [] };
  if (pd) { try { puzzles = JSON.parse(pd[1]); } catch (_) {} }

  // 2) раскрыть #puzzles статикой
  let pz = '';
  for (const cat of ['mate1', 'mate2', 'mate3']) {
    const list = puzzles[cat] || []; if (!list.length) continue;
    pz += `<h3>${CAT[cat]}</h3>`;
    for (const p of list) pz += `<div style="display:inline-block;vertical-align:top;margin:0 14px 14px 0;">${board(p.pos)}<div style="font-size:13px;max-width:170px;"><b>${p.turn === 0 ? 'Белые' : 'Чёрные'} ходят.</b> Ключ: <code>${p.san}</code> — мат в ${p.k}.</div></div>`;
  }
  body = body.replace(/<div id="puzzles"><\/div>/, pz);

  // 3) убрать все скрипты
  body = body.replace(/<script[\s\S]*?<\/script>/g, '');

  // 4) доски-заглушки → статические таблицы
  body = body.replace(/<div class="board"([^>]*)><\/div>/g, (m, attrs) => {
    const pos = (attrs.match(/data-pos="([^"]*)"/) || [, ''])[1];
    const win = (attrs.match(/data-win="([^"]*)"/) || [, ''])[1];
    return board(pos, win);
  });

  const tmpHtml = 'docs/.guide-static.html', tmpCss = 'docs/.guide.css';
  await writeFile(tmpHtml, `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Gobblet 4×4 — Руководство</title></head><body>${body}</body></html>`);
  await writeFile(tmpCss, css);
  await run('pandoc', [tmpHtml, '-f', 'html', '-t', 'epub3', '--css', tmpCss, '--toc', '--toc-depth=2',
    '--metadata', 'title=Gobblet 4×4 — Практическое руководство', '--metadata', 'author=oisee', '--metadata', 'lang=ru', '-o', OUT]);
  await unlink(tmpHtml); await unlink(tmpCss);
  console.log(`✓ ${OUT} — задачник: ${['mate1', 'mate2', 'mate3'].map(c => (puzzles[c] || []).length).join('/')}`);
}
main().catch(e => { console.error(e); process.exit(1); });
