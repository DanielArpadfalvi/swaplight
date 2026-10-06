# Task list

Status: `[ ]` todo · `[~]` in progress · `[x]` done (verified by orchestrator). Acceptance criteria (AC) must all hold.

## M0 – Foundation
- [x] **T0.1 Scaffold** – Vite + TS strict, ESLint (flat config) + Prettier, Vitest, Playwright (Chromium from /opt/pw-browsers), PixiJS v8, Preact. Scripts per CLAUDE.md. Minimal `index.html` that mounts a Pixi canvas (portrait, fills viewport, DPR-aware) and a Preact overlay root. AC: `npm run check`, `npm run build`, `npm run test:e2e` (smoke test: page loads, canvas exists, no console errors) all pass.
- [x] **T0.2 CI** – `.github/workflows/ci.yml`: node 22, npm ci, check, build, e2e. AC: valid YAML, mirrors local commands.

## M1 – Core engine (`src/core`)
- [x] **T1.1 RNG + board model** – seeded PRNG (sfc32/mulberry32), board 6×12 + preview row, block states (idle, swapping, hovering, falling, landing, flashing/clearing, garbage), board generation without initial matches.
- [x] **T1.2 Simulation** – fixed tick: swap (incl. swap into empty), hover/fall/gravity, match detection (h+v, ≥3), flash→clear timings, combo, chain tracking (chain flag on blocks), rise (auto + manual), stop-time after combos/chains, danger/top-out game over with grace. Event stream (matched, cleared, chain, combo, landed, swapped, gameOver) for render/audio.
- [x] **T1.3 Scoring & replay** – base × mult scoring hooks (extensible for relics), input log + replay; tests: determinism (same seed+inputs ⇒ same state hash), chain/combo scenarios.

## M2 – Playable prototype
- [x] **T2.1 Renderer** – Pixi board view with interpolation from core state, neon block shapes per color, preview row dimmed, rise offset smooth.
- [x] **T2.2 Touch input** – drag block horizontally to swap (multi-swap while dragging), swipe-up/hold to raise, pointer events, works with mouse too.
- [x] **T2.3 Endless mode + HUD** – score, chain/combo popups, speed level, game over screen, restart. AC: Playwright test plays scripted swaps; screenshots reviewed.

## M3 – Game feel
- [ ] T3.1 Particles, glow filters, screen shake, chain popups
- [x] T3.2 Procedural SFX (Web Audio) + generative music
- [ ] T3.3 Haptics hook via platform layer; reduced-motion setting; perf pass (60 FPS)

## M4 – Run mode
- [x] T4.1 Stage goals + run structure (3 acts × 3 stages + boss), currency
- [x] T4.2 Relic system (effect hooks) + first 40 relics
- [x] T4.3 Charms (15) + shop (buy/sell/reroll)
- [x] T4.4 Bosses (8 curses) + decks (6) + Brightness levels 1–8
- [x] T4.5 Run UI: stage intro, shop, relic bar, run summary

## M5 – More modes
- [x] T5.1 Garbage blocks + Versus CPU (AI, 5 difficulties)
- [x] T5.2 Daily challenge (date seed + modifier)
- [x] T5.3 Puzzle mode + solver/validator + 4 packs × 30
- [x] T5.4 Interactive tutorial

## M6 – Meta & UI
- [x] T6.1 Main menu, mode select, settings, pause
- [x] T6.2 Save system (versioned, migrations), stats, collection, unlocks
- [x] T6.3 i18n EN/HU, accessibility options

## M7 – Mobile shell
- [x] T7.1 Capacitor setup (android/ios), app id, safe areas, lifecycle pause/resume, status bar
- [x] T7.2 Icon + splash generated from code
- [x] T7.3 CI workflows: Android AAB/APK, iOS build on macOS runner

## M8 – Monetization
- [ ] T8.1 Purchases interface + mock + RevenueCat impl, entitlement gating, paywall, restore

## M9 – Release prep
- [ ] T9.1 Store listing EN/HU, generated screenshots, privacy policy, age-rating answers
- [ ] T9.2 Signed release pipeline + fastlane, `docs/RELEASE.md`
- [ ] T9.3 Balance + full QA pass
