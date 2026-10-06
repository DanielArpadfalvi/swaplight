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
| `match.ts`      | `findMatches` (≥3 horizontal/vertical among resting blocks)                                               |
| `gravity.ts`    | hover / fall / land pass                                                                                  |
| `scoring.ts`    | `base × mult` pipeline of `ScoreModifier` hooks                                                           |
| `sim.ts`        | `createSim`, `step`, `cloneSim`, `canSwap`, `riseFraction`, `MODE_RULES`                                  |
| `replay.ts`     | sparse `InputLog`, `stepRecorded`, `replay`, `hashState`                                                  |
| `ascii.ts`      | `loadAscii` / `boardToAscii` (tests, puzzles, debugging)                                                  |
| `invariants.ts` | `checkInvariants(sim)` – structural sanity checks                                                         |

State is plain data (`structuredClone`/JSON safe). Behaviour that is not data (score modifiers
for relics) goes into `SimHooks`, passed to every `step`.

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

- **Swappable**: empty cells and `idle`/`landing` blocks. Not both cells empty. Everything else
  (`swapping`, `hovering`, `falling`, `matched`, `popping`, `popped`) is locked. Swapping a block
  under a hovering block is allowed and "catches" it (it lands when its hover ends, keeping its
  chain flag for that landing's match check).
- **Support**: the bottom row is always supported. `swapping`, `matched`, `popping`, `popped`
  blocks are solid. A resting block above a hovering block hovers in sync (copies the timer); above
  a falling block it falls along. Blocks above a matched group stay put until it clears.
- **Matchable**: `idle` and `landing` blocks only. The whole board is scanned every tick, which is
  equivalent to "after swaps finish and after landings" (also catches matches formed by a new row).
  All blocks matched in the same tick form one group: `combo` = its size (≥4 is a combo; L/T
  shapes count each block once).
- **Chain**: when a group clears, every block stacked directly above a cleared cell (up to the first
  gap, swapping block or other group) gets `chain = true`. A match containing a chain-flagged block
  increments `sim.chain` (2 = "×2"). A resting block that did not match on the tick it landed loses
  the flag. The chain ends (`chainEnd {length}`) when no group is clearing and no chain-flagged
  block remains.
- **Stop time**: combo ≥4 → `45 + 10·(combo−4)`; chain ≥2 → `90 + 30·(chain−2)`; the max of those
  and the remaining stop time is kept. It only counts down while no group is clearing.
- **Rise**: frozen while any group is clearing; otherwise paused by stop time. Auto speed per level
  `20 + 14·(level−1)` (1/1000 sub-unit per tick; level 1 ≈ 13 s/row). Holding raise
  (`{type:'raise', active:true}`) cancels stop time and rises at 2 sub-units/tick; after release
  the raise finishes the current row.
- **Danger / top-out**: the stack cannot rise while row 0 holds any block. If a *resting* block is
  in row 0 and the stack wants to rise (no clearing, no stop time), `grace` (120) drains and a
  `danger {active:true}` event fires; at 0 → `gameOver`. Grace refills (and `danger
  {active:false}` fires) as soon as row 0 holds no resting block. Holding raise while pinned does
  not drain faster.
- **Levels** (`endless` mode): `startLevel + ⌊tick / 1800⌋ + ⌊blocksCleared / 50⌋`, capped at 20.
- **Modes**: `endless` (rise + levels) and `static` (no rise/levels – puzzles, tests).

## Tick order (`step`)

1. swap / landing timers 2. match groups (flash → pop → clear, chain flags) 3. inputs (in order)
4. gravity (bottom-up) 5. match detection + scoring 6. chain-flag cleanup / `chainEnd`
7. rise, stop time, danger 8. level.

Each `step` returns the events produced in that tick: `swapped`, `swapRejected`, `landed`,
`matched`, `scored`, `popped` (with `index`/`size` for rising pop pitch), `cleared`, `chainEnd`,
`rowRisen`, `danger`, `levelUp`, `gameOver`. After game over `step` is a no-op.

## Scoring

`base × mult`: base = 10/block + combo bonus `10 · T(combo−3)` (4→10, 5→30, 6→60, 7→100);
mult starts at 1 and the chain adds `chain−1` (chain n ⇒ ×n). Extra `ScoreModifier`s from
`SimHooks.scoreModifiers` run after the built-ins and may change anything in the context.

## Replays

`stepRecorded(sim, log, inputs)` records only non-empty input lists keyed by the step index
(`sim.tick` before the step). `replay(seed, config, log, {mode, hooks})` re-runs and
`hashState(sim)` (cyrb53 over key-sorted JSON) compares states.
