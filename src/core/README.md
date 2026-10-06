# `src/core` – deterministic game engine

Pure TypeScript, no DOM/Pixi, no `Math.random`/`Date.now`. A game is fully reproducible from
`seed + config + mode + input log` (+ the same `SimHooks`).

## Modules

| Module          | Purpose                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| `rng.ts`        | sfc32 PRNG seeded via cyrb128; state is a plain `{a,b,c,d}` object. `randInt`, `pick`, `shuffle`, …       |
| `config.ts`     | `SimConfig` + `DEFAULT_CONFIG`, `makeConfig(overrides)`, `riseSpeedForLevel`, `stopTicksFor`              |
| `types.ts`      | `Block`, `BlockState`, `SimState`, `SimInput`, `SimEvent`, …                                              |
| `board.ts`      | grid access, initial board + preview row generation, `pushRow`, `columnTops`                              |
| `match.ts`      | `findMatches` (≥3 horizontal/vertical among resting blocks; reused scratch buffer)                        |
| `gravity.ts`    | hover / fall / land pass                                                                                  |
| `hash.ts`       | `quickHash(sim)` – cheap 53-bit hash for AI / per-frame use                                               |
| `view.ts`       | pure render helpers: `blockRenderPos`, `dangerColumns`                                                    |
| `scoring.ts`    | `base × mult` pipeline of `ScoreModifier` hooks                                                           |
| `sim.ts`        | `createSim`, `step`, `cloneSim`, `canSwap`, `riseFraction`, `MODE_RULES`, `SimHooks`                      |
| `replay.ts`     | sparse `InputLog`, `stepRecorded`, `replay`, `hashState`                                                  |
| `ascii.ts`      | `loadAscii` / `boardToAscii` (tests, puzzles, debugging)                                                  |
| `invariants.ts` | `checkInvariants(sim)` – structural sanity checks                                                         |

State is plain data (`structuredClone`/JSON safe). `createSim` freezes `config`; `cloneSim` is a
hand-written deep copy that shares the frozen config by reference. Run/relic parameters live in
`sim.modifiers` (plain `Record<string, number>`, cloned and hashed). Behaviour that is not data
goes into `SimHooks`, passed to every `step`:

- `scoreModifiers` – extra `ScoreModifier`s after the built-in pipeline;
- `stopTicks(base, {sim, combo, chain})` – adjust stop time earned by a match;
- `onClear({sim, group, colors})` – a group has popped and left the board (may mutate the sim);
- `riseSpeed(base, sim)` – adjust the auto-rise speed.

Hooks must be deterministic and must not step the same sim. Every `Block` has a `kind`
(`'normal' | 'garbage' | 'wild' | 'bomb'`); only `normal` is generated and matching ignores the
kind for now.

## Coordinates

- `cells` is row-major, `index = row * cols + col`. **Row 0 is the top**, row `rows-1` is the
  bottom active row. Columns go left → right.
- `preview` is the next row below the bottom row: visible, never swappable or matchable.
- Rise: `riseOffset` (0..15 sub-units, 16 per cell) + `riseAccum` (fixed point, 1/1000 sub-unit).
  The renderer shifts the whole grid (and preview) up by `riseFraction(sim)` cells. When the offset
  reaches a full cell, every row moves up one index, the preview becomes row `rows-1`, and a new
  preview row is generated.
- Falling blocks: `fall` = sub-unit progress (0..15) towards the next row down.
- Swapping blocks are already stored in their destination cell; `swapDir` (+1 moving right,
  −1 moving left) and `timer` (counting down from `swapTicks`) give the render offset.

## Block states and timings (defaults @ 60 Hz)

```
idle ──swap──▶ swapping (4) ──▶ idle
idle ──support lost──▶ hovering (12) ──▶ falling (1 cell/tick) ──▶ landing (10, cosmetic) ──▶ idle
idle/landing ──match──▶ matched (flash 44) ──▶ popping ──▶ popped (one per 9 ticks, reading order)
     group cleared when the last pop's slot ends: flash + size × 9 ticks after the match
```

- **Swappable** (Panel de Pon rules): empty cells and `idle`/`landing` blocks, not both cells
  empty. Everything else (`swapping`, `hovering`, `falling`, `matched`, `popping`, `popped`) is
  locked. A swap is also `locked` when either cell directly above the pair holds a hovering block
  (no "catching" a hovering block) or a falling block that is part-way into the cell (`fall > 0`;
  otherwise it would have to snap back up).
- **Swap over a gap** (Panel Attack `matchAnyway`): a block whose swap ends over an empty cell is
  still checked for matches on that tick, before it starts hovering, so sliding a block off a
  ledge into a horizontal line clears it in mid-air.
- **Support**: the bottom row is always supported. `swapping`, `matched`, `popping`, `popped`
  blocks are solid. A resting block above a hovering block hovers in sync (copies the timer and
  chain flag); above a falling block it falls along; above a cell that a falling block vacated in
  the same tick it falls right away instead of hovering. Blocks above a matched group stay put
  until it clears, then start hovering on the clear tick.
- **Falling**: progress is clamped so a falling block never overlaps the block below and never
  moves up: on entering a cell above a solid block it lands at once (leftover progress dropped),
  above a hovering block it waits at `fall = 0`, above a falling block it keeps `fall ≤ below.fall`.
- **Matchable**: `idle` and `landing` blocks (plus the `matchAnyway` case above). The board is
  scanned only on ticks where something became matchable (a swap ended, a block landed, a row
  rose, or `matchScanPending` is set – `loadAscii` sets it; set it yourself after editing `cells`
  by hand). All blocks matched in the same tick form one group: `combo` = its size (≥4 is a combo;
  L/T shapes count each block once). `MatchGroup.cells` stores the member indices in pop order.
- **Chain**: when a group clears, every block stacked directly above a cleared cell (up to the first
  gap or other group) gets `chain = true` and starts hovering. A swapping block in that column takes
  the flag too and stops the walk; it keeps the flag while swapping and, if its swap ends over a
  gap, hands it to the blocks above as they start hovering with it (Panel Attack
  `propagatesChaining`). A match containing a chain-flagged block increments `sim.chain`
  (2 = "×2"). A resting block that did not match on the tick it landed loses the flag. The chain
  ends (`chainEnd {length}`) when no group is clearing and no chain-flagged block remains.
- **Stop time**: combo ≥4 → `45 + 10·(combo−4)`; chain ≥2 → `90 + 30·(chain−2)`; the max of those
  and the remaining stop time is kept. It only counts down while no group is clearing.
- **Rise**: frozen while any group is clearing; otherwise paused by stop time. Auto speed per level
  `20 + 14·(level−1)` (1/1000 sub-unit per tick; level 1 ≈ 13 s/row), adjustable by the
  `riseSpeed` hook. Holding raise (`{type:'raise', active:true}`) rises at 2 sub-units/tick and
  cancels stop time – but only when the stack can actually rise (row 0 empty); after release the
  raise finishes the current row. Raise input is not latched while a group is clearing: a tap
  during a clear is ignored and keeps the earned stop time (holding past the end of the clear
  starts a normal manual raise).
- **Danger / top-out**: the stack cannot rise while row 0 holds any block. If a *resting* block is
  in row 0 and the stack wants to rise (no clearing, no stop time), `grace` (120) drains and a
  `danger {active:true}` event fires; at 0 → `gameOver`. `danger {active:false}` fires as soon as
  row 0 holds no resting block, but grace refills only after row 0 has stayed free of resting
  blocks for `graceRefillTicks` (30) consecutive ticks (`graceClearTicks` counts them), so briefly
  unpinning the stack does not reset the timer. Holding raise while pinned neither drains faster
  nor throws away stop time.
- **Levels** (`endless` mode): `startLevel + ⌊tick / 1800⌋ + ⌊blocksCleared / 50⌋`, capped at 20.
- **Modes**: `endless` (rise + levels) and `static` (no rise/levels – puzzles, tests).

## Tick order (`step`)

1. swap / landing timers 2. match groups (flash → pop → clear, chain flags, `onClear`)
3. inputs (in order) 4. gravity (bottom-up) 5. match detection + scoring (incl. blocks whose swap
ended this tick) 6. chain-flag cleanup / `chainEnd` 7. rise, stop time, danger 8. level.

Each `step` returns the events produced in that tick: `swapped`, `swapRejected`, `landed`,
`matched`, `scored`, `popped` (with `index`/`size` for rising pop pitch), `cleared`, `chainEnd`,
`rowRisen`, `danger`, `levelUp`, `gameOver`. After game over `step` is a no-op.
`step(sim, inputs, hooks, events)`: pass an array as `events` to collect into it, or `null` for
silent mode (AI rollouts: no event objects are built, an empty frozen array is returned).

## Rendering

`view.ts` has pure helpers. `blockRenderPos(sim, index)` → `{id, kind, color, state, chain, row,
col, flashProgress, popProgress}`: `row` includes fall progress, `col` the swap offset (blocks are
stored in their destination cell). Draw at screen row `row − riseFraction(sim)`; the preview row
sits at row `rows`. The renderer tracks blocks by `id` across ticks for interpolation: positions
are continuous tick to tick (a row rise drops every `row` by 1 while `riseFraction` wraps to 0),
and blocks never move up relative to the grid. `dangerColumns(sim, rowsFromTop = 2)` lists the
columns whose stack reaches the top two rows (warning visuals).

## Scoring

`base × mult`: base = 10/block + combo bonus `10 · T(combo−3)` (4→10, 5→30, 6→60, 7→100);
mult starts at 1 and the chain adds `chain−1` (chain n ⇒ ×n). Extra `ScoreModifier`s from
`SimHooks.scoreModifiers` run after the built-ins and may change anything in the context.

## Replays

`stepRecorded(sim, log, inputs)` records only non-empty input lists keyed by the step index
(`sim.tick` before the step). `replay(seed, config, log, {mode, hooks})` re-runs and
`hashState(sim)` (cyrb53 over key-sorted JSON) compares states. For AI search and per-frame
change detection use `quickHash(sim)` (~1–2 µs vs ~180 µs; skips config/seed/stats; collisions
possible). `BENCH=1 npx vitest run tests/unit/core/bench.test.ts` prints timings.
