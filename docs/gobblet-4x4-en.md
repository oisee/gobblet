---
title: "Gobblet 4x4 — Guide and Analysis"
author: "oisee"
lang: en
date: "2026"
---

# Gobblet 4×4 — Cheat Sheet

*Short and practical. Numbers come from self-play (thousands of engine games); level
behavior comes from the AI implementation. Tags: **[data]** — from search, **[rule]** —
from the game rules.*

---

## Three things that decide a game

1. **Fork** — two "three-in-a-row" threats on intersecting lines at once. A single threat
   is covered; a double one (`++`) is not. This is **[rule]** the only unstoppable win.
2. **Bigger covers smaller** **[rule]**. In Gobblet, defense is usually *covering*, not
   occupying an empty square. Keep a big piece in reserve.
3. **Reveal** **[rule]**: lift your piece and what was underneath is exposed. Remember your
   stacks — your own move can hand the opponent a finished line.

---

## By phase

### Opening (first ~3 moves)
- The first move is always `X` (only the largest is accessible in reserve). **[data]** across
  20k games where you put `X` barely matters: in clean strong play (hard×hard) center, edge and
  corner all score **~50%**. The center is still reasonable (it feeds more future forks) but gives
  no decisive edge. *(The earlier "center 58%" was small-sample noise; it didn't hold at scale.)*
- Don't dump all three `X` on the rim — keep big pieces in reserve for defense.
- Answer the opponent's center with your own center.

### Middlegame
- Build **intersecting triples** → a fork. Don't telegraph a single threat — it just gets
  covered; accumulate to fire two at once.
- Get a big piece **onto the board** — a board piece may cover anywhere; from reserve you
  may cover an opponent's piece only if it is already part of a triple **[rule]**. A board
  piece is a mobile "firefighter."
- **Reveal trap:** hide your piece under the opponent's so that moving it exposes your line.
- Track the stacks. Don't trade big pieces for nothing — tempo is worth more.

### Endgame
- **Big-piece material** (`L`/`X`) and tempo decide it. Count who has more available big
  pieces (on top of the board + tops of reserve stacks) — that side covers threats and
  pushes its own.
- **[data]** average game ~29 plies. Past ~40 with no breakthrough — the position is likely
  a draw (draws average ~54 plies).

---

## How to beat each computer level

| Level | What it does | How to beat it |
|---|---|---|
| **Dummy** | 100% random moves | Just build your line — it won't interfere on purpose. Don't blunder yourself: that's the only way to lose. |
| **Novice** | 50% random / 50% depth 2 | Keep constant pressure and double threats — sooner or later it slips. Don't force trades, wait for the blunder. |
| **Amateur** | reactive tactics: grabs your win and blocks checks, but **doesn't plan or attack** | Never give a single threat (it will cover) — prepare a **fork two moves out**: a maturing threat it can't see. The initiative is always yours. |
| **Improver** | club level, but 20% of moves are slips | Play as against Club but more patiently: it will donate tempo/material. Keep the position sharp so the slip is costly. |
| **Club** | depth 2, no slips | Sees wins and one-move threats, but is **blind to combinations 3+ plies deep**. Hit with delayed forks and reveal traps. Don't walk into its 2-ply tactics. |
| **Intermediate** | depth 3 | Parries short forks. You need traps **4+ plies** deep, play on big-piece material and the horizon. Cheap tactics it calculates. |
| **Strong** | depth 4 (maximum) | Tactically solid, converts fast (~24–27 plies). Realistically — **play for a draw** and exploit the horizon: threats that mature beyond 4 plies (long reveal chains, stockpiling `X`). Don't cede the initiative. |

---

## On tempo and color

**[data]** With a randomized opening the bias almost vanishes: **white 48% · black 46% ·
draws 6%**. In 4×4 the first-move advantage is **small** — level and precision matter more
than color. In mirror strong-vs-strong games the outcome is close to 50/50.

---

*Notation: squares `a1…`, sizes `S·M·L·X`; `Lc3` — from reserve, `c3-d4` — a move, `x` —
cover, `+` check, `++` double (fork), `#` win. More: `docs/strategy.md`, `docs/report-4x4-en.md`.*


---

# Gobblet 4×4 — Analysis Report

*What we could derive from engine self-play. Split into **methodology**, **empirical
findings** (with numbers), and **honest caveats**. Complements `docs/strategy.md`
(principles) and `docs/cheatsheet-en.md` (the short version).*

---

## 0. Update from a 20,895-game run (overnight)

*Section §2 below uses the earlier 1-hour run (3666 games). A large overnight run
(20,895 games, 16 cores) **corrected** some of it — treat these numbers as primary.*

- **The opening is nearly neutral.** In clean strong play (hard×hard, 1300 games) the first
  move — center/edge/corner — all score **~50%**. The earlier "center 58%" **did not hold** —
  it was small-sample noise. The center is still reasonable (more future forks) but gives no
  decisive edge.
- **4×4 is drawish under strong play.** hard mirror: **white 27.5% / black 27.9% / draws 44.6%** —
  the first-move edge is ~zero, nearly half the games are drawn.
- **Even/odd depth artifact.** Mirrors: depth-3 (medium) is decisive and white-favored
  (56/40, 4% draws); depth-2/4 are drawish (45–53% draws). Looks like a shallow-eval horizon
  parity effect, not a property of the game — testable with depth 5.
- **Forks are the main winning mechanism, at every level.** A fork (`++`) ends **57–63%** of
  decisive games. By level gap: gap 0 — 56.5%, gap 1 — 60.9%, gap 2 — 63.2%, gap 3 — 49.0%.
  Even **hard×hard: 55%** of decisive games contain a fork — it just takes long to mature
  (avg decisive hard game ~44 plies vs ~9 at a large level gap). So **forks happen in equal
  strong play too**, not only across a level gap; at a big gap the stronger side more often
  wins by direct pressure before a fork is needed.

---

## 1. Methodology

- The **engine** is DOM-free (`src/engine.js`, `ai.js`, `players.js`), so computer-vs-computer
  runs headless in worker threads (`tools/selfplay.mjs`).
- **Levels** (`players.js`): `balbes` (100% random), `novice` (50% random), `amateur`
  (reactive tactics), `student` (depth 2 + 20% slips), `club` (depth 2), `medium` (depth 3),
  `hard` (depth 4 = max for this variant).
- **Randomized opening** (`--openingPlies=K`): the first K plies are uniformly random, then
  the levels play. Without it, deterministic pairs produce one and the same game; with it,
  we get broad opening coverage and the outcome (who won) labels the opening's value.
- **Reproducibility:** every game is deterministic by seed (mulberry32 PRNG).
- **Canonicalization:** `canonicalKey` collapses the 8 board symmetries (the D4 group:
  rotations + mirrors) into a single key → in the opening book (`tools/openbook.mjs`)
  rotated/mirrored copies of an opening merge, giving cleaner statistics.
- **Rating:** Elo computed iteratively over all games (both colors, K=24).

Baseline run behind the numbers below: **3666 games**, `classic4`, levels `amateur..hard`,
4 random opening plies, ~1 hour on 8 threads.

---

## 2. Empirical findings

### 2.1. Level strength (Elo)
```
hard    2123     medium 1857     club 1529     student 1135     amateur 856
```
Head-to-head is a **strict order** `hard > medium > club > student > amateur`: each beats all
lower levels both as white and as black. No paradoxes (A>B>C>A) — the engine is "monotone in
depth."

### 2.2. Tempo and color
With a randomized opening the bias nearly disappears: **white 48% · black 46% · draws 6%**.
Takeaway: the **first-move advantage in 4×4 is small** and largely washes out; level decides.
(In deterministic *mirror* games without randomization the winner is fixed, but that is a
single data point, not a property of the game.)

### 2.3. Opening — where to place the first `X`
Canonicalized by symmetry; win-rate for white:

| Square | All pairs | Strong play only (medium+hard) |
|---|---|---|
| **Center** (core) | 54% | **58%** |
| Edge | 51% | 54% |
| **Corner** | 49% | 52% |

**Center > edge > corner.** This matters: by line count the center and a corner are **equal**
in 4×4 (both belong to 3 of the 10 lines) — yet empirically the center beats a corner by
~6 points. So a center bonus in the evaluation is justified, but should be **moderate**. The
best black reply to a center opening is also the center.

### 2.4. Game dynamics
- Average length **28.8 plies** (median 26); draws are long — **~54 plies**.
- Conversion speed (avg plies to a win): `medium` **24.1** (fastest), `hard` 26.7,
  `club` 30.4, weak levels take longer (messy). Strong engines convert decisively; weak
  wins are "dirty" and slow.
- Draw rate ~6% — 4×4 is not especially drawish at these depths.

---

## 3. What each level tells us about the game

- **Reactive tactics (amateur)** are disastrous as white (must create threats) and passable
  as black (react): amateur has a huge color asymmetry. Lesson: **initiative in 4×4 requires
  a plan**; pure reaction is defense only.
- **Depth decides monotonically:** each step of depth (2→3→4) is a clear Elo jump. So at these
  depths the position is still far from "solved" — there's room to go deeper.
- **Opening win-rate gaps are modest (~6 pts)** — either 4×4 is genuinely balanced in the
  opening, or (more likely) our **shallow evaluation** doesn't sharply distinguish openings.

---

## 4. Honest caveats

- `hard` = depth 4 is **not "optimal."** "Best moves" here are best *by our shallow evaluation
  and horizon*, not theoretical truth. A known failure: the engine likes `Xb2/Xb3` in the
  center even where principles say to conserve big pieces — a classic "crooked eval proxy."
- Numbers are averaged over different level pairs; the `--only=medium,hard` filter gives a
  "stronger" opening estimate but a smaller sample.
- Theoretical values (who wins with perfect play, whether 4×4 is a draw) are **not
  established** — that needs transpositions + solving.

---

## 5. Roadmap (for stronger conclusions)

1. **Transposition table (TT) on `canonicalKey`** — sharply speeds up and deepens search
   (symmetry gives up to 8× fewer nodes), refines opening evals; for 3×3 it enables a
   **strong solve**.
2. **Deeper levels** (depth 5–6) for overnight runs — a "more optimal" labeling.
3. **Draw/repetition inside the search** (not just at game level) — correct termination.
4. **More data** (overnight generator, 16 cores) → statistical significance for a 6–8 ply
   opening tree.
5. **Tuning `evaluate()`** — explicit fork and reveal-threat terms, a moderate center bonus
   (data says ~+6 pts, not a dominating one).

*The tools for all of this are ready: `tools/selfplay.mjs`, `tools/openbook.mjs`,
`tools/analyze-db.mjs`, `tools/overnight.sh`.*
