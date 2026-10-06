# Teljesítmény (T3.3 perf pass)

Cél: 60 FPS telefonon, az összes módban, a legdurvább effekt-terhelés mellett is. Ez a fájl leírja, hogyan mérünk, mit találtunk és javítottunk, és mi maradt nyitva.

## Hogyan mérünk

```bash
npm run test:perf     # tests/e2e/perf.spec.ts, külön Playwright config, 1 worker
```

- **Mit mér:** a főszál munkáját frame-enként, fázisokra bontva:
  - `sim`: tickek és esemény-visszajelzés;
  - `update`: interpoláció, effektek, háttér;
  - `draw`: a Pixi scene-bejárás és a WebGL parancsok összeállítása;
  - `ui`: a frame alatt sorba állított Preact renderek.

  Mellé CDP-ből: layout/style recalc frame-enként, és a megtartott heap-növekedés GC után (szivárgásfigyelés).
- **CPU-lassítás:** 4× (`Emulation.setCPUThrottlingRate`), ez a gyengébb közép- és alsókategóriás Androidot közelíti. Az iPhone-ok és a felsőkategóriás Androidok ennél jóval gyorsabbak.
- **Miért nem FPS-t mérünk:** a konténerben és a CI-ban a WebGL szoftveresen (SwiftShader) fut a GPU-folyamatban, így a falióra szerinti FPS semmit sem mond egy valódi GPU-ról. A főszál munkája viszont megbízhatóan mérhető, és ekkora jelenetnél telefonon ez szokta eldobni a frame-eket.
- **Hook:** `window.__swaplight.perf.profile({ frames, stress })` (csak `?test` módban). A `stress` minden 20. frame-ben egy 5-ös lánc teljes visszajelzését injektálja (4 burst, 2 popup, shake, flash), minden 7. frame-ben pedig egy kis tisztítást.
- **Előmelegítés:** minden forgatókönyv előtt 240 menüs frame fut, ahogy egy valódi játékosnál is (lásd lent: textúra-előmelegítés).
- **Kimenet:** konzoltáblázat, és forgatókönyvenként JSON a `test-results/perf/` mappában.
- **Futtatás:** a CI az e2e után, külön lépésben futtatja (`.github/workflows/ci.yml`). Párhuzamos futásban a többi teszt elvenné a CPU-t, és a mérés bizonytalanná válna.

A küszöbök **regressziós őrök**, nem célok. 4× lassítással mindenhol: átlag < 16,7 ms, p95 < 16,7 ms (a versus stresszjelenetnél < 25 ms), mód-indítás leghosszabb frame-je < 120 ms, layout < 0,5 frame-enként, heap-növekedés < 2 MB.

## Eredmények (4× CPU, 390×844, a javítások után)

| Forgatókönyv | átlag | p95 | max | >16,7 ms frame |
|---|---|---|---|---|
| Endless, nyugodt tábla | 3,1 ms | 6,2 ms | 9,7 ms | 0 / 240 |
| Endless, legrosszabb effekt-terhelés | 5,5–6,6 ms | 9,6–11,5 ms | 15–21 ms | 0–2 / 240 |
| Versus (5-ös CPU), normál játék | 6,5–6,9 ms | 12,8–14,1 ms | 25 ms | 6 / 240 |
| Versus, legrosszabb effekt-terhelés | 9,4–10,1 ms | 16,3–16,5 ms | 25–40 ms | 11–12 / 240 |
| Versus indulása a menüből (leghosszabb frame) | | | 36–39 ms | |

Egyéb mért adatok:
- **GPU-oldal:** frame-enként 43–56 draw call; a stresszjelenetben legfeljebb kb. 320 élő részecske és 10 popup.
- **DOM:** a HUD csak változáskor renderel (layout kb. 0,02 frame-enként). Versusban a CSS-animációk miatt minden frame-ben van egy style recalc, de ez 4× lassítással is csak 0,35 ms.
- **Memória:** nincs szivárgás: hosszú, effektekkel teli menet után a heap-növekedés 0,1–1,2 MB.

## Mit találtunk és javítottunk

| Probléma | Előtte | Utána | Javítás |
|---|---|---|---|
| Első versus meccs indulása (4×, 2× DPR) | 327 ms-os fagyás | 44 ms | Textúra-előmelegítés menüben + a popup font GPU-ra töltése induláskor |
| Endless indítása versus után | 64 ms | 9 ms | Méretenkénti textúra-cache (a módváltás nem dobja el a textúrákat) |
| Első lánc-popup játék közben | 5 db 1024² textúrafeltöltés (kb. 28 ms 1×-en, 100 ms+ 4×-en) | 0 | `uploadPopupFonts` a scene létrehozásakor |
| Magyar popup („LÁNC”, „KOMBÓ”) | az ékezetes betűk az első használatkor újrarajzolták és újra feltöltötték a font-oldalt | előre generálva | `POPUP_GLYPHS` + regressziós teszt (minden EN/HU popup-szöveg) |
| Új garbage slab-forma meccs közben | kb. 21 ms-os sütés (4×) | 0 | A gyakori versus slab-formák előmelegítése |
| AI-tick túllépés (5-ös szint, 1×) | max 3,55 ms; 465 tick > 1 ms | max 2,25 ms; 244 tick > 1 ms | A rollout a munkakeret elérésekor a következő tickben folytatódik (a keret túllépése ≤ 1 lépés) |

### Textúra-előmelegítés
Minden mód más cellamérettel rajzolja a táblát: Endless, Run/Daily, Puzzle/Tutorial, Versus, valamint a Versus mini tábla. Korábban minden méretváltáskor minden blokktextúra újrasült.
- **Cache:** most a `BlockTextureFactory` és a `GarbageSlabTextures` is LRU-ban tartja a legutóbbi méreteket (fő tábla: 4, mini tábla: 1).
- **Előmelegítés:** a `GameScene.prewarm` a menü üresjárati frame-jeiben, frame-enként kb. 3 ms időkerettel előre kisüti minden mód textúráit, a versus méreteknél a gyakori garbage slabokat is.
- **Ára:** 4× lassítással a menü első kb. 2 másodpercében 13 frame túllépi a 16,7 ms-ot (a leglassabb kb. 30 ms). Ott csak a háttér animálódik, utána a menü 2–4 ms-on fut. Ez tudatos csere a mód-indításkori fagyás helyett.
- **Memória:** méretenként kb. 3 MB GPU-memória.

### Megvizsgált, de nem hozott eredményt
- **Render groupok** (world, részecskék, popupok, táblák): a Pixi v8 bármely `visible` változáskor újraépíti a render-utasításlistát, de külön render groupokkal ez legfeljebb 5–10%-ot hozott, a zajon belül. Nem került be.
- **Részecskék alfával eltüntetve `visible` helyett:** kb. 7%. Nem került be.

## Nyitva maradt

1. **5-ös (insane) CPU tickenkénti munkakerete:** 1100 egység, ez 1×-en kb. 2 ms, 4×-en kb. 9 ms. Gyenge telefonon a tervezési tickek kb. 1–2%-a ezért lépi túl a frame-et. Javítható a keret csökkentésével, cserébe a CPU kicsit lassabban reagálna. Ez balansz-kérdés, a tulajdonos döntése. (`src/core/ai/profiles.ts`, `budget`.)
2. **Valódi GPU fill rate:** a sok additív réteg (blokk-glow, háttér, flash) telefonon fill-rate-korlátos lehet, ezt szoftveres GPU-n nem lehet mérni. Valódi eszközön kell ellenőrizni: debug APK, Chrome `chrome://inspect` → Performance, vagy Android GPU-profilozás.
3. **`draw` tüskék a mérésben** (20–40 ms, eseménytől független): valószínűleg a szoftveres GPU parancspufferének betelése, a konténer műterméke.
