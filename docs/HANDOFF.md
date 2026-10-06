# Swaplight – átadási jegyzet (hideg indulás helyi munkamenetből)

Utolsó frissítés: 2026-10-06. Ez a fájl ahhoz kell, hogy egy **új (helyi) Claude Code munkamenet** előzmények nélkül fel tudja venni a fonalat. Ezt olvasd el először, utána: `CLAUDE.md`, `docs/TASKS.md`, `docs/PERF.md`, `docs/RELEASE.md`.

## 0. Röviden: hol tartunk

- **Kód:** 1.0-ig gyakorlatilag kész. Minden mérföldkő M0–M8 ✅, M9-ből T9.1 ✅, T9.3 ✅, T9.2 (aláírt release pipeline) kész, de élesben még nem futott, mert hiányoznak a store-secretek.
- **Legutóbbi munka – T3.3 perf pass:** ✅ kész, de **még nincs a `main`-en**. A `claude/ecstatic-wozniak-ni908x` ágon van (`e6e3981` + ez a handoff commit), pusholva. **Félkész munka nincs**, commitolatlan változás nincs.
  - Tartalom: frame-profilozó hook + `npm run test:perf`; mód-indítási fagyás 327 → ~40 ms; nincs játék közbeni textúrafeltöltés; az AI-tick nem lépi túl a munkakeretét. Részletek: `docs/PERF.md`.
- **Tesztek az ágon:** `npm run check` (691 unit) ✅ · `npm run test:e2e` (26) ✅ · `npm run test:perf` (5) ✅.
- **Tulajdonos (Dani):** a Google Play fejlesztői fiók regisztrálva, a hitelesítés folyamatban; az Apple Developer Program a következő.

### Nyitott döntések / ismert hibák
1. **A perf pass átvezetése a `main`-re** – a tulajdonos jóváhagyására vár.
2. **5-ös (insane) CPU tickenkénti munkakerete** (`src/core/ai/profiles.ts`, `budget: 1100`): gyenge telefonon a tervezési tickek kb. 1–2%-a kihagy egy frame-et. A keret csökkentése megoldaná, de kicsit gyengíti az AI-t (balanszkérdés, a tulajdonos dönt).
3. **Valódi eszközön** még nincs ellenőrizve a GPU fill rate (sok additív glow-réteg) – a konténerben csak szoftveres WebGL van.
4. Opcionális P3-ak a T9.3 QA-ból:
   - az Endless tipp eltakarja a pontszám feliratát 360×640-en;
   - a Szikra számláló ezres tagolás nélkül jelenik meg („1305”);
   - HU „PONT” vs. „PONTSZÁM” felirat a Futam HUD-ban;
   - a Kapcsolat sor ikonja jobbra igazodik;
   - a „FŐELLENSÉGEK” fül 360 px-en kb. 9 px-re kicsinyedik.

### Következő lépések sorrendben
1. A tulajdonos jóváhagyásával **merge a `main`-re** a `claude/ecstatic-wozniak-ni908x` ágból, push, utána nézd meg a CI-t (CI + Android + iOS workflow; a CI már futtatja a `test:perf`-et is).
2. **T9.2 élesítése**, amint megvannak a secretek (7. pont, `docs/RELEASE.md`):
   - Android: upload key + az `ANDROID_*` secretek → első aláírt AAB → kézi feltöltés a Play Console-ba → zárt teszt (12 tesztelő × 14 nap – érdemes minél korábban indítani);
   - iOS: ASC API kulcs + secretek → TestFlight.
3. **RevenueCat** beállítása (`docs/RELEASE.md` 5. pont), amint mindkét boltban létezik az app; sandbox-vásárlás tesztje.
4. **Valódi telefonos teszt** (gyengébb Android is):
   - teljesítmény (GPU fill rate);
   - döntés az insane CPU-keretről;
   - Futam / Versus balansz.
5. A P3-ak javítása, store-listázás véglegesítése, beküldés review-ra. Utána: következő projekt (Worms-szerű aszinkron artillery, `docs/market-research-2026-10.md` #2).

### Helyi futtatás (nem a felhős konténer!)
```bash
git clone https://github.com/DanielArpadfalvi/swaplight.git && cd swaplight
git checkout claude/ecstatic-wozniak-ni908x   # amíg nincs a main-en
npm ci
npx playwright install chromium               # helyben NINCS /opt/pw-browsers
npm run check && npm run build && npm run test:e2e && npm run test:perf
```
- A `CLAUDE.md` „never run `playwright install`” szabálya **csak a felhős konténerre** vonatkozik. A `playwright.config.ts` automatikusan a Playwright saját Chromiumát használja, ha az telepítve van.
- A `test:perf` számai gépfüggők. Valódi GPU-s gépen a `draw` fázis jóval gyorsabb lehet; a küszöbök regressziós őrök.
- Natív build helyben is mehet (Android Studio / Xcode, `npx cap sync`), de a release buildeket a GitHub Actions készíti.

### Projekt-dashboard (minden munkamenet frissítse)
Élő dashboard: https://claude.ai/artifact/94fw4py1eoxCoL7aozTVBQ – az `ArtifactData` toollal (ToolSearch: `select:ArtifactData`).

**Mikor frissíts:**
- minden commit/push után;
- agent indításakor és végeztekor;
- kipipált feladatnál;
- amikor a tulajdonostól inputra vársz.

**Hogyan:** előbb olvasd ki a dokumentumot, és az írásnál az olvasott `version`-t add meg `if_version`-ként.

- **`projects/swaplight`** (update; a meglévő name/repo/tagline/accent mezők maradjanak):
  - `milestones`: a `docs/TASKS.md`-ből: `[{code, title, tasks:[{id, title, done}]}]`; a `[~]` nem kész;
  - `agents`: `[{id, label, status}]`;
  - `lastCommit`: `{sha, message, at}`;
  - `needsInput`: `[{id, question, since}]`;
  - `state`: `active` | `paused` | `done`;
  - `updatedAt`.
- **`feed/main`**: az `items` elejére egy `{at, project:"swaplight", kind:"commit"|"task"|"agent"|"milestone"|"input", text}` elem (egy magyar mondat); legfeljebb 40 elem.

## 1. Mérföldkövek

| Mérföldkő | Állapot |
|---|---|
| M0 Alapozás (Vite+TS+Pixi+Preact, lint, teszt, CI) | ✅ |
| M1 Mag-motor (determinisztikus Panel de Pon-szerű szimuláció) | ✅ |
| M2 Játszható prototípus (Végtelen mód) | ✅ |
| M3 Játékélmény (effektek, procedurális hang/zene, haptika, perf pass) | ✅ (perf pass: a fenti ágon) |
| M4 Futam mód (roguelite: 47 ereklye, 15 talizmán, bolt, 8 főellenség, 6 pakli, Fényerő 1–8) | ✅ |
| M5 További módok (Versus CPU 5 szinttel, Napi kihívás, 120 fejtörő, Oktatás) | ✅ |
| M6 Meta & UI (menü, beállítások, mentés, statisztika, gyűjtemény, EN/HU) | ✅ |
| M7 Mobil héj (Capacitor Android/iOS, ikon, splash, CI natív build) | ✅ |
| M8 Monetizáció (RevenueCat, „Teljes verzió” paywall) | ✅ |
| M9 Kiadás-előkészítés | 🟡 T9.1 ✅ · T9.2 pipeline kész, élesben még nem futott (secretek hiányoznak) · T9.3 ✅ |

Részletes feladatlista: `docs/TASKS.md`. Terv: `docs/PLAN.md`. Kiadási útmutató: `docs/RELEASE.md`. Teljesítmény: `docs/PERF.md`.

## 2. Repók és ágak

- **Játék:** `DanielArpadfalvi/swaplight` (privát; régi neve `factcheck`, a GitHub átirányít).
  - `main` = alapértelmezett ág, mérföldkövenként ide vezetjük át.
  - Fejlesztési ág eddig: `ccr-3e920ca6-l7gmzy` (az új munkamenet kaphat új ágat – ez rendben van, csak a végén merge-eld a `main`-re).
- **Weboldal:** `DanielArpadfalvi/swaplight-site` (publikus, GitHub Pages: https://danielarpadfalvi.github.io/swaplight-site/). Forrása a játék repó `docs/site/` mappája; frissítés: másold át (vagy `scripts/publish-site.sh`, ha már létezik), commit, push.

## 3. Folytatás felhős munkamenetből (claude.ai/code) – lépések

1. **GitHub összekötése** a személyes Claude-fiókban: https://claude.ai/connect-github → ugyanazzal a GitHub-felhasználóval (`DanielArpadfalvi`).
2. Ha kéri: **Claude GitHub App** telepítése a két repóra (`swaplight`, `swaplight-site`): https://github.com/apps/claude/installations/select_target
3. **Új munkamenet** a https://claude.ai/code oldalon, forrásnak a `DanielArpadfalvi/swaplight` repót választva (ágnak a `main`-t). Környezet: olyan hálózati beállítás, ami engedi az npm registryt és a GitHubot (az eddigi is ilyen volt).
4. Az első üzenetbe másold be a 4. pont szövegét.
5. **A céges fiókban** érdemes leállítani a régi munkamenetet és az óránkénti „Swaplight autonomous resume” rutint (claude.ai → Routines), hogy ne dolgozzon két munkamenet párhuzamosan ugyanazon a repón.

## 4. Kezdő prompt az új munkamenethez

```
Folytasd a Swaplight mobiljáték fejlesztését. Olvasd el: docs/HANDOFF.md (0. pont: állapot,
nyitott döntések, következő lépések), CLAUDE.md, docs/TASKS.md, docs/PERF.md, docs/RELEASE.md.
Te vagy az orkesztrátor: a nyitott feladatokat végrehajtó agenteknek add ki, ellenőrizd
(npm run check, npm run build, npm run test:e2e, screenshotok átnézése), commitolj és
pusholj minden elfogadott feladat után, mérföldkövenként vezesd át a main-re.
Autonóm módon dolgozz, csak nagyon fontos döntésnél kérdezz. A cél a store-ba
feltölthető 1.0. Utána jöhet a következő projekt: Worms-szerű aszinkron artillery
(docs/market-research-2026-10.md, #2).
```

## 5. Bevált munkafolyamat (orkesztráció)

- Az orkesztrátor (fő munkamenet) ad ki pontosan specifikált feladatot egy végrehajtó agentnek: fájlok, elfogadási feltételek, „ne commitolj” vagy „commitolj a saját worktree-dben”.
- **Párhuzamos agentek:** egymást nem fedő fájlokon dolgozhatnak ugyanabban a könyvtárban; ha ugyanazokat a közös fájlokat (`src/game/app.ts`, `modes.ts`, `state.ts`, `nav.ts`, i18n) érintik, az egyik **külön worktree-ben** (`isolation: worktree`) fusson, a végén merge.
- **Commit előtt mindig tiszta ellenőrzés:** az agent fájljait egy külön git worktree-be másolva (`git worktree add --detach <dir> <branch>`) futtatni `npm run check` + `npm run build` (+ e2e). Így más agentek félkész fájljai nem csúsznak be. Commitolni explicit útvonallal.
- **E2E portütközés:** a Playwright alap port 4173 `reuseExistingServer`-rel; ha több agent fut, ideiglenes configgal egyedi portot használj (`reuseExistingServer: false`), utána töröld.
- **Headless Chromium itt szoftveres WebGL-lel fut (lassú):** e2e-ben 1× DPR, a render loop megállítása screenshot előtt, a játékot a `window.__swaplight` test hookokon (`?test`) keresztül vezérelni.
- A felhős konténerből a `dl.google.com` tiltott → **natív Android/iOS build csak GitHub Actions-ben**. Minden pushra friss debug APK: Releases → `android-debug-latest`.
- Push után nézd meg a CI-t (CI, Android, iOS workflow-k).

## 6. Fontos döntések (eddig)

- Stack: TypeScript + Vite + PixiJS v8 + Preact + Capacitor 8; kódból generált grafika és hang (nincs bitmap asset).
- Üzleti modell: ingyenes + egyszeri „Teljes verzió” (~4,99 USD), nincs reklám, nincs energia. RevenueCat: entitlement `full_version`, termék `swaplight_full_version`. **Natív build RevenueCat-kulcs nélkül nem old fel ingyen** („store unavailable”).
- 1.0 teljesen offline; online (aszinkron versus, ranglista) a 1.1-ben.
- **iOS 1.0 csak iPhone** (`TARGETED_DEVICE_FAMILY = 1`), iPad-screenshot nem kell.
- Bundle/app ID: `com.arpadfalvi.swaplight`.
- Felhasználási feltételek link: Apple standard EULA. Adatvédelem/támogatás: https://danielarpadfalvi.github.io/swaplight-site/ · e-mail: swaplight.support@gmail.com
- Store-screenshotok nincsenek a gitben (~33 MB): `npm run store:screens` generálja.

## 7. Ami a tulajdonosra vár (kiadáshoz)

Részletesen: `docs/RELEASE.md`, `docs/PLAY-STORE-CHECKLIST.md`, `docs/APP-STORE-CHECKLIST.md`.
- Google Play Console fiók (25 USD), azonosítás, fizetési profil, **12 tesztelő × 14 nap zárt teszt**.
- Apple Developer Program (99 USD/év), Paid Apps Agreement, W-8BEN, EU DSA kereskedői nyilatkozat.
- Android upload keystore + GitHub secretek (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, opcionális `PLAY_SERVICE_ACCOUNT_JSON`).
- App Store Connect API kulcs (Admin) + secretek (`ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`, `APPLE_TEAM_ID`).
- RevenueCat projekt + `VITE_RC_API_KEY_IOS`, `VITE_RC_API_KEY_ANDROID` secretek.
- A `swaplight.support@gmail.com` postafiók létrehozása (ha még nincs).
