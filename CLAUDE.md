# Swaplight – contributor guide (for humans and agents)

Neon panel-swap versus puzzle game with a roguelite run mode. Plan: `docs/PLAN.md` (Hungarian). Task list / status: `docs/TASKS.md`.

## Stack
Vite + TypeScript (strict) · PixiJS v8 (gameplay canvas) · Preact (DOM UI overlay) · Capacitor (iOS/Android) · Vitest · Playwright.

## Architecture rules
- `src/core/` is pure, deterministic game logic: no DOM, no Pixi, no `Math.random`, no `Date.now`. Use the seeded RNG from `src/core/rng.ts`. Fixed 60 Hz ticks. Everything must be replayable from seed + input log.
- `src/render/` reads core state and draws it; it never mutates core state.
- `src/platform/` wraps every native/Capacitor API behind an interface with a web/mock implementation. No other module imports `@capacitor/*` directly.
- All user-visible strings go through `src/i18n/` (EN + HU).
- No external bitmap assets: graphics are generated in code (Pixi Graphics/filters, SVG).

## Commands
- `npm run dev` – dev server
- `npm run check` – typecheck + lint + unit tests (must pass before every commit)
- `npm run test:e2e` – Playwright (Chromium at /opt/pw-browsers; never run `playwright install`)
- `npm run build` – production web build

## Conventions
- Small focused modules, named exports, no default exports.
- Unit tests next to the domain in `tests/unit/**`, e2e in `tests/e2e/**`.
- Core logic changes need unit tests. Bug fixes need a regression test.
- Native Android/iOS builds run only in GitHub Actions (dl.google.com is blocked in the cloud dev container).
