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
| `gravity.ts`    | hover / fall / land pass (blocks and garbage slabs)                                                       |
| `garbage.ts`    | garbage slabs: `queueGarbage`, `placeGarbage`, drop / conversion (`updateGarbage`, `triggerGarbage`)      |
| `versus.ts`     | attack table, `createVersus` / `stepVersus` lockstep exchange + cancel, versus replays                   |
| `ai/`           | CPU opponent (levels 1–5): static grid model, amortized planner, controller – see "CPU" below             |
| `hash.ts`       | `quickHash(sim)` – cheap 53-bit hash for AI / per-frame use                                               |
| `view.ts`       | pure render helpers: `blockRenderPos`, `dangerColumns`                                                    |
| `scoring.ts`    | `base × mult` pipeline of `ScoreModifier` hooks                                                           |
| `sim.ts`        | `createSim`, `step`, `cloneSim`, `canSwap`, `riseFraction`, `MODE_RULES`, `SimHooks`                      |
| `replay.ts`     | sparse `InputLog`, `stepRecorded`, `replay`, `hashState`                                                  |
| `ascii.ts`      | `loadAscii` / `boardToAscii` (tests, puzzles, debugging)                                                  |
| `invariants.ts` | `checkInvariants(sim)` – structural sanity checks                                                         |
| `run/`          | roguelite run layer (stages, relics, charms, shop, bosses, decks, brightness) – see `run/README.md`       |

State is plain data (`structuredClone`/JSON safe). `createSim` freezes `config`; `cloneSim` is a
hand-written deep copy that shares the frozen config by reference. Run/relic parameters live in
`sim.modifiers` (plain `Record<string, number>`, cloned and hashed). Behaviour that is not data
goes into `SimHooks`, passed to every `step`:

- `scoreModifiers` – extra `ScoreModifier`s after the built-in pipeline (`ctx.sim` is the sim being
  stepped, so stateful modifiers can keep their state in `sim.modifiers`);
- `stopTicks(base, {sim, combo, chain})` – adjust stop time earned by a match;
- `onClear({sim, group, colors})` – a group has popped and left the board (may mutate the sim);
- `riseSpeed(base, sim)` – adjust the auto-rise speed.

Hooks must be deterministic and must not step the same sim.

Engine-level modifier keys (absent = no effect): `swapLockUntil` – every swap is `locked` while
`sim.tick < swapLockUntil`; `lockedColumns` – bit mask, a swap touching a set column is `locked`
(exported as `MOD_SWAP_LOCK_UNTIL` / `MOD_LOCKED_COLUMNS`).

Every `Block` has a `kind` (`'normal' | 'garbage' | 'wild' | 'bomb'`); the board only generates
`normal` blocks (run charms/relics convert them; garbage comes from `garbage.ts`). While a `wild` or `bomb` is on the board,
`findMatches` takes a slower path: a **wild** is a joker – a run is a maximal line of ≥3 matchable
blocks whose non-wild members share one color (`RRWGG` clears 5, `RWG` nothing, `WWW` clears); a
matched **bomb** pulls every matchable block of its 3×3 neighbourhood into the same group (bombs
caught in a blast detonate too), so a blast is one bigger combo. `garbage` never matches (see
"Garbage" below).

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
idle/landing ──match──▶ matched (flash 26) ──▶ popping ──▶ popped (one per 5 ticks, reading order)
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

## Garbage

Panel de Pon style slabs, `width × height` (versus sends 3–6 wide). State: `sim.garbage`
(`GarbageSlab {id, row (top), col, width, height, state, timer, convertTicks, fall, chain}`),
`sim.garbageQueue` (incoming, `QueuedGarbage {id, width, height, delay, fromChain}`), `nextSlabId`,
`garbageDrops`. Each slab cell is a `Block` with `kind: 'garbage'` and `slab = slab id` (`slab` is 0
for every other block); the slab record is authoritative and its state is mirrored into its cells
(`converting` ↔ cell state `matched` with `group 0`), so per-cell rules (support, hover sync,
`canSwap`'s "nothing hovering above") see garbage like any block. Garbage cells are never swappable
and never match.

- **Queue / drop**: `queueGarbage(sim, w, h, {delay, fromChain}, events?)` (emits `garbageQueued`).
  The front entry drops when its delay is over, no chain is open and no group is clearing, and the
  top rows over its columns are free: it appears at row 0 (`garbageDropped`) and falls. 6-wide
  slabs take the full row; narrower ones alternate right / left. A slab taller than the free space
  drops in parts (the rest stays queued). If row 0 is blocked it waits – meanwhile the stack is
  pinned and the normal danger / grace / top-out rules apply (garbage resting in row 0 counts).
- **Gravity**: a slab moves as a unit, processed when the bottom-up gravity scan reaches its
  bottom-left cell: supported if it is on the bottom row or *any* cell under it is solid; resting
  only on hovering / falling blocks it hovers / falls with them; with nothing under it it hovers
  `hoverTicks` (or falls at once into cells vacated this tick), then falls at `fallSpeed` and lands
  (`garbageLanded`, `landTicks` landing). Blocks on top ride along like on any block. A clear right
  under a slab flags it `chain` (blocks riding it inherit the flag).
- **Conversion**: a match orthogonally adjacent to a *resting* slab triggers it, and every resting
  slab touching a triggered slab is triggered too (`garbageConverting {slabIds, ticks}`). Triggered
  slabs flash for `min(garbageMaxConvertTicks, flashTicks + garbagePopTicks × cells)` (defaults 3 /
  180); then the bottom row of each turns into random normal blocks with the chain flag (unsupported
  ones start hovering) and the slab shrinks by a row or disappears (`garbageConverted {slabId,
  blocks, remaining}`). The converted blocks can continue the chain. While any slab converts, rise
  is frozen and the chain stays open.
- `placeGarbage(sim, row, col, w, h)` puts a slab directly on the board (tests, puzzles, bosses).
  `boardToAscii` prints garbage as `#`; `slabRenderPositions(sim)` (view.ts) gives one rectangle per
  slab (incl. fall progress and `convertProgress`); `blockRenderPos(...).flashProgress` of a garbage
  cell is its slab's conversion progress.

## Versus (`versus.ts`)

`createVersus(seed, sideA, sideB, rules?)` → plain-data `VersusState` with two sims (same board seed
by default, `rules.sameBoards`). `stepVersus(vs, inputsA, inputsB, hooks?)` steps both sims, then
exchanges garbage; returns `{events: [a, b], sent: [a, b]}` (`garbageQueued` events land in the
receiver's list). When a side tops out the other wins (`winner`, both on one tick = `draw`); later
steps are no-ops. `versusLeader(vs)` judges an unfinished match (net garbage, then stack height).

- **Attack table**: one match of n ≥ 4 blocks sends `n−1` cells wide garbage at once (4→3, 5→4,
  6→5, 7→6; larger combos split into balanced slabs ≤ cols: 8→3+4, 9→4+4, 13→6+6); a chain of
  length n ≥ 2 sends one 6×(n−1) slab when it ends (`chainEnd`).
- **Delay / preview**: sent garbage is queued on the receiver with `rules.attackDelay` (60 ticks);
  the receiver's `sim.garbageQueue` is the "incoming" preview.
- **Cancel** (`rules.cancel`, default on): a side's new attacks first eat its own incoming queue
  (front first, whole entries or whole rows of a taller entry); only the rest is sent. Both sides
  cancel against their pre-tick queues before anything is delivered, so A/B order never matters.
- **Side rules** (`rules.sides[i]`, `VersusSideRules`, default no handicap): `attackPercent`
  (only that share of the side's garbage is sent – whole slabs are dropped deterministically via an
  `attackCredit` counter on the side), `attackFromTick` (attacks before that tick are discarded)
  and `extraDelay` (added to `attackDelay`). Cancelling own incoming garbage is never handicapped.
  `makeVersusRules(partial)` fills the defaults.
- **Replays**: `stepVersusRecorded(vs, log, a, b)`, `replayVersus(seed, sideA, sideB, log)`,
  `hashVersus(vs)`.

## CPU (`ai/`)

`createCpu(level 1–5, {seed, hooks})`, then each tick `inputs = cpuStep(cpu, sim)` *before*
stepping that sim. Deterministic (own seeded RNG; work is budgeted in units, never wall time), so a
CPU match replays from the versus input log.

| level      | swaps/s | reaction | drag | 2-move setups | verified | mistakes | skill chains | raise below | versus handicap |
| ---------- | ------- | -------- | ---- | ------------- | -------- | -------- | ------------ | ----------- | --------------- |
| 1 Easy     | 1.5     | 45 t     | 1    | –             | 2        | 30 %     | –            | 4           | 50 % of its garbage, none in the first 15 s, +1 s arming delay |
| 2 Normal   | 2.5     | 18 t     | 3    | –             | 3        | 6 %      | –            | 5           | –               |
| 3 Hard     | 4       | 16 t     | 3    | 4             | 5        | 3 %      | –            | 6           | –               |
| 4 Expert   | 6       | 9 t      | 3    | 8             | 6        | –        | yes          | 7           | –               |
| 5 Insane   | 8       | 4 t      | 4    | 12            | 8        | –        | yes          | 7           | –               |

The handicap is `CpuProfile.handicap` → `cpuSideRules(level)`, applied by the game glue as the
CPU side's `VersusRules.sides[1]`. Swaps/s is the input-speed cap; the effective rate is much
lower because the CPU waits for a calm board (measured ≈ 0.25 / 0.6 / 1.2 / 1.9 / 2.4 swaps/s).
Difficulty ladder (`BALANCE=1 npx vitest run tests/unit/core/versusBalance.test.ts`): a scripted
player making at most one match per 2.5 s beats Easy ≈ 80 %, one per 1.25 s beats Normal
≈ 55 %, Hard ≈ 5–20 %, Expert ≤ 10 %, Insane 0 %; an idle player loses to Easy in ≈ 45–60 s.

Loop: wait `reactionTicks` → `planSearch` (a generator resumed every tick until its per-tick work
`budget` is used): (1) every single-block drag of 1..maxDrag swaps is applied to a static color grid
(`ai/grid.ts`: instant gravity, chain = a match containing a block that fell) and scored by garbage
sent, chain, clears, garbage touched, stack height / danger, bumpiness, holes and match potential;
(2) the best non-clearing "setup" drags are combined with every second drag (2-move chains / vertical
matches); (3) the best few candidates and a no-move baseline are re-checked with real rollouts on a
`cloneSim` of the live board (silent `step`, swaps spaced `actionTicks` apart, until the board is
calm) and the best real result is taken if it beats the baseline (Easy/Normal sometimes take a
worse verified one). On a busy board (groups clearing), Expert/Insane plan on the projected board
(clearing cells removed, blocks above fall with the chain flag) to extend the running chain ("skill
chains"); lower levels wait for a calm board. Each planned swap is re-validated before it is issued
(expected block ids + a one-tick probe step on a clone), so the CPU never sends a swap the sim
would reject. With nothing worth doing on a calm, low stack it taps manual raise. Measured cost:
≈0.01–0.2 ms per tick on average (`BENCH=1 npx vitest run tests/unit/core/ai.test.ts`);
`AI_LONG=1` runs the longer strength checks (each level beats the one below in ≥ 6/8 matches).

## Tick order (`step`)

1. swap / landing timers 2. match groups (flash → pop → clear, chain flags, `onClear`), then
garbage (landing / conversion timers, queue delays, drop) 3. inputs (in order) 4. gravity (bottom-up) 5. match detection + scoring (incl. blocks whose swap
ended this tick) 6. chain-flag cleanup / `chainEnd` 7. rise, stop time, danger 8. level.

Each `step` returns the events produced in that tick: `swapped`, `swapRejected`, `landed`,
`matched`, `scored`, `popped` (with `index`/`size` for rising pop pitch), `cleared`, `chainEnd`,
`rowRisen`, `danger`, `levelUp`, `gameOver`, `garbageDropped`, `garbageLanded`,
`garbageConverting`, `garbageConverted` (`garbageQueued` comes from `queueGarbage`). After game over `step` is a no-op.
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
