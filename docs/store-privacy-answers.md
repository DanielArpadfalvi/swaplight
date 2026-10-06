# Adatvédelmi és korhatár-kérdőívek – kész válaszok

Ez a dokumentum a **Google Play Data safety** űrlap, az **App Store App Privacy** („nutrition label”)
és a két **korhatár-kérdőív** (IARC a Play-en, Apple Age Rating) válaszait tartalmazza, a kód
alapján (2026-10, 1.0 előtti állapot). Ha a kód adatkezelése változik (pl. analitika, online
ranglista, fiók a 1.1-ben), **ezeket és a `docs/site/privacy*.html` oldalakat is frissíteni kell**.

## 0. Mit csinál a játék valójában? (a válaszok alapja)

| Terület | Kód | Adat elhagyja a készüléket? |
|---|---|---|
| Mentés, beállítások, statisztika, napi kihívás eredmények | `src/platform/storage.ts` (Capacitor Preferences / localStorage) | **Nem** |
| Nyelv | eszköznyelv kiolvasása (`navigator.languages`), helyben | Nem |
| Rezgés, életciklus, státuszsor, splash | `src/platform/*` natív pluginek | Nem |
| „Eredmény másolása” (napi kihívás) | vágólapra írás, csak a játékos koppintására; a játékos dönti el, hova illeszti be | Nem (a játék nem küldi sehova) |
| Hálózat | a `src/` alatt nincs `fetch`/XHR/WebSocket/analitika/reklám SDK; a betűtípusok rendszerbetűk | Nem |
| **Vásárlás** (M8, `src/platform/purchases.ts`) | jelenleg mock; az 1.0-ban **RevenueCat** (`@revenuecat/purchases-capacitor`) + Apple StoreKit / Google Play Billing | **Igen, csak ez** |

A RevenueCat SDK (a dokumentációja szerint, alapbeállítással, „custom App User ID” nélkül) ezt
küldi a saját szervereire:
- **anonim App User ID** (`$RCAnonymousID:…`, véletlen azonosító, az app első indulásakor jön létre,
  nem kötődik névhez, e-mailhez, fiókhoz);
- **vásárlási adatok**: az áruház nyugtája / purchase token, termékazonosító, ár, pénznem, időpont,
  az áruház országa (storefront);
- a kérésekhez technikailag szükséges adatok: platform, OS- és app-verzió, SDK-verzió, IP-cím
  (a kapcsolat része).

A fizetést (kártyaadatok, számlázási cím) **az Apple / a Google** kezeli; a játék és a RevenueCat
ezekhez nem fér hozzá. Hirdetési azonosítót (IDFA/AAID) nem kérünk, ATT-promptot nem mutatunk,
`collectDeviceIdentifiers()`-t / attribúciós integrációt **nem** kapcsolunk be.

> Ellenőrizd a beküldés előtt a RevenueCat aktuális útmutatóját (*RevenueCat docs → Apple App
> Privacy* és *Google Play Data Safety*), mert az SDK-verzióval változhat, mit gyűjt. Ha ott több
> szerepel (pl. diagnosztika), azt is jelöld.

---

## 1. Google Play – Data safety (App content → Data safety)

**Data collection and security**
| Kérdés | Válasz |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (HTTPS) |
| Do you provide a way for users to request that their data is deleted? | **Yes** – e-mailben (CONTACT_EMAIL); a RevenueCat-ben a „customer” törölhető. Lásd az adatvédelmi nyilatkozatot. |
| Account creation | **My app does not allow users to create an account** |
| Independent security review | nem kötelező, hagyd üresen / No |
| UPI / Families | nem releváns |

**Data types** – csak ezt a kettőt jelöld:

| Kategória → típus | Collected | Shared | Ephemeral | Required / optional | Cél (purpose) |
|---|---|---|---|---|---|
| **Financial info → Purchase history** | Yes | **No** ¹ | No | **Required** ² | **App functionality** |
| **Device or other IDs** (anonim App User ID) | Yes | **No** ¹ | No | **Required** ² | **App functionality** |

¹ A Play definíciója szerint a *szolgáltatónak* (service provider) a te nevedben, a te
utasításod szerint történő átadás **nem** „sharing” – a RevenueCat ilyen adatfeldolgozó.
A Google Play Billing a Google saját rendszere, az sem „sharing”.
² Az SDK minden indításkor lekéri a jogosultságot, a játékos ezt nem tudja kikapcsolni →
„Required” (konzervatív válasz).

Minden más kategória (Location, Personal info, Messages, Photos, Audio, Files, Calendar,
Contacts, App activity, Web browsing, App info and performance, Health) → **nincs gyűjtés**.

*Ha a RevenueCat integrációja mégis elmarad (csak Play Billing közvetlenül): „No data collected”.*

**Ads declaration:** *Does your app contain ads?* → **No**.

---

## 2. App Store Connect – App Privacy

*Data Collection* → **Yes, we collect data from this app** (a RevenueCat miatt; RevenueCat nélkül:
„Data Not Collected”).

| Data type | Use | Linked to the user? | Used for tracking? |
|---|---|---|---|
| **Purchases → Purchase History** | **App Functionality** | **No** ³ | **No** |
| **Identifiers → User ID** (anonim RevenueCat App User ID) | **App Functionality** | **No** ³ | **No** |

³ Az azonosító véletlenszerű, a játékban nincs fiók, név, e-mail; az adat nem köthető a felhasználó
személyazonosságához. **Ha később bejelentkezés / saját App User ID (pl. Game Center, e-mail)
kerül be, mindkettőt „Linked to you”-ra kell állítani.** Bizonytalanság esetén a „Linked” a
konzervatívabb választás – a címke ettől „Data Linked to You” blokkban jelenik meg, ami
elfogadott, csak kevésbé szép.

Minden más típus: nem gyűjtjük. Nincs tracking → ATT (App Tracking Transparency) nem kell.
A fizetési adatokat az Apple kezeli, ezeket **nem** kell deklarálni.

**Privacy manifest:** a RevenueCat iOS SDK saját `PrivacyInfo.xcprivacy`-t hoz; a Capacitor pluginek
(Preferences → `UserDefaults`, required-reason API) is. Ha az App Store Connect feltöltéskor
„Missing API declaration” e-mailt küld, létre kell hozni az app saját
`ios/App/App/PrivacyInfo.xcprivacy` fájlját (jelenleg nincs ilyen) a hiányzó okkal (UserDefaults:
`CA92.1`).

---

## 3. Korhatár – IARC (Google Play: App content → Content rating)

- E-mail-cím: a te címed · Kategória: **Game** (*All Other App Types* nem kell).

| Kérdéscsoport | Válasz |
|---|---|
| Violence (bármilyen erőszak, vér, fegyver) | **No** – absztrakt színes blokkok |
| Fear / horror | **No** |
| Sexuality / nudity | **No** |
| Gambling (valódi vagy szimulált szerencsejáték, kaszinó) | **No** ⁴ |
| Language (trágárság) | **No** |
| Controlled substances (drog, alkohol, dohány) | **No** |
| Crude humor | **No** |
| Users can interact or exchange content (chat, UGC) | **No** – a „Másolás” csak a vágólapra ír, nincs beépített megosztás/közösség |
| Shares user's current physical location | **No** |
| Allows users to purchase digital goods | **Yes** (Teljes verzió) |
| Random items purchased with real money (loot box) | **No** – a Teljes verzió fix tartalmat old fel |
| Unrestricted internet access / browser | **No** |
| Is it a web browser or search engine | **No** |

⁴ A Futam boltjában a játékbeli „szikra” (nem vásárolható pénzért) cserébe sorsolt ereklyék
vannak – ez nem szerencsejáték: nincs valódi pénz, nincs pénzre váltható nyeremény.

**Várt eredmény:** PEGI **3**, ESRB **Everyone**, USK **0**, ClassInd **L**, ACB **G**, GRAC **ALL**
– „In-App Purchases” kiegészítő jelzéssel.

---

## 4. Korhatár – Apple (App Information → Age Rating)

Az új (2025-ös) Apple-kérdőív válaszai:

| Kérdés | Válasz |
|---|---|
| **In-app controls** – Parental Controls | No |
| Age Assurance | No |
| **Capabilities** – Unrestricted Web Access | No |
| User-Generated Content | No |
| Messaging and Chat | No |
| Advertising | No |
| **Mature themes** – Profanity or Crude Humor | None |
| Horror/Fear Themes | None |
| Alcohol, Tobacco, or Drug Use or References | None |
| **Medical or wellness** – Medical or Treatment Information | None |
| Health or Wellness Topics | No |
| **Sexuality or nudity** – Mature or Suggestive Themes / Sexual Content / Graphic Sexual Content / Nudity | None |
| **Violence** – Cartoon or Fantasy Violence | None |
| Realistic Violence / Prolonged Graphic or Sadistic Realistic Violence / Guns or Other Weapons | None |
| **Chance-based activities** – Simulated Gambling | None |
| Gambling (real money) | No |
| Contests | None |
| Loot boxes (paid random items) | No |

**Várt eredmény: 4+.** „Made for Kids”: **nem** jelöld (a Kids kategória külön szabályokat hoz,
pl. külső SDK-k korlátozása).

---

## 5. Egyéb nyilatkozatok

- **Play – Government apps / Financial features / Health / News / COVID:** No / nem releváns.
- **Play – Ads:** No ads.
- **Play – Target audience:** 13+ (indoklás: `store/listing/README.md`).
- **App Store – Export compliance:** csak szabványos titkosítás (HTTPS) → `ITSAppUsesNonExemptEncryption = NO` (már az Info.plistben).
- **EU DSA trader status:** lásd `docs/APP-STORE-CHECKLIST.md` 3. pont.
- **Adatvédelmi nyilatkozat URL / Support URL:** lásd `docs/RELEASE.md` 6. fejezet.
