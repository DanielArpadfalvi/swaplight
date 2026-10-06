# Swaplight – átadási jegyzet (folytatás másik Claude-fiókból)

Utolsó frissítés: 2026-10-06. Ez a fájl ahhoz kell, hogy a fejlesztést egy **új Claude Code munkamenetben** (pl. személyes fiókból) zökkenőmentesen folytatni lehessen.

## 1. Hol tart a projekt

| Mérföldkő | Állapot |
|---|---|
| M0 Alapozás (Vite+TS+Pixi+Preact, lint, teszt, CI) | ✅ |
| M1 Mag-motor (determinisztikus Panel de Pon-szerű szimuláció) | ✅ |
| M2 Játszható prototípus (Végtelen mód) | ✅ |
| M3 Játékélmény (effektek, procedurális hang/zene, haptika) | ✅ |
| M4 Futam mód (roguelite: 47 ereklye, 15 talizmán, bolt, 8 főellenség, 6 pakli, Fényerő 1–8) | ✅ |
| M5 További módok (Versus CPU 5 szinttel, Napi kihívás, 120 fejtörő, Oktatás) | ✅ |
| M6 Meta & UI (menü, beállítások, mentés, statisztika, gyűjtemény, EN/HU) | ✅ |
| M7 Mobil héj (Capacitor Android/iOS, ikon, splash, CI natív build) | ✅ |
| M8 Monetizáció (RevenueCat, „Teljes verzió” paywall) | ✅ |
| M9 Kiadás-előkészítés | 🟡 T9.1 ✅ (store-szövegek, weboldal, screenshot-generátor) · T9.2 pipeline kész, élesben még nem futott (secretek hiányoznak) · T9.3 ✅ (utolsó QA-kör kész) |

Részletes feladatlista: `docs/TASKS.md`. Terv: `docs/PLAN.md`. Kiadási útmutató: `docs/RELEASE.md`.

### Ami az átadás pillanatában futott
- **T9.3 utolsó QA-kör** egy agentben: regressziós végigjátszás 3 képernyőméreten EN/HU, ismert hibák (hosszú kombó/lánc felirat kilóg a pályáról, Napi kihívás grafikon utolsó oszlopa), support e-mail (`swaplight.support@gmail.com`) és `swaplight-site` linkek beírása, `.github/workflows/pages.yml` törlése, `scripts/publish-site.sh`, teljesítménymérés.
- Ha az új munkamenetben a `docs/TASKS.md`-ben a **T9.3 nincs kipipálva**, akkor ez nem fejeződött be / nem lett pusholva → **futtasd újra** (a lista fent).

## 2. Repók és ágak

- **Játék:** `DanielArpadfalvi/swaplight` (privát; régi neve `factcheck`, a GitHub átirányít).
  - `main` = alapértelmezett ág, mérföldkövenként ide vezetjük át.
  - Fejlesztési ág eddig: `ccr-3e920ca6-l7gmzy` (az új munkamenet kaphat új ágat – ez rendben van, csak a végén merge-eld a `main`-re).
- **Weboldal:** `DanielArpadfalvi/swaplight-site` (publikus, GitHub Pages: https://danielarpadfalvi.github.io/swaplight-site/). Forrása a játék repó `docs/site/` mappája; frissítés: másold át (vagy `scripts/publish-site.sh`, ha már létezik), commit, push.

## 3. Folytatás személyes fiókból – lépések

1. **GitHub összekötése** a személyes Claude-fiókban: https://claude.ai/connect-github → ugyanazzal a GitHub-felhasználóval (`DanielArpadfalvi`).
2. Ha kéri: **Claude GitHub App** telepítése a két repóra (`swaplight`, `swaplight-site`): https://github.com/apps/claude/installations/select_target
3. **Új munkamenet** a https://claude.ai/code oldalon, forrásnak a `DanielArpadfalvi/swaplight` repót választva (ágnak a `main`-t). Környezet: olyan hálózati beállítás, ami engedi az npm registryt és a GitHubot (az eddigi is ilyen volt).
4. Az első üzenetbe másold be a 4. pont szövegét.
5. **A céges fiókban** érdemes leállítani a régi munkamenetet és az óránkénti „Swaplight autonomous resume” rutint (claude.ai → Routines), hogy ne dolgozzon két munkamenet párhuzamosan ugyanazon a repón.

## 4. Kezdő prompt az új munkamenethez

```
Folytasd a Swaplight mobiljáték fejlesztését. Olvasd el: CLAUDE.md, docs/HANDOFF.md,
docs/PLAN.md, docs/TASKS.md, docs/RELEASE.md. Te vagy az orkesztrátor: a nyitott
feladatokat (első a T9.3, ha nincs kész) végrehajtó agenteknek add ki, ellenőrizd
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
