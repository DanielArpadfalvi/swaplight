# `src/core/run` – roguelite run layer

Pure, deterministic meta-game on top of the sim (no DOM/Pixi, no `Math.random`). A run is plain
JSON data (`RunState`); every function that changes a run returns a **new** run (the input is never
mutated) – except `useCharm`, which also mutates the stage's sim it is given.

## Flow

```
createRun(seed, deckId = 'neon', brightness = 1)          phase 'stage'
  └─ stageConfig(run) → { seed, mode, config, modifiers, hooks, goal, info, curses }
       createStageSim(setup); each tick: step(sim, inputs, setup.hooks)
       evaluateStage(setup.goal, sim) → { value, target, progress, ratio, ticksLeft, won, lost, finished }
       (useCharm(run, slot, sim, target?) at any time)
  └─ completeStage(run, stageResult(goal, sim)) → { run, rewards }
       lost → phase 'lost' · won → phase 'shop' (or 'won' after the act-3 boss)
  └─ shop: buyRelic / buyCharm / sellRelic / sellCharm / reroll / useCharm(golden ticket)
  └─ leaveShop(run) → next stage (phase 'stage')
```

3 acts × (3 stages + boss) = 12 stages. The whole plan (goal type per stage, boss curses) is
drawn at `createRun` so the UI can show what is coming. Act 1 stage 1 is always a score stage,
no goal type repeats twice in a row inside an act, and boss stages are score stages with curses.

| Module         | Purpose                                                                       |
| -------------- | ----------------------------------------------------------------------------- |
| `types.ts`     | `RunState`, `StageGoal`, `RunEffect`, `RelicDef`, `CharmDef`, `CurseDef`, …   |
| `goals.ts`     | `GOAL_TUNING`, `makeGoal`, `evaluateStage`, `stageResult`                     |
| `effects.ts`   | effect ordering, `buildHooks` (→ `SimHooks`), `runEconomy`                    |
| `stage.ts`     | `stageConfig`, `createStageSim`, `relicStateFrom`                             |
| `run.ts`       | `createRun`, `makePlan`, `computeRewards`, `completeStage`, `leaveShop`, `useCharm`, persistence |
| `shop.ts`      | offers, prices, buy/sell/reroll                                               |
| `relics.ts` · `charms.ts` · `bosses.ts` · `decks.ts` | content (data + effect functions)       |
| `boardOps.ts`  | safe deterministic board edits used by charms/relics                          |
| `keys.ts`      | `sim.modifiers` keys used by the run layer                                    |

## Determinism and RNG streams

- **Run RNG** (`run.rng`, seeded `"<seed>|run"`): plan, deck start relic, shop offers, rerolls.
  Nothing else consumes it.
- **Stage sim seed** `"<seed>|stage|<act>|<stage>"`: board generation and in-stage randomness
  (charms like Kaleido/Joker, relics like Domino use `sim.rng`).
- **Curse parameters** (`"<seed>|curse|<act>|<stage>"`): which color is veiled, which column locked.
- `stageConfig` is pure; calling it does not advance any stream.
- All in-stage state (relic counters, stage counters, charm timers, curse flags) lives in
  `sim.modifiers`, so hooks are safe for AI rollouts on cloned sims and are included in the sim
  hashes. Relic state is copied in at `stageConfig` (`relic.<id>.<key>`) and read back by
  `completeStage` from `StageResult.modifiers`.
- Replays: the sim input log does not contain charm uses. The game layer should log
  `{tick, slot, target}` and re-apply `useCharm` before the step with that tick.
- Save/resume: `serializeRun` / `deserializeRun` (validates version and every id); mid-stage,
  save the sim JSON alongside and rebuild the hooks with `stageConfig(run)` (tested).
  `runHash(run)` = cyrb53 over key-sorted JSON.

## Scoring order (Balatro-like)

The engine first computes the built-ins: `base = 10/block + combo bonus`, `mult = chain level`.
The run adds **one** score modifier that walks the active effects in this order:

`core → deck → brightness levels (ascending) → relics (slot order, left → right) → curses`

and applies, per match:

0. `onMatch` of every effect (state updates and reactions, e.g. Momentum counts the chain,
   Stagger sets a swap lock, Sapphire Tide grants stop time);
1. `base += Σ base(c)`;
2. `mult += Σ mult(c)`;
3. `mult ×= Π xmult(c)`;

then the engine floors `base × mult` (≥ 0). So every additive bonus is multiplied by every ×mult
regardless of slot order; slot order only matters for state updates within the same phase.
`stopTicks` and `riseSpeed` hooks are chained in the same effect order (curses last, so
The Drought beats Chronoglass). The core effect handles stage chain counters
(`stage.chain.<L>`), Overcharge (+3 mult) and Cryo (rise speed 0).

## Stage goals (`GOAL_TUNING` in goals.ts)

| type          | target                                                                     | time limit           | start level         |
| ------------- | -------------------------------------------------------------------------- | -------------------- | ------------------- |
| `scoreInTime` | `niceRound(700 × act[1, 2, 4] × stage[1, 1.2, 1.4, boss 1.7] × (B≥2: 1.15))`; B≥6 act factors 1, 2.5, 5.5 | 60 s (boss 75 s) | `1 + 2(act−1) + (stage ≥ 2)` |
| `clearBlocks` | `(45 + 8·stage + 16·(act−1)) × (B≥2: 1.1)` blocks (charm removals count)    | 90 s                 | same                |
| `survive`     | survive the time limit                                                      | 40 + 5·stage + 10·(act−1) s | same **+ 4**  |
| `chainTarget` | act 1: 1/2/3 chains ≥×2 · act 2: 3/4/5 chains ≥×2 · act 3: 1/2/3 chains ≥×3 | 90 s                 | same                |

Score goals scale steeply because relics multiply score; block/survive/chain goals scale gently
and get their pressure from the speed level. A stage is **won** as soon as the value reaches
the target, but it **finishes** only once the board settles, so a chain in progress keeps
counting ("overkill"). It is **lost** on top-out or when time runs out first.

## Szikra (currency)

Start: deck value (4; Gambler 6). After a **won** stage (`computeRewards`):

| part        | formula                                                                         |
| ----------- | ------------------------------------------------------------------------------- |
| base        | 3 / 4 / 5 for stages 1–3, **8** for the boss (+ deck delta; 0 for an act's first stage from B3) |
| overachieve | +1 per full 25 % above the goal, cap 3 (not survive) × relic multiplier          |
| time        | +1 per full 15 s left, cap 3 (not survive) × relic multiplier                    |
| interest    | +1 per 5 Szikra held before the payout, cap 5 (relics/deck/brightness change the cap) |
| relics      | `stageBonus`, `bossBonus` (boss stages), `stageEnd` payouts (Amber Bank)         |

## Shop

- 3 relics + 2 charms (Gambler: 4 + 3), drawn from the run RNG. Owned relics and duplicates are
  never offered. Relic rarity weights per act (common/uncommon/rare/legendary):
  act 1 70/25/5/0 · act 2 55/32/11/2 · act 3 45/33/17/5; an exhausted rarity falls back to the
  others by weight.
- Prices: relic price (+1 Gambler, +1 from B5); charm price (+1 from B5).
- Reroll replaces all offers: free rerolls first (Coupon Book), then 2, 3, 4 … (resets every shop).
- Sell (shop only): ⌊paid / 2⌋, min 1. Selling Expansion Rack is refused if the remaining relics
  would not fit.
- Slots: 5 relics, 2 charms (deck / relics change them).

Actions return `{ ok, run, reason? }` with `reason` ∈ `phase | index | sold | funds | slots | noSim | noEffect`.

## Relics (47)

Relic state is plain numbers (`initialState`, persisted for the run; `stageStart` resets
stage-scoped keys). i18n keys: `relic.<id>.name` / `.desc` (stubs; English text in `desc`).

| id | rarity | price | effect | hooks |
| --- | --- | --- | --- | --- |
| `spark_plug` | common | 4 | +15 base on every clear. | base |
| `heavy_hand` | common | 5 | Combos (4+ blocks): +10 base per block. | base |
| `ruby_ember` | common | 4 | +10 base for every red block cleared. | base |
| `jade_echo` | common | 4 | Clears with a green block: +3 mult. | mult |
| `sapphire_tide` | common | 5 | Clearing blue blocks grants at least 1 s of stop time. | onMatch |
| `steady_hand` | common | 4 | Plain clears (3 blocks, no chain): +2 mult. | mult |
| `lucky_four` | common | 4 | Combos of exactly 4: +4 mult. | mult |
| `slow_tide` | common | 5 | The stack rises 20% slower. | riseSpeed |
| `chronoglass` | common | 5 | Stop time earned +50%. | stopTicks |
| `piggy_bank` | common | 4 | +2 Szikra after every won stage. | economy |
| `overclock` | common | 5 | +1 mult per speed level above 1. | mult |
| `packed_stack` | common | 4 | +1 base per block on the board. | base |
| `early_bird` | common | 4 | +3 mult during the first 20 seconds of a stage. | mult |
| `constellation` | common | 5 | +1 mult per relic owned. | mult |
| `recycler` | common | 4 | Using a charm gives +2 Szikra. | economy |
| `overachiever` | common | 4 | Overachievement Szikra is doubled. | economy |
| `clockwork` | common | 4 | Remaining-time Szikra is doubled. | economy |
| `bounty_hunter` | common | 5 | +5 Szikra for every boss defeated. | economy |
| `refractor` | uncommon | 6 | Chain links: +2 mult. | mult |
| `cascade_coil` | uncommon | 6 | Chain links: +25 base per chain level above 1. | base |
| `violet_fever` | uncommon | 6 | +1 mult for every purple block cleared. | mult |
| `amber_bank` | uncommon | 6 | +1 Szikra per 10 yellow blocks cleared in a stage (max 4). | onMatch, stageEnd |
| `hot_streak` | uncommon | 6 | Clears within 2.5 s of each other build a streak: +1 mult per step (max +8). | onMatch, mult |
| `snowball` | uncommon | 6 | Gains +5 base for the rest of the run with every combo of 5+. | onMatch, base, run state |
| `last_stand` | uncommon | 7 | ×2 mult while any block sits in the top two rows. | xmult |
| `featherweight` | uncommon | 6 | Blocks hover 6 ticks longer before falling (easier chains). | config |
| `safety_net` | uncommon | 6 | The stack rises at half speed while it is within 3 rows of the top. | riseSpeed |
| `compound_interest` | uncommon | 6 | Interest cap +5. | economy |
| `coupon_book` | uncommon | 6 | The first reroll in every shop is free. | economy |
| `talisman_pouch` | uncommon | 6 | +1 charm slot. | economy |
| `expansion_rack` | uncommon | 7 | +2 relic slots (net +1). | economy |
| `afterglow` | uncommon | 6 | For 10 s after using a charm: +4 mult. | mult |
| `minimalist` | uncommon | 6 | +3 mult per empty relic slot. | mult |
| `domino` | uncommon | 7 | Every 3rd combo (4+) turns a random block into a bomb. | onClear |
| `clean_sweep` | uncommon | 6 | ×1.5 mult when at most 18 blocks remain after the clear. | xmult |
| `stasis_field` | uncommon | 7 | +4 mult while stop time is active. | mult |
| `supernova` | rare | 8 | Combos of 6+: ×2 mult. | xmult |
| `chain_reactor` | rare | 8 | Chain links: ×(1 + 0.25 per chain level above 1) mult. | xmult |
| `glass_cannon` | rare | 8 | ×2 mult, but the stack rises 25% faster. | xmult, riseSpeed |
| `rainbow_bridge` | rare | 8 | Clears with 2 colors: ×1.5 mult; 3+ colors: ×3 mult. | xmult |
| `momentum` | rare | 9 | Gains ×0.1 mult for the rest of the run with every chain that reaches ×3. | onMatch, xmult, run state |
| `joker_seed` | rare | 8 | Chain links of ×3 or more turn a random block into a wild block. | onClear |
| `gold_leaf` | rare | 8 | +1 mult per 5 Szikra held when the stage started (max +10). | mult |
| `infinity_loop` | legendary | 12 | Chain ×n gives n² mult instead of n. | mult |
| `midas_engine` | legendary | 12 | ×1.25 mult, +×0.25 for every boss defeated this run. | xmult |
| `black_hole` | legendary | 12 | Combos: ×(1 + 0.5 per block above 3) mult. | xmult |
| `zenith` | legendary | 12 | +2 mult per level of the longest chain made this run. | onMatch, mult, run state |

## Charms (15, max 2 held)

`apply(sim, {target?})` mutates the sim deterministically and returns false when nothing
happened (the charm is then kept). Board edits only touch "free" blocks (not in a clearing group,
not mid-swap) and set `matchScanPending`; removed blocks count towards `clearBlocks` goals
(`stage.charmCleared`) but score nothing. Default targets: tallest column / its top block /
bottom row. i18n keys `charm.<id>`.

| id | rarity | price | use | effect |
| --- | --- | --- | --- | --- |
| `purge` | common | 4 | stage | Purge: clear a column (default: the tallest). |
| `undertow` | common | 4 | stage | Undertow: remove the bottom row; everything above drops. |
| `cryo` | common | 3 | stage | Cryo: freeze the auto-rise for 5 seconds. |
| `monotone` | uncommon | 5 | stage | Monotone: recolor a row (default: the bottom row) to its most common color. |
| `kaleido` | common | 3 | stage | Kaleido: shuffle the colors of the top three rows of the stack. |
| `joker` | uncommon | 5 | stage | Joker: two random blocks become wild (they match any color). |
| `fuse` | uncommon | 4 | stage | Fuse: two random blocks become bombs (a matched bomb clears its 3×3 area). |
| `detonate` | uncommon | 5 | stage | Detonate: blast the 3×3 area around a block (default: top of the tallest column). |
| `hourglass` | common | 3 | stage | Hourglass: +8 seconds of stop time. |
| `overcharge` | uncommon | 5 | stage | Overcharge: +3 mult on every clear for 15 seconds. |
| `golden_ticket` | common | 4 | any | Golden Ticket: gain 6 Szikra. |
| `vanish` | rare | 6 | stage | Vanish: remove every block of the most common color in the top three rows. |
| `skeleton_key` | common | 3 | stage | Skeleton Key: unlock frozen columns and swap locks for the rest of the stage. |
| `lantern` | common | 3 | stage | Lantern: reveal the hidden color. |
| `lifeline` | rare | 5 | stage | Lifeline: clear the top three rows of the board and refill the top-out grace. |

**Wild / bomb blocks** (engine, see `../README.md`): a wild is a joker in a line of 3+; a matched
bomb clears its 3×3 neighbourhood as part of the same combo. They come from Joker, Fuse, Domino
and Joker Seed, and combo with Rainbow Bridge (mixed colors) and combo relics.

## Bosses (8 curses)

One curse per boss (distinct across the run), two from Brightness 8. Renderer/UI flags live in
`sim.modifiers`: `hiddenColor` (The Veil – draw that color invisible; Lantern removes it),
`lockedColumns` / `swapLockUntil` (engine-enforced in `canSwap`; show a lock overlay; Skeleton Key
removes them). Boss stages pay 8 base Szikra. i18n keys `boss.<id>`.

| id | curse |
| --- | --- |
| `surge` | The Surge: the stack rises 60% faster. |
| `veil` | The Veil: one color is invisible (shapes only flicker on match). |
| `lock` | The Lock: one of the middle columns is frozen – its blocks cannot be swapped. |
| `spectrum` | The Spectrum: one extra block color. |
| `drought` | The Drought: combos and chains earn no stop time. |
| `judge` | The Judge: clears score half unless they are part of a chain. |
| `stagger` | The Stagger: every chain link locks swapping for 1 second. |
| `shiver` | The Shiver: blocks hover only a third as long before falling. |

## Decks (6)

i18n keys `deck.<id>`.

| id | free | rules |
| --- | --- | --- |
| `neon` | yes | Neon: the standard rules. 4 Szikra, a Hourglass charm. |
| `prism` | – | Prism: 6 block colors, but every clear scores ×2 mult. |
| `zen` | – | Zen: the stack rises 30% slower; stage rewards −1 Szikra, interest cap −2. |
| `gambler` | – | Gambler: shops offer one more relic and charm, relics cost +1. Starts with 6 Szikra. |
| `cascade` | – | Cascade: chain ×n gives 2n−1 mult, but combos earn no combo bonus. |
| `collector` | – | Collector: 6 relic slots and a random common relic, but only 1 charm slot. |

## Brightness 1–8 (cumulative)

i18n keys `brightness.<n>`.

| level | rule |
| --- | --- |
| 1 | Glow: the standard run. |
| 2 | Dim: goals +15% (score) / +10% (blocks). |
| 3 | Flicker: the first stage of each act pays no base Szikra. |
| 4 | Pressure: the stack rises 15% faster. |
| 5 | Scarcity: everything in the shop costs +1. |
| 6 | Escalation: score goals grow faster in acts 2 and 3. |
| 7 | Haste: stop time −25%, interest cap −2. |
| 8 | Eclipse: every boss carries two curses. |

## Design notes

- **Readable math**: everything is `base × mult`; relic text says which phase it touches.
  `+base`, `+mult`, `×mult` mirror Balatro's chips / +mult / ×mult so players can reason about
  synergies (e.g. Spark Plug + Refractor + Glass Cannon = (30+15) × (2+2) × 2).
- **Synergy clusters**: chains (Refractor, Cascade Coil, Chain Reactor, Momentum, Infinity Loop,
  Zenith, Featherweight, Cascade deck); combos (Heavy Hand, Lucky Four, Supernova, Black Hole,
  Snowball, Domino → bombs → bigger combos); colors (Ruby/Jade/Sapphire/Amber/Violet, Rainbow
  Bridge + bombs/wilds for mixed clears); danger play (Last Stand, Packed Stack vs. Clean Sweep);
  stop time (Chronoglass, Sapphire Tide, Hourglass → Stasis Field); economy (interest, Gold Leaf,
  Piggy Bank, Coupon Book, Recycler + Golden Ticket); slots (Minimalist vs. Constellation /
  Expansion Rack).
- **Counterplay**: bosses are announced at run start; Lantern, Skeleton Key, Cryo, Lifeline are
  cheap answers to specific curses.
- **Balance** (`BALANCE=1 npx vitest run tests/unit/core/run/balance.test.ts`): a relic-less
  "human-speed" bot (≤ 2 swaps/s, 2-ply lookahead) scores ~1 500–1 900 per 60 s at any level, so
  act-1 score goals need 0.4–0.65 of that, act 2 roughly 1×, act 3 2–2.5× (i.e. a relic build).
  The greedy test bot wins ~30 % of B1 runs and ~0–20 % of B8 runs; most bot losses are ×3-chain
  goals (it cannot plan chains), which humans can.
