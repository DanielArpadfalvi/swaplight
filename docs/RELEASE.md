# Kiadás – aláírt buildek, TestFlight, Play belső teszt

Ez az útmutató azt írja le, mit kell **egyszer** beállítanod ahhoz, hogy a GitHub Actions aláírt
buildeket készítsen és feltöltse őket. Mac nem kell. A fiókok (Apple Developer, Play Console)
létrehozása: `APP-STORE-CHECKLIST.md`, `PLAY-STORE-CHECKLIST.md`.

## Mi fut magától?

| Workflow | Mikor | Mit csinál | Kell hozzá secret? |
|---|---|---|---|
| **Android** `debug-apk` | minden push | debug APK → artifact + „android-debug-latest” pre-release | nem |
| **Android** `release-aab` | kézi indítás, push a `main`-re, `v*` tag | aláírt AAB → artifact; opcionálisan feltöltés Google Playre | igen (lent) |
| **iOS** `simulator` | minden push | szimulátoros build (aláírás nélkül) → artifact, bizonyítja, hogy fordul | nem |
| **iOS** `release` | kézi indítás, push a `main`-re, `v*` tag | aláírt IPA → artifact; feltöltés TestFlightra | igen (lent) |

Ha a secretek hiányoznak, a release jobok kimaradnak (a futás összefoglalójában erről egy „notice”
üzenet szól), a többi job zöld marad.

**Verziószámok:** a build-szám (Android `versionCode`, iOS `CFBundleVersion`) mindig a workflow
futásszáma, így mindig nő. A megjelenő verzió `v1.2.3` tagnél `1.2.3`, egyébként Androidon
`0.1.<futásszám>`, iOS-en `0.1.0`.

**Secretek felvétele:** GitHub → a repó → *Settings → Secrets and variables → Actions → New
repository secret*. (Vagy parancssorból: `gh secret set NÉV < fájl`.)

---

## 1. Android (Google Play)

### 1.1 Feltöltő kulcs (upload key) létrehozása – egyszer
Kell hozzá Java (JDK 17+), mert a `keytool` abban van.

```bash
keytool -genkeypair -v -keystore swaplight-upload.jks -alias upload \
  -keyalg RSA -keysize 4096 -validity 10000
```

- Kér egy jelszót (keystore jelszó) és néhány adatot (név, ország – bármi lehet).
- **Mentsd el a `.jks` fájlt és a jelszót biztonságos helyre** (pl. jelszókezelő). Ha elveszik,
  a Play Console-ban kérhető új upload key, de az macerás.

Base64-be alakítás (egy sor szöveg lesz belőle):

- Linux: `base64 -w0 swaplight-upload.jks > upload.b64`
- macOS: `base64 -i swaplight-upload.jks | tr -d '\n' > upload.b64`
- Windows (PowerShell): `[Convert]::ToBase64String([IO.File]::ReadAllBytes("swaplight-upload.jks")) | Set-Content upload.b64`

### 1.2 GitHub secretek
| Név | Érték |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | az `upload.b64` tartalma |
| `ANDROID_KEYSTORE_PASSWORD` | a keystore jelszava |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | a kulcs jelszava (a `keytool` alapból ugyanazt használja, mint a keystore-é) |

### 1.3 Első AAB és a Play Console app
1. GitHub → *Actions → Android → Run workflow* (a `play_upload` maradjon kikapcsolva).
2. A futás végén az *Artifacts* részből töltsd le a `swaplight-release-aab` zipet, benne az `.aab`.
3. Play Console → *Create app* (név: Swaplight, játék, ingyenes).
4. *Testing → Internal testing → Create new release* → a Play App Signinget fogadd el (alapértelmezett)
   → töltsd fel az `.aab`-t → mentés → *Review release → Start rollout*.
   Az **első** feltöltésnek kézinek kell lennie: a Play API csak már létező appba tud feltölteni.
5. *Internal testing → Testers*: hozz létre egy e-mail-listát (Gmail-címek), és küldd el a
   tesztelőknek a „Join on the web” linket. Ők a Play Áruházból telepítik a buildet.

### 1.4 Automatikus feltöltés (opcionális, de kényelmes)
1. Google Cloud Console (console.cloud.google.com) → új projekt (pl. „swaplight-ci”).
2. *APIs & Services → Library* → **Google Play Android Developer API** → *Enable*.
3. *IAM & Admin → Service Accounts → Create service account* (pl. „play-upload”), szerepkör nem kell.
4. A service account → *Keys → Add key → Create new key → JSON* → letöltődik egy `.json` fájl.
5. Play Console → *Users and permissions → Invite new users* → a service account e-mail-címe
   (`…@….iam.gserviceaccount.com`) → *App permissions*: Swaplight → engedélyek: **Release to testing
   tracks** (és ha éleset is akarsz innen: *Release to production*) → *Invite user*.
6. GitHub secret: `PLAY_SERVICE_ACCOUNT_JSON` = a `.json` fájl **teljes tartalma**.

Feltöltés: *Actions → Android → Run workflow* → `play_upload` ✓, `play_track`: `internal`,
`play_status`: amíg az app még soha nem volt kiadva (a Console „draft app”-nak tekinti), válaszd a
**`draft`**-ot, és a kiadást a Console-ban indítsd el (*Internal testing → Edit release → Start
rollout*). Az első jóváhagyott kiadás után a `completed` közvetlenül kiadja a tesztelőknek.

A `v*` tag (lásd 3.) automatikusan feltölt az `internal` sávra `completed` státusszal.

### 1.5 Követelmények
- `targetSdk`/`compileSdk` = 36 (Android 16) – ez megfelel a Google Play 2026-os target API
  követelményének (`android/variables.gradle`).
- A Play az AAB-t a saját kulcsával írja alá (Play App Signing); a te kulcsod csak a feltöltéshez kell.

---

## 2. iOS (TestFlight / App Store)

### 2.1 Bundle ID és app rekord – egyszer
1. developer.apple.com → *Certificates, Identifiers & Profiles → Identifiers → +* → *App IDs → App*
   → Description: Swaplight, **Explicit** Bundle ID: `com.arpadfalvi.swaplight` → *Continue →
   Register*. (Külön képesség nem kell; az In-App Purchase alapból be van kapcsolva.)
2. App Store Connect → *Apps → + → New App*: iOS, név: Swaplight, elsődleges nyelv, a fenti Bundle
   ID, SKU: `swaplight`.

### 2.2 Team ID
developer.apple.com/account → *Membership details* → **Team ID** (10 karakter).

### 2.3 App Store Connect API kulcs
1. App Store Connect → *Users and Access → Integrations → App Store Connect API → Team Keys →
   Generate API Key* (az első kulcsnál előbb *Request Access*, az Account Holder fogadja el).
2. Név: „GitHub CI”, Access: **Admin**. (Az aláírás felhőben kezelt terjesztési tanúsítvánnyal
   történik – ehhez Admin szerepkör kell; „App Manager”-rel a CI-ben „Cloud signing permission
   error” jönne.)
3. *Download API Key* → `AuthKey_XXXXXXXXXX.p8`. **Csak egyszer tölthető le**, mentsd el!
4. Jegyezd fel a **Key ID**-t (a kulcs sorában) és az **Issuer ID**-t (a lista fölött).

Base64 a `.p8`-ból: ugyanúgy, mint 1.1-ben (`base64 -w0 AuthKey_XXXXXXXXXX.p8 > asc.b64`, macOS-en
`base64 -i … | tr -d '\n'`, Windows-on a PowerShell-sor a fájlnévvel).

### 2.4 GitHub secretek
| Név | Érték |
|---|---|
| `ASC_KEY_ID` | Key ID (pl. `ABC123DEFG`) |
| `ASC_ISSUER_ID` | Issuer ID (UUID) |
| `ASC_KEY_P8` | az `asc.b64` tartalma |
| `APPLE_TEAM_ID` | Team ID |

Tanúsítványt, `.p12`-t, provisioning profile-t **nem** kell feltöltened: az `xcodebuild` az API
kulccsal automatikusan létrehozza őket (a tanúsítvány az Apple felhőjében marad).

### 2.5 Build TestFlightra
1. GitHub → *Actions → iOS → Run workflow* (`testflight` ✓ – alapból be van pipálva).
2. ~15–25 perc a build; utána az App Store Connect 5–30 percig „Processing” állapotban dolgozza fel.
3. App Store Connect → Swaplight → *TestFlight*: megjelenik a build. Az export-megfelelőségi kérdés
   nem jön elő (`ITSAppUsesNonExemptEncryption = NO` az Info.plistben).
4. *Internal Testing → +* csoport → tesztelők hozzáadása (App Store Connect felhasználók, legfeljebb
   100). Ők az iPhone-on a **TestFlight** appból telepítenek.
5. Külső teszthez (*External Testing*, nyilvános link) az első buildnek rövid béta-review kell.

A `main` ágra pusholt kód is készít aláírt IPA-t (artifactként), de **nem** tölti fel; feltöltés
csak kézi indításnál (`testflight` ✓) vagy `v*` tagnél történik.

### 2.6 Ha az iOS release job hibázik
- *„Cloud signing permission error” / „No signing certificate”*: az API kulcs nem Admin, vagy az
  Account Holdernek el kell fogadnia egy új Apple-szerződést (developer.apple.com → Account →
  fent megjelenő sárga sáv; App Store Connect → *Business*).
- *„No profiles for 'com.arpadfalvi.swaplight'”*: a Bundle ID nincs regisztrálva (2.1/1.).
- *„The bundle version must be higher…”*: ugyanazzal a build-számmal már volt feltöltés – indítsd
  újra a workflow-t (új futásszám).

---

## 3. Kiadás verziótaggel (mindkét platform egyszerre)

```bash
git tag v1.0.0
git push origin v1.0.0
```

- Android: aláírt AAB `versionName 1.0.0`-val, és (ha van `PLAY_SERVICE_ACCOUNT_JSON`) feltöltés
  az `internal` sávra.
- iOS: aláírt IPA `1.0.0 (futásszám)` verzióval, feltöltés TestFlightra.
- Innen a Console-okban léptetheted tovább: Play → zárt teszt / éles; App Store → *Add for Review*.

## 4. Ikon és splash újragenerálása

A grafika kódból készül (`scripts/make-assets.ts`, SVG → Chromium → PNG):

```bash
npm run assets
```

Ez frissíti a `resources/` forrásképeket, a natív ikon/splash méreteket (`android/…/res`,
`ios/App/App/Assets.xcassets`) és a store-képeket (`store/`: App Store ikon 1024, Play ikon 512,
Play kiemelt kép 1024×500). Utána a `capacitor-assets` által átformázott
`android/app/src/main/AndroidManifest.xml`-t érdemes visszaállítani (`git checkout` – tartalmilag
nem változik).

---

## 5. Vásárlás: RevenueCat beállítása (Teljes verzió)

A játék egyetlen egyszeri vásárlást árul: **Teljes verzió**, termékazonosító
`swaplight_full_version` (nem fogyó / non-consumable), ami a RevenueCatben a **`full_version`**
jogosultságot (entitlement) adja. A kód (`src/platform/purchasesRevenueCat.ts`) ezeket a neveket
várja – pontosan így vedd fel őket.

Hogyan működik: a natív build a RevenueCat Capacitor pluginnal beszél (anonim felhasználói
azonosító, nincs bejelentkezés). A legutóbbi jogosultság-állapotot a készülék elmenti, így a
megvett Teljes verzió **offline is** feloldva marad a következő indításkor; online a RevenueCat
válasza az irányadó (pl. visszatérítés után újra zárol). Ha a buildben **nincs RevenueCat-kulcs**,
vagy weben fut, a játék a teszt-boltot (`MockPurchases`) használja – ilyen buildet **nem szabad**
kiadni, mert abban a vásárlás ingyenes. A release jobok ilyenkor figyelmeztetést írnak ki.

### 5.1 Előfeltételek
- App Store Connect: a **Paid Applications Agreement** elfogadva, adó- és bankadatok kitöltve
  (*Business*). Enélkül a termék nem tölthető be.
- Play Console: **fizetési profil** (merchant account) létrehozva, és legalább egy AAB feltöltve
  (belső tesztre is elég, lásd 1.3) – addig a Console nem enged terméket létrehozni.

### 5.2 Termék létrehozása a boltokban
**App Store Connect** → Swaplight → *Monetization → In-App Purchases → +*
1. Típus: **Non-Consumable**, Reference Name: „Full Version”, Product ID: `swaplight_full_version`.
2. Ár: a 4,99 USD-nek megfelelő sáv (*Price Schedule*), elérhetőség: minden ország.
3. Lokalizáció (EN + HU): megjelenő név „Full Version” / „Teljes verzió”, leírás pl. „Unlock all
   decks, modes and puzzle packs.” / „Minden pakli, mód és fejtörőcsomag feloldása.”
4. *Review Information*: képernyőkép a vásárlási lapról (a `tests/e2e/__screenshots__/paywall-en.png`
   jó alap), megjegyzés a reviewernek: „Tap the banner on the main menu or any locked deck.”
5. Opcionális: *Family Sharing* bekapcsolása (utólag nem kapcsolható ki!).
6. Az első IAP-t **az app első beküldésével együtt** kell review-ra küldeni (a verzió oldalán
   *In-App Purchases and Subscriptions* szekció → add hozzá).

**Play Console** → Swaplight → *Monetize → Products → In-app products → Create product*
1. Product ID: `swaplight_full_version`, név és leírás EN + HU, ár: 4,99 USD (a Console
   átszámolja a helyi árakra, pl. Ft).
2. *Save → Activate*.

### 5.3 RevenueCat projekt
1. app.revenuecat.com → regisztráció (az ingyenes szint bőven elég) → *Create new project*:
   „Swaplight”.
2. *Apps → + New → App Store*: név „Swaplight iOS”, Bundle ID `com.arpadfalvi.swaplight`.
   - **In-App Purchase Key**: App Store Connect → *Users and Access → Integrations → In-App
     Purchase → Generate* → töltsd le a `.p8`-at, és a Key ID + Issuer ID-vel együtt töltsd fel a
     RevenueCatbe (ez más kulcs, mint a CI-hez használt App Store Connect API kulcs a 2.3-ban).
   - *App Store Connect API* kulcs (opcionális): a termékek importálásához.
3. *Apps → + New → Play Store*: név „Swaplight Android”, package `com.arpadfalvi.swaplight`.
   - **Service account credentials**: a RevenueCat leírása szerint hozz létre egy Google Cloud
     service accountot (vagy használd az 1.4-es projektet), engedélyezd a *Google Play Android
     Developer API*-t és a *Google Play Developer Reporting API*-t, a Play Console-ban add meg
     neki a **View app information**, **View financial data** és **Manage orders and subscriptions**
     jogot, majd a JSON
     kulcsot töltsd fel a RevenueCatbe. (A jogosultság érvényesülése akár 24–36 óra.)
4. *Product catalog → Products → + New*: mindkét apphoz a `swaplight_full_version` termék.
5. *Product catalog → Entitlements → + New*: identifier **`full_version`** → *Attach* → mindkét
   termék.
6. *Product catalog → Offerings*: a `default` offering (legyen **Current**) → *+ New package*:
   identifier `$rc_lifetime` (Lifetime) → mindkét platform termékét rendeld hozzá. A játék a
   current offeringből olvassa az árat; ha nincs offering, közvetlenül a termékazonosítóval kéri le.

### 5.4 API kulcsok → GitHub secretek
RevenueCat → *Project settings → API keys* → a két **Public app-specific API key**:

| Név | Érték |
|---|---|
| `VITE_RC_API_KEY_IOS` | az App Store app kulcsa (`appl_…`) |
| `VITE_RC_API_KEY_ANDROID` | a Play Store app kulcsa (`goog_…`) |

Ezek *publikus* SDK-kulcsok (bekerülnek az appba), mégis secretként tároljuk, hogy a repóban ne
legyenek. A workflow-k a `vite build` lépésnek adják át őket; ha hiányoznak, a debug/szimulátor
build továbbra is lefut (teszt-bolttal), a release jobok pedig figyelmeztetnek.
Helyi natív buildhez: `VITE_RC_API_KEY_ANDROID=goog_… npx vite build && npx cap sync`.

### 5.5 Natív beállítások (ellenőrizve)
- **Android**: a `com.android.vending.BILLING` engedélyt a Play Billing könyvtár is hozzáadja, a
  `AndroidManifest.xml`-ben kifejezetten is szerepel. A plugin a `npx cap sync` után a gradle
  fájlokban regisztrálva van.
- **iOS**: StoreKithez **nem** kell entitlement-fájl vagy külön képesség – az In-App Purchase
  minden explicit App ID-n alapból engedélyezett (2.1). A plugin Swift Package-ként kerül be
  (`ios/App/CapApp-SPM/Package.swift`, a `cap sync` írja).
- **Adatvédelmi címkék**: App Store *App Privacy* → „Purchases / Purchase History” – gyűjtött,
  nem kapcsolódik a felhasználóhoz, nem követésre (RevenueCat); Play *Data safety* →
  „Purchase history”, ugyanígy. Reklám- és követési azonosító nincs.

### 5.6 Sandbox / teszt vásárlás
**iOS (TestFlight)**: a TestFlight-buildek mindig sandboxban vásárolnak, pénz nem mozdul. Teszthez
elég egy TestFlight-tesztelő Apple ID; tiszta lappal App Store Connect → *Users and Access →
Sandbox → Test Accounts* fiókkal is lehet (iPhone: *Beállítások → App Store → Sandbox-fiók*).
Visszaállítás teszt: töröld az appot, telepítsd újra → *Vásárlások visszaállítása*.

**Android (belső teszt)**: Play Console → *Settings → License testing* → add hozzá a tesztelők
Gmail-címét (*Licensed testers*), válaszd a „RESPOND_NORMALLY” módot. A belső tesztsávról
telepített appban a fizetési lapon „Test card, always approves” / „…declines” / „slow test card”
választható – az utóbbival a **függőben lévő** (pending) vásárlás is kipróbálható.
A tesztvásárlás a Play Console *Order management* oldalán visszatéríthető (refund) – ezzel a
visszavonás is tesztelhető: a játék a következő online indításkor újra zárol.

**RevenueCat**: *Customers* oldalon látszik minden tesztvásárlás (sandbox kapcsolóval); a
*Customer* lapon kézzel is adható/elvehető a `full_version` jogosultság (*Grant promotional
entitlement*), így vásárlás nélkül is tesztelhető a feloldás.

**Web / fejlesztés**: `npm run dev` alatt a teszt-bolt fut; `?test` paraméterrel a
`window.__swaplight.purchases` hookokkal szimulálható a megszakítás, függőben lévő és sikertelen
vásárlás (`setNextOutcome('cancelled' | 'pending' | 'failed')`) és a visszaállítás
(`ownedElsewhere()`).
