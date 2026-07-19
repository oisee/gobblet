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
- The first move is always `X` (only the largest is accessible in reserve). **Play the
  center** (the core `b2 c2 b3 c3`). **[data]** in strong play the center wins **58%**,
  an edge 54%, a corner 52%. A corner is the worst of the three.
- Don't dump all three `X` on the rim — keep big pieces in reserve for defense.
- Answer the opponent's center with your own center — both sides fight for the core.

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
