# Gobblet

A web implementation of the abstract strategy game **Gobblet**, plus a headless
self-play toolkit for generating game databases and extracting opening heuristics.

Two variants share one parameterized engine:

- **Gobblers 3×3** — the lighter version (board 3×3, three in a row).
- **Classic 4×4** — the full game (board 4×4, four in a row).

## Attribution & disclaimer

**Gobblet** and **Gobblet Gobblers** were designed by **Thierry Denoual** and are
published by **Blue Orange Games**. The game design, the names *Gobblet* /
*Gobblet Gobblers*, and all related trademarks and copyrights belong to their
respective owners (Thierry Denoual / Blue Orange Games).

- Publisher: https://www.blueorangegames.com/
- Gobblet on BoardGameGeek: https://boardgamegeek.com/boardgame/2266/gobblet
- Gobblet Gobblers on BoardGameGeek: https://boardgamegeek.com/boardgame/13111/gobblet-gobblers

This repository is an **unofficial, non-commercial, educational fan implementation**.
It is **not affiliated with, endorsed by, or sponsored by** Thierry Denoual or Blue
Orange Games. **We claim no rights** to the Gobblet game, its name, or its trademarks —
only to our own source code in this repo. If you enjoy the game, buy the physical set.

## Running the game

**1. Development (ES modules + dev server):**

```bash
npm run dev        # http://localhost:5173
```

The code is split into small modules under `src/` — easy to maintain and test.

**2. Single self-contained file:**

```bash
npm run build      # -> dist/gobblet.html
```

`dist/gobblet.html` inlines all CSS + JS into one file. Opens with a double-click,
no server and no dependencies. There is **no `npm install`** — the project has zero
runtime dependencies.

## Project layout

```
src/
  variants.js   variant configs (VARIANTS) — the only place with game parameters
  engine.js     engine: moves, legality, win, cloning, symmetry canonicalKey (pure, no DOM)
  notation.js   move/square notation (a1, S/M/L/X, +/++/#)
  ai.js         alpha-beta AI (+ principal variation, evaluation)
  players.js    AI level policy (pickMove) — shared by UI and headless tools
  i18n.js       localization (t, LOCALES) — English & Russian ready, others stubbed
  ui.js         rendering + input (drag&drop, hints, analysis, coach, undo)
  main.js       entry point
  styles.css
index.html      dev page (loads modules)
build.mjs       module serializer -> dist/gobblet.html
serve.mjs       tiny static server
tools/          headless tools (no html build)
docs/           strategy notes and reports
```

## In-game assistant

A four-state **Assistant** dropdown:

- **Off**
- **Rating** — a live evaluation bar on the side.
- **Analysis** — the bar plus best continuation lines (iterative deepening).
- **Coach** — analysis plus on-board arrows / ghost placement for the best moves,
  and feedback on your own move (warns and offers to reconsider a weakening move).

Other features: **hints** with arrows, **game record** with copy-to-clipboard,
**undo**, **draw by threefold repetition**, board coordinate labels, and a **settings**
panel (theme, piece labels `S M L X` vs `1 2 3 4`, per-player computer level, language).

Opponents: **Human**, **Computer**, or **Computer vs Computer** (independent levels
with Play/Pause).

## Notation

Chess-style, shown in the game record.

- **Squares:** files `a,b,c(,d)` left→right, ranks `1..N` bottom→top (`a1` bottom-left).
- **Sizes:** `S < M < L < X`.
- **Moves:** `Lc3` — from reserve; `c3-d4` — a board move; `x` — a cover (`Lxc3`, `c3xd4`).
- **Annotations:** `+` check (threatens a line), `++` double check (fork), `#` win.

## AI levels

`balbes` (100% random) · `novice` (50% random) · `amateur` (reactive tactics:
grabs wins, blocks checks) · `student` (club + 20% slips) · `club` (depth 2) ·
`medium` (depth 3) · `hard` (max depth).

## Headless self-play & databases

The engine is DOM-free, so computer-vs-computer runs in worker threads without a browser.

```bash
# tournament over level pairs (both colors), N games per pair, multithreaded
npm run selfplay -- --variant=classic4 --levels=club,medium,hard --games=8 --concurrency=8

# time budget + randomized opening (diversifies otherwise-deterministic pairs)
node tools/selfplay.mjs --levels=student,club,medium,hard --openingPlies=4 --minutes=60
```

Writes a database to `data/selfplay-<variant>-<ts>.json` and prints an **Elo ranking**,
win% **as white / as black**, color bias, and a **head-to-head** matrix. Games are
reproducible by seed.

```bash
# opening book: canonical (rotation/mirror) opening tree with win rates
node tools/openbook.mjs data/<db>.json --plies=6 --top=3 --min=30 --only=medium,hard

# post-analysis: the decisive blunder per game, at max search depth
node tools/analyze-db.mjs data/<db>.json --decisive --limit=10

# overnight generator (auto-detects cores, chunked, resilient)
bash tools/overnight.sh 600 student,club,medium,hard 4 45
```

## Notes

- `canonicalKey` (engine) collapses the 8 board symmetries (D4 group: rotations +
  mirrors) so equivalent positions map to one key — useful for opening books and,
  later, transposition tables / solving.
- Draw/repetition and opening heuristics are documented in `docs/`.
