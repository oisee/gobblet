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
- **Even/odd oscillation by depth (confirmed for 2–7).** Mirror games (equal strength, random opening):

  | Depth | White | Black | Draws | n |
  |---|---|---|---|---|
  | 2 | 23% | 24% | **53%** | 1308 |
  | 3 | **56%** | 40% | 4% | 1305 |
  | 4 | 31% | 31% | **38%** | 125 |
  | 5 | **53%** | 40% | 7% | 124 |
  | 6 | 28% | 28% | **45%** | 1300 |
  | 7 | **56%** | 38% | 6% | 16 |

  **Even depths (2,4,6)** are drawish/balanced; **odd depths (3,5,7)** favor white steadily (~53–56%).
  The result **oscillates by parity — it does not converge.** This is a **shallow-evaluation horizon
  artifact** (the odd-even effect: a leaf is scored differently depending on whose move was last),
  **not the true value of the game.** Key takeaway: **you cannot conclude either "4×4 is a draw" or
  "white wins" — deeper search alone just flips the sign.** Only a real **solve** (with proper draws)
  or a **parity-independent evaluation** (quiescence) can settle it.
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
