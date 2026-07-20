// Генерирует задачник docs/puzzles-ru.html из data/puzzles.json.
// Каждый этюд: диаграмма (со стопками), «чей ход», решение (раскрытие) и кнопка «Играть»
// со ссылкой в игру (позиция в URL: ../dist/gobblet.html#pzl=<base64>).
import { readFile, writeFile } from 'node:fs/promises';

const enc = (obj) => encodeURIComponent(Buffer.from(JSON.stringify(obj)).toString('base64'));

const CSS = `
:root{--bg:#ece7db;--surface:#fbf9f4;--ink:#241f18;--soft:#5a5145;--muted:#877b69;--line:#d9cfba;
--brass:#9a6b1f;--good:#2f8f5b;--sq:#e6dcc4;--sq-d:#d8ccae;--white:#efe6cf;--white-d:#cdbd94;--black:#2b2f36;--black-d:#0d0f12}
@media(prefers-color-scheme:dark){:root{--bg:#14120e;--surface:#1c1913;--ink:#ece5d6;--soft:#c3b8a3;--muted:#8f836d;
--line:#332c20;--brass:#d9a441;--good:#57c98a;--sq:#33302a;--sq-d:#3d392f}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);
font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
.wrap{max-width:860px;margin:0 auto;padding:0 20px 80px}
header{padding:48px 0 20px;border-bottom:1px solid var(--line)}
.eyebrow{font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--brass);font-weight:700}
h1{font-family:"Iowan Old Style",Palatino,Georgia,serif;font-weight:600;font-size:clamp(28px,6vw,44px);margin:.3em 0 .2em}
.lede{color:var(--soft);max-width:60ch}
h2{font-family:"Iowan Old Style",Palatino,Georgia,serif;margin:40px 0 4px}
code{font-family:ui-monospace,Menlo,monospace;font-size:.88em;background:var(--surface);border:1px solid var(--line);border-radius:5px;padding:1px 5px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px;margin:16px 0}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px}
.card .who{font-size:13px;color:var(--muted);margin:8px 0 4px}
.card details{margin-top:6px;border-top:1px dashed var(--line);padding-top:6px}
.card summary{cursor:pointer;color:var(--brass);font-weight:700;font-size:14px;list-style:none}
.card summary::-webkit-details-marker{display:none}.card summary::before{content:'▶ '}
.card details[open] summary::before{content:'▼ '}
.card .sol .mv{font-family:ui-monospace,Menlo,monospace;font-weight:700;color:var(--good)}
.play{display:inline-block;margin-top:10px;background:var(--brass);color:#fff;text-decoration:none;
font-weight:700;font-size:13px;padding:6px 12px;border-radius:8px}
.board{display:inline-grid;grid-template-columns:14px repeat(4,42px);grid-template-rows:repeat(4,42px) 14px;gap:3px}
.board .rk,.board .fl{display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--muted);font-family:ui-monospace,monospace}
.board .rk{grid-column:1}.board .fl{grid-row:6}
.sq{background:var(--sq);border-radius:6px;display:grid;place-items:center;position:relative}
.sq.dark{background:var(--sq-d)}
.disc{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:12px;
box-shadow:0 1px 3px rgba(0,0,0,.3),inset 0 2px 3px rgba(255,255,255,.35),inset 0 -4px 7px rgba(0,0,0,.25)}
.disc.w{background:radial-gradient(circle at 34% 28%,#fffaf0,var(--white) 60%,var(--white-d));color:#4a4030}
.disc.b{background:radial-gradient(circle at 34% 28%,#737b86,var(--black) 60%,var(--black-d));color:#eef1f4}
.disc.s{width:19px;height:19px;font-size:9px}.disc.m{width:25px;height:25px;font-size:10px}.disc.l{width:29px;height:29px}.disc.x{width:35px;height:35px;font-size:13px}
.under{position:absolute;bottom:1px;left:0;right:0;display:flex;gap:1px;justify-content:center;pointer-events:none}
.pip{width:11px;height:11px;border-radius:50%;font-size:7px;line-height:11px;text-align:center;font-weight:800;box-shadow:0 0 0 1px rgba(0,0,0,.3)}
.pip.w{background:var(--white-d);color:#4a4030}.pip.b{background:var(--black);color:#eef1f4}
footer{margin-top:40px;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
`;

const RENDER = `
const FILES=['a','b','c','d'];
const disc=(ch,cls)=>{const w=ch===ch.toUpperCase(),sz=ch.toUpperCase(),zc={S:'s',M:'m',L:'l',X:'x'}[sz];
const d=document.createElement('div');d.className=cls+' '+(w?'w':'b')+' '+zc;d.textContent=sz;return d;};
document.querySelectorAll('.board[data-pos]').forEach(el=>{
const raw=el.dataset.pos;
const cells=raw.includes('/')?raw.split('/').map(c=>(c==='-'||c==='.')?[]:[...c]):[...raw].map(c=>(c==='.'||c==='-')?[]:[c]);
el.innerHTML='';
for(let r=0;r<4;r++){const rk=document.createElement('div');rk.className='rk';rk.textContent=4-r;el.appendChild(rk);
for(let c=0;c<4;c++){const i=r*4+c;const sq=document.createElement('div');sq.className='sq'+(((r+c)%2)?' dark':'');
const st=cells[i]||[];if(st.length){sq.appendChild(disc(st[st.length-1],'disc'));
if(st.length>1){const u=document.createElement('div');u.className='under';
for(let k=0;k<st.length-1;k++){const ch=st[k];const p=document.createElement('div');p.className='pip '+(ch===ch.toUpperCase()?'w':'b');p.textContent=ch.toUpperCase();u.appendChild(p);}sq.appendChild(u);}}
el.appendChild(sq);}}
const cr=document.createElement('div');cr.className='fl';el.appendChild(cr);
for(let c=0;c<4;c++){const fl=document.createElement('div');fl.className='fl';fl.textContent=FILES[c];el.appendChild(fl);}});
`;

const CAT = { mate1: 'Мат в 1 ход', mate2: 'Мат в 2 хода', mate3: 'Мат в 3 хода' };

function card(p, variant) {
  const who = p.turn === 0 ? 'Белые ходят' : 'Чёрные ходят';
  const code = enc({ v: variant, board: p.state.board, hands: p.state.hands, turn: p.state.turn });
  return `<div class="card">
    <div class="board" data-pos="${p.pos}"></div>
    <div class="who">${who} — выигрыш форсированно</div>
    <details><summary>Решение</summary><div class="sol">Ключевой ход: <span class="mv">${p.san}</span> — далее форсированный мат в ${p.k}.</div></details>
    <a class="play" href="../dist/gobblet.html#pzl=${code}" target="_blank">▶ Играть с этой позиции</a>
  </div>`;
}

async function main() {
  const db = JSON.parse(await readFile(process.argv[2] || 'data/puzzles.json', 'utf8'));
  const variant = db.variant || 'classic4';
  let body = '';
  for (const cat of ['mate1', 'mate2', 'mate3']) {
    const list = db[cat] || [];
    if (!list.length) continue;
    body += `<h2>${CAT[cat]}</h2><div class="grid">${list.map(p => card(p, variant)).join('')}</div>`;
  }
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/><title>Gobblet 4×4 — Задачник</title>
<style>${CSS}</style></head><body><div class="wrap">
<header><div class="eyebrow">Gobblet · Classic 4×4 · задачник</div>
<h1>Этюды: ход — и выигрыш</h1>
<p class="lede">Позиции из реальных партий, <b>проверенные солвером</b> на форсированный мат. Подумай сам,
раскрой решение, или нажми «Играть» — позиция откроется в игре (hotseat), сыграй её сам.</p></header>
${body}
<footer>Нотация: <code>Lc3</code> — из резерва, <code>c3-d4</code> — ход, <code>x</code> — накрытие,
<code>+</code> шах, <code>++</code> вилка, <code>#</code> победа. Пипс под фишкой = нижняя матрёшка.
Данные — self-play. «Играть» открывает <code>dist/gobblet.html</code> — собери его <code>npm run build</code>.</footer>
</div><script>${RENDER}</script></body></html>`;
  await writeFile('docs/puzzles-ru.html', html);
  console.log('docs/puzzles-ru.html готов: ' + ['mate1', 'mate2', 'mate3'].map(c => (db[c] || []).length + ' ' + c).join(', '));
}
main().catch(e => { console.error(e); process.exit(1); });
