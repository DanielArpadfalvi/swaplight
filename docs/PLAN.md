# Swaplight – megvalósítási terv

> Munkacím: **Swaplight** (később átnevezhető). Neon stílusú, Puzzle League-szerű panelcserés versus kirakós, Balatro-szerű roguelite futamokkal.
> Döntések (2026-10-06): TypeScript + Capacitor · ingyenes + egyszeri feloldás (nincs reklám, nincs energia) · 1.0 teljesen offline, online a 1.1-ben · letisztult neon/vektoros, kódból generált grafika.
> Következő projekt: Worms-szerű aszinkron artillery (lásd `market-research-2026-10.md`, #2).

---

## 1. Játékterv (GDD)

### 1.1 Alapmechanika
- **Pálya:** 6 oszlop × 12 sor. Alulról folyamatosan emelkedik a blokkfal; alul mindig látszik egy „előnézeti” sor, ami még nem aktív.
- **Blokkok:** 5 szín (később 6 nehezebb módban), mindegyiknek **egyedi formája** is van (színvak-barát: kör, gyémánt, háromszög, négyzet, csillag, szív).
- **Csere:** egy blokk vízszintes húzásával a szomszédjával helyet cserél (húzás közben több cserét is lehet láncolni, mint a Puzzle League DS-ben). Üres hellyel is cserélhető → a blokk leeshet.
- **Egyezés:** 3+ azonos szín vízszintesen vagy függőlegesen → „villogás” fázis, majd eltűnik. A fölötte lévők esnek (gravitáció).
- **Combo:** egyetlen lépésből 4+ blokk egyszerre tűnik el.
- **Chain (lánc):** a leeső blokkok újabb egyezést hoznak létre → lánc ×2, ×3…
- **Emelés:** felfelé húzás az üres területen (vagy gomb) gyorsítja az emelést. Combo/chain után az emelés rövid ideig megáll (stop time).
- **Veszély:** ha egy blokk eléri a tetőt, rövid türelmi idő (≈2 mp, villogás), utána vége.
- **Determinisztikus szimuláció:** 60 Hz fix tick, seedelt RNG, a játék teljesen visszajátszható seed + input log alapján (ez kell a napi kihíváshoz, replayekhez és a 1.1-es aszinkron versushoz).

### 1.2 Pontozás (Balatro-ihletésű)
- Minden eltüntetés: **Alap pont × Szorzó**.
  - Alap pont: blokkonként 10, combo bónusz (+4 blokk felett progresszív).
  - Szorzó: lánc-szint (×1, ×2, ×3, …) + ereklyék módosítói.
- A képernyőn látványosan felpörgő „alap × szorzó” kijelzés a fő jutalmazó pillanat.

### 1.3 Játékmódok (1.0)
| Mód | Leírás | Ingyenes? |
|---|---|---|
| **Futam (Run)** – fő mód | 3 felvonás × (3 szakasz + főellenség). Szakaszonként cél (pl. „érj el 2 000 pontot 90 mp alatt”, „törölj 40 blokkot”, „élj túl 60 mp-et gyorsuló emeléssel”). Utána bolt + jutalom. | Igen, az alap pakli |
| **Végtelen** | Klasszikus, gyorsuló túlélés, rekordok. | Igen |
| **Versus CPU** | Szemét-blokkok (garbage) küldése combóval/lánccal, 5 nehézségi szint. | Könnyű ingyen, többi teljes verzióban |
| **Napi kihívás** | Mindenkinek azonos seed + szabálymódosító naponta; helyi rekordok (online ranglista 1.1). | Teljes verzió |
| **Fejtörő** | „Tüntesd el mind N lépésből” kézzel készült + generált-és-ellenőrzött pályák, 4 csomag × 30. | 1. csomag ingyen |
| **Oktatás** | Interaktív tanító pálya. | Igen |

### 1.4 Roguelite réteg (Futam mód)
- **Pénz (Szikra):** szakasz végén cél túlteljesítése, maradék idő és lánc-bónusz alapján.
- **Ereklyék (Relics, passzív, max 5 hely):** ~40 db 1.0-ra. Pl. „Prizma: a lánc szorzó +1”, „Lassú dagály: emelés −20%”, „Lila láz: a lila blokkok +3 szorzót adnak”, „Dominó: minden 5. combo bombablokkot hoz”, „Kamatos kamat: szakaszonként +1 Szikra 5-ösönként”.
- **Talizmánok (Charms, egyszer használatos aktív, max 2 hely):** ~15 db. Pl. oszlop törlése, emelés fagyasztása 5 mp-re, színcsere, egy sor „mindenes” (wild) blokká alakítása.
- **Bolt:** szakaszok között 3 ereklye + 2 talizmán, újrasorsolás pénzért, eladás.
- **Főellenségek (Boss):** szabály-átok, pl. „egy szín láthatatlan”, „a cserék 1 mp-ig zárolnak”, „szemét-blokk eső”, „fejjel lefelé gravitáció 10 mp-ig”. ~8 db.
- **Paklik / kezdő karakterek:** ~6 db, eltérő kezdő ereklye/szabály (pl. „6 szín, de ×2 alap szorzó”). Egy ingyenes, a többi feloldható játékkal (teljes verzióban).
- **Nehézségi szintek („Fényerő 1–8”):** a Balatro tétjeinek mintájára, futam-győzelem után nyílnak.
- **Meta-progresszió:** gyűjtemény (felfedezett ereklyék), statisztikák, kozmetikai blokkskinek/témák játékkal feloldva. Nincs fizetős erő.

### 1.5 Monetizáció
- Ingyenes letöltés, **egy egyszeri vásárlás: „Teljes verzió” (≈4,99 USD)**. Nincs reklám, nincs energia, nincs fogyóeszköz.
- Ingyen: Oktatás, Végtelen, Futam az alap paklival (teljes futam!), Versus Könnyű, Fejtörő 1. csomag.
- Teljes verzió: minden pakli, Fényerő-szintek, Versus összes nehézség, Napi kihívás, összes Fejtörő csomag, extra témák.
- „Vásárlások visszaállítása” gomb (Apple kötelező).

### 1.6 Látvány & hang
- Sötét háttér, neon blokkok glow-val, részecskék eltűnéskor, képernyő-rázás nagy láncnál, sima interpoláció (csere, esés, emelés).
- Minden kódból generált (Pixi Graphics + shaderek / filterek), nincs külső bitmap asset igény. Ikon és store-képek is kódból (SVG → PNG).
- Hang: Web Audio alapú procedurális SFX (csere, landolás, eltűnés, lánc hangmagasság-emelkedéssel) + generatív/szekvenszer zene 2–3 sávval. Haptika: Capacitor Haptics.
- Akadálymentesség: színvak-barát formák, csökkentett mozgás opció, állítható hangerő, nagyobb betűk.

### 1.7 Nyelvek
Angol + magyar az 1.0-ban (i18n rendszer, további nyelvek később: DE, ES, PT-BR, JA).

---

## 2. Technikai architektúra

```
src/
  core/        # tiszta, determinisztikus játéklogika – NINCS DOM/Pixi függőség
    board.ts, rng.ts, match.ts, gravity.ts, scoring.ts, garbage.ts, sim.ts (tick loop),
    run/ (relics, charms, shop, bosses, stages), ai/ (CPU versus), puzzles/
  render/      # PixiJS v8 – a core állapot kirajzolása, animáció-interpoláció, effektek
  input/       # pointer/touch → core parancsok (swap, raise)
  audio/       # Web Audio SFX + zene
  ui/          # menük, HUD, bolt – Preact + CSS (DOM réteg a canvas fölött)
  platform/    # Capacitor wrapper: storage, haptics, IAP, lifecycle, safe-area – web mockkal
  i18n/
  main.ts
tests/         # Vitest unit (core 90%+ lefedettség cél) + Playwright e2e/screenshot
android/, ios/ # Capacitor natív projektek (generált, verziókezelt)
```

- **Build:** Vite + TypeScript strict, ESLint + Prettier.
- **Render:** PixiJS v8 (WebGL, fallback Canvas). Cél: stabil 60 FPS közepes Androidon.
- **UI:** Preact (kicsi), CSS változókkal témázva.
- **Mentés:** `@capacitor/preferences` (weben localStorage), verziózott mentés-séma migrációval.
- **IAP:** `@revenuecat/purchases-capacitor` egy `Purchases` interfész mögött (webes/dev mock).
- **Natív:** Capacitor 7/8, `@capacitor/haptics`, `@capacitor/app` (pause/resume), `@capacitor/splash-screen`, `@capacitor/status-bar`, `@capacitor/assets` (ikon/splash generálás).
- **Teszt:** Vitest (core, scoring, relics, RNG-determinizmus, replay), Playwright (Chromium, mobil viewport: játék indítása, csere, menük, screenshotok vizuális ellenőrzéshez).
- **CI (GitHub Actions):**
  - `ci.yml`: lint, typecheck, unit, e2e, web build – minden pushra.
  - `android.yml`: Capacitor sync + Gradle → AAB (aláírva, ha a secretek megvannak; különben debug APK artifact).
  - `ios.yml`: macOS runner, Xcode archive (aláírva, ha a secretek megvannak; különben simulator build).
  - később: fastlane feltöltés TestFlightra / Play Internal testingre.
- Megjegyzés: ebben a felhős környezetben a `dl.google.com` tiltott, ezért az Android SDK-t nem lehet helyben telepíteni → natív buildek kizárólag CI-ben futnak.

### Csomagazonosító
`com.arpadfalvi.swaplight` (egy helyen konfigurálható).

---

## 3. Mérföldkövek

| # | Mérföldkő | Tartalom | Kész, ha… |
|---|---|---|---|
| **M0** | Alapozás | Vite+TS projekt, lint, Vitest, Playwright, CI, CLAUDE.md konvenciók | CI zöld, üres app fut |
| **M1** | Mag-motor | Determinisztikus board-szimuláció: csere, egyezés, villogás, gravitáció, combo, chain, emelés, game over, RNG, replay | ≥90% core lefedettség, replay-teszt egyezik |
| **M2** | Játszható prototípus | Pixi render, touch-csere húzással, emelés, Végtelen mód, HUD | Böngészőben/telefonon végigjátszható |
| **M3** | Játékélmény | Animációk, részecskék, glow, rázás, SFX, zene, haptika | Screenshot/videó-ellenőrzés, 60 FPS |
| **M4** | Futam mód | Pontszorzó rendszer, szakaszok, bolt, ereklyék, talizmánok, főellenségek, paklik, Fényerő | Teljes futam végigjátszható, unit tesztek |
| **M5** | További módok | Versus CPU + garbage, Napi kihívás, Fejtörő (+ megoldó/validátor), Oktatás | Minden mód elérhető menüből |
| **M6** | Meta & UI | Főmenü, beállítások, mentés, statisztika, gyűjtemény, feloldások, i18n (EN/HU), akadálymentesség | Teljes UI flow e2e teszttel |
| **M7** | Mobil héj | Capacitor iOS/Android, ikon, splash, safe area, életciklus, teljesítmény, CI natív build | CI-ben APK/AAB + iOS build zöld |
| **M8** | Monetizáció | IAP absztrakció, RevenueCat, paywall, visszaállítás, ingyenes/teljes kapuk | Mockkal tesztelve; sandboxhoz fiók kell |
| **M9** | Kiadás-előkészítés | Store-szövegek EN/HU, screenshotok (generált), adatvédelmi nyilatkozat, korhatár-kérdőív válaszok, aláírt release pipeline, balansz, QA | „Feltölthető” állapot mindkét store-ba |

### Amit tőled fogok kérni a végén (M7–M9)
- Apple Developer Program (99 USD/év) és Google Play Console (25 USD egyszeri) fiók.
- Aláíró kulcsok/tanúsítványok GitHub secretként (pontos lista: `docs/RELEASE.md`, M9-ben készül).
- RevenueCat fiók (ingyenes szint) + a termék létrehozása a két store-ban.
- Ezek nélkül minden elkészül, csak a tényleges feltöltés és a valódi vásárlás tesztje marad.

---

## 4. Munkafolyamat (autonóm orkesztráció)

- **Orkesztrátor** = ez a fő munkamenet. A `docs/TASKS.md` a hiteles feladatlista (állapot, elfogadási feltételek), így a munka kontextus-váltás után is folytatható.
- Minden feladatnál:
  1. Az orkesztrátor kiad egy pontosan specifikált feladatot egy **végrehajtó agentnek** (fájlok, elfogadási feltételek).
  2. A végrehajtó implementál + tesztet ír.
  3. Az orkesztrátor **ellenőriz**: typecheck, lint, unit, e2e, build, Playwright-screenshot átnézés, kód-review (nagyobb feladatnál külön review agent).
  4. Hiba esetén visszaküldi konkrét javítási kéréssel; ha rendben, commit + push, és jön a következő feladat.
- Független feladatok párhuzamosan is futhatnak (külön worktree-ben), ütköző fájloknál sorban.
- **Push:** minden elfogadott feladat után. **Értesítés:** minden mérföldkőnél.
- Kérdés csak blokkoló döntésnél (pl. fiókok, fizetős szolgáltatás).
