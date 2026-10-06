# Háztartási teendők – tervezési dokumentum

> Webalkalmazás az átlagos háztartás ismétlődő feladataihoz (számlabefizetés,
> mérőóra-diktálás, autószerviz, karbantartások stb.), konfigurálható
> ismétlődéssel és Google Naptár szinkronizációval.

Munkanév: **Házirend**

---

## 1. Célok és nem-célok

### Célok
- Bármilyen ismétlődő háztartási teendő felvihető legyen néhány kattintással,
  kész sablonokból vagy nulláról.
- Az ismétlődés rugalmasan konfigurálható legyen: fix naptári ütemezés,
  időablak, „utolsó elvégzéstől számított” és használat-alapú (km, üzemóra)
  szabályok.
- A teendők megjelenjenek a felhasználó Google Naptárában, és az ott végzett
  módosítások (áthúzás másik napra, törlés) visszaszinkronizálódjanak.
- Egy háztartáson belül több tag osztozhat a feladatokon, felelőssel.
- Az elvégzés rögzítésekor eltárolható legyen a releváns adat (befizetett
  összeg, mérőállás, km-óra állás, bizonylat fotó) – ebből később
  kimutatás készülhet.

### Nem-célok (első körben)
- Banki integráció / automatikus befizetés.
- Közműszolgáltatói API-k (E.ON, MVM, Főgáz stb.) közvetlen elérése – a
  diktálás linkje elmenthető, de a diktálást a felhasználó végzi.
- Natív mobilalkalmazás (helyette PWA).
- Kétirányú szinkron más naptárakkal (Outlook, iCloud) – ezekhez csak
  csak-olvasható iCal feed lesz.

---

## 2. Felhasználói szerepek

| Szerep | Leírás |
|---|---|
| **Háztartás tulajdonos** | Létrehozza a háztartást, tagokat hív meg, kezeli a Google-integrációt. |
| **Tag** | Teendőket vihet fel, elvégezhet, saját naptárába szinkronizálhat. |
| **Megfigyelő** (opcionális) | Csak olvasás – pl. könyvelő, felnőtt gyerek. |

Minden tag a **saját** Google fiókját kötheti be; a szinkronizáció tagonként
választható (pl. csak a nekem kiosztott teendők, vagy minden teendő).

---

## 3. Fogalmak és adatmodell

```
Household 1───* Membership *───1 User
    │
    ├──* Asset            (autó, lakás, kazán, klíma, háziállat …)
    │
    └──* Task  ───────1 RecurrenceRule
          │  (sorozat-definíció)
          ├──* Occurrence  (konkrét esedékesség)
          │       └──0..1 Completion (elvégzés + adatok, csatolmány)
          └──* Reminder    (értesítési szabályok)

User 1───* CalendarConnection 1───* CalendarEventLink
```

### 3.1 Főbb entitások

**Task** (teendő-sorozat)
| Mező | Típus | Megjegyzés |
|---|---|---|
| id | uuid | |
| household_id | fk | |
| asset_id | fk, null | pl. „Skoda Octavia” |
| title | text | „Gázóra diktálás” |
| category | enum | `bill`, `meter`, `vehicle`, `maintenance`, `health`, `admin`, `other` |
| description, url | text | pl. a szolgáltató diktáló oldala |
| assignee_id | fk, null | felelős tag; null = bárki |
| expected_amount | money, null | számláknál várható összeg |
| data_schema | enum, null | elvégzéskor mit kérjünk be: `amount`, `meter_reading`, `odometer`, `none` |
| duration / all_day | | naptáresemény hossza; alapból egész napos |
| status | enum | `active`, `paused`, `archived` |
| timezone | text | alap: `Europe/Budapest` |

**RecurrenceRule** – lásd 4. fejezet.

**Occurrence** (konkrét esedékesség) – csak a következő *N* (alapból 12
hónapnyi) előfordulás materializálódik, a többit a szabályból számoljuk.
| Mező | Megjegyzés |
|---|---|
| task_id, sequence_no | |
| due_date / window_start, window_end | időablakos teendőknél ablak |
| original_due_date | ha áthelyezték, az eredeti dátum (RRULE kivételhez) |
| state | `upcoming`, `due`, `overdue`, `done`, `skipped` |
| is_override | felhasználó / naptár által módosított |

**Completion**: `occurrence_id`, `done_by`, `done_at`, `amount`,
`meter_value`, `odometer_km`, `note`, `attachments[]`.

**Asset**: `type` (`vehicle`, `property`, `appliance`, `pet`, `person`),
név, és típusfüggő attribútumok (autónál rendszám, aktuális km-állás,
átlagos havi futás; mérőnél mérőszám).

**CalendarConnection**: `user_id`, Google `refresh_token` (titkosítva),
`calendar_id`, `sync_token`, `watch_channel_id`, `watch_expiration`,
`scope_mode` (`assigned_to_me` | `all`).

**CalendarEventLink**: `occurrence_id` vagy `task_id` ↔ `google_event_id`,
`etag`, `last_pushed_hash` – idempotens, ütközésmentes frissítéshez.

---

## 4. Ismétlődési modell

Az ismétlődés a rendszer lelke. Négy ütemezési **mód** van, amelyek
kombinálhatók egy „ami előbb bekövetkezik” szabállyal.

### 4.1 Módok

| Mód | Leírás | Példa |
|---|---|---|
| **Fix naptári** (`calendar`) | RFC 5545 RRULE alapú, az elvégzéstől független. | Közös költség minden hónap 10-ig; lakásbiztosítás évente márc. 1. |
| **Időablak** (`window`) | Ismétlődő ablak kezdő- és végnappal. | Gázóra diktálás minden hónap 1–5. között; nyári/téli gumicsere márc. 15–ápr. 15. |
| **Elvégzéstől számított** (`after_completion`) | A következő esedékesség az *utolsó elvégzés* + intervallum. | Légkondi szűrő: elvégzés után 3 hónappal; vízszűrő betét. |
| **Használat-alapú** (`usage`) | Egy asset számlálója alapján (km, üzemóra). | Olajcsere 15 000 km-enként. |

**Kombinált szabály:** `usage` OR `after_completion`, pl. *„olajcsere
15 000 km vagy 1 év, ami előbb”*. Használat-alapú esedékességnél a dátumot
az asset becsült átlagos futásából jósoljuk (`(cél_km - akt_km) / napi_átlag`),
és minden új km-állás rögzítésekor újraszámoljuk.

### 4.2 Konfigurálható paraméterek (UI → RRULE)

- **Gyakoriság:** naponta / hetente / havonta / évente + „minden N.”
- **Hét napjai** (heti esetén), **hónap napja** (pl. 10.), **hónap utolsó
  napja** (`BYMONTHDAY=-1`), **N. adott hétköznap** (pl. „hónap első hétfője”
  → `BYDAY=1MO`), **hónap utolsó munkanapja** (`BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1`).
- **Évszakos szűkítés:** csak bizonyos hónapokban (`BYMONTH=10,11,12,1,2,3,4`
  – pl. kazán ellenőrzés csak fűtési szezonban).
- **Kezdet és vég:** kezdődátum, vég: soha / dátumig / N alkalom után.
- **Munkaszüneti nap kezelés:** ha az esedékesség hétvégére vagy magyar
  ünnepnapra esik → *nem változik* / *előző munkanap* / *következő munkanap*.
  (Magyar ünnepnap- és áthelyezett munkanap-naptár beépítve, évente frissítve.)
- **Előretolás (lead time):** „jelenjen meg 5 nappal az esedékesség előtt”.
- **Késedelem kezelés:** lejárt teendő `overdue` marad, amíg el nem végzik
  vagy át nem ugorják; fix módban a következő előfordulás ettől függetlenül
  generálódik.

A szerkesztőben **élő előnézet** mutatja a következő 6 esedékességet, így a
felhasználó azonnal látja, jól állította-e be.

### 4.3 Tárolás

```jsonc
{
  "mode": "calendar",              // calendar | window | after_completion | usage
  "rrule": "FREQ=MONTHLY;BYMONTHDAY=10",
  "dtstart": "2026-01-10",
  "window_days": null,             // window módnál: ablak hossza napban
  "interval": null,                // after_completion: {"months": 3}
  "usage": null,                   // {"asset_id": "...", "every": 15000, "unit": "km"}
  "or_max_interval": null,         // kombinált: {"years": 1}
  "holiday_policy": "previous_workday",
  "lead_days": 3
}
```

Számítás: `rrule` könyvtár (JS: `rrule`, Python: `dateutil.rrule`), minden
számolás a háztartás időzónájában, dátum-alapon (nem időpont-alapon), hogy
a DST-váltások ne csúsztassák el az egész napos eseményeket.

### 4.4 Beépített sablonok (példák)

| Sablon | Kategória | Alapértelmezett szabály | Bekért adat |
|---|---|---|---|
| Villanyszámla befizetés | bill | havonta, 15-ig | összeg |
| Gázszámla befizetés | bill | havonta, 15-ig | összeg |
| Közös költség | bill | havonta 10-ig | összeg |
| Internet / mobil / TV előfizetés | bill | havonta | összeg |
| Gázóra diktálás | meter | havonta 1–5. ablak (szolgáltatónként állítható) | mérőállás |
| Villanyóra diktálás | meter | havonta / évente ablak | mérőállás |
| Vízóra diktálás | meter | negyedévente / havonta ablak | mérőállás |
| Olajcsere | vehicle | 15 000 km VAGY 1 év | km-állás, összeg |
| Gumicsere (téli/nyári) | vehicle | évente 2× ablak (márc. 15–ápr. 15., okt. 15–nov. 15.) | km-állás |
| Műszaki vizsga | vehicle | 2 évente (asset adatból) | összeg |
| KGFB / casco évforduló | vehicle | évente, 60 nappal előtte emlékeztet | összeg |
| Autópálya-matrica | vehicle | évente jan. 31-ig | összeg |
| Gépjárműadó | admin | félévente márc. 15., szept. 15. | összeg |
| Kazán / cirkó karbantartás | maintenance | évente, szeptemberben | összeg |
| Kéményseprés | maintenance | évente | – |
| Klíma tisztítás, szűrőcsere | maintenance | elvégzés + 6 hónap | – |
| Füstérzékelő / CO-érzékelő elemcsere | maintenance | évente | – |
| Vízkőtelenítés (bojler, kávéfőző) | maintenance | elvégzés + 3 hónap | – |
| Háziállat oltás, féregtelenítés | health | évente / 3 havonta | – |
| Személyi / jogosítvány lejárat | admin | egyszeri, 90 nappal előtte | – |

A sablonok adatként (seed JSON) élnek, így közösségi bővítés is lehetséges.

---

## 5. Google Naptár szinkronizáció

### 5.1 Hitelesítés és jogosultság
- Bejelentkezés Google OAuth-tal (OpenID Connect); a naptár-hozzáférés
  **külön, inkrementális** engedélykéréssel történik, amikor a felhasználó
  bekapcsolja a szinkront.
- Scope: `https://www.googleapis.com/auth/calendar.app.created` – az app csak
  az **általa létrehozott** naptárt látja és kezeli. Ez a legkisebb jogosultság,
  és kevésbé szigorú Google-ellenőrzést igényel, mint a teljes `calendar` scope.
- A szinkron egy dedikált **„Háztartás”** naptárt hoz létre a felhasználó
  fiókjában (saját színnel, ki-be kapcsolható Google-ben). Ezt a tag
  megoszthatja a családdal Google-oldalon is, de a javasolt út: minden tag
  saját maga köti be.
- `refresh_token` titkosítva (AES-GCM, KMS-kulcs) tárolva; visszavonáskor
  (`invalid_grant`) a kapcsolat `disconnected` állapotba kerül és a
  felhasználó értesítést kap.

### 5.2 Leképezés: teendő → esemény

| Ütemezési mód | Google oldali megjelenés |
|---|---|
| `calendar` (fix) | **Egy ismétlődő esemény** natív `RRULE`-lal. Áthelyezett / elvégzett előfordulások *kivétel-példányként* (instance override) jelennek meg. |
| `window` | Ismétlődő **többnapos, egész napos** esemény (ablak hossza), vagy beállítástól függően csak az ablak első napján. |
| `after_completion`, `usage` | **Csak a következő előfordulás** egyedi eseményként; elvégzéskor az app létrehozza a következőt. (RRULE-lal nem kifejezhető.) |

Esemény tartalma:
- `summary`: `🧾 Gázszámla befizetés` → elvégzés után `✅ Gázszámla befizetés`
- `description`: leírás, várható összeg, link a szolgáltatóhoz, mély link az
  appba (`/o/{occurrenceId}` – egy kattintással „Kész” jelölés).
- `start/end`: egész napos (`date`), vagy ha időpont is meg van adva, `dateTime`
  `Europe/Budapest` időzónával.
- `reminders.overrides`: a teendő emlékeztetői (pl. 1 nap előtte 9:00 popup).
- `extendedProperties.private`: `{ taskId, occurrenceId, appVersion }` – ezzel
  azonosítjuk vissza az eseményt, sosem a címből.
- `colorId`: kategória szerint.

### 5.3 Irányok és konfliktuskezelés

**App → Google (push)** – minden releváns változás (teendő létrehozás,
szerkesztés, elvégzés, kihagyás, törlés) egy `calendar_sync` jobot tesz a
sorba. A job:
1. kiszámolja a kívánt esemény-állapotot,
2. összeveti a `last_pushed_hash`-sel (ha egyezik, nincs hívás),
3. `insert` / `patch` / `delete` hívást végez `If-Match: etag`-gel,
4. eltárolja az új `etag`-et és hash-t.

**Google → App (pull)** – a Google-ben végzett módosítások visszafelé:
- `events.watch` push-csatorna a naptárra → webhook (`/webhooks/google/calendar`)
  csak jelzést kap, ekkor **inkrementális lekérés** `syncToken`-nel
  (`events.list?syncToken=…`). `410 Gone` esetén teljes újraszinkron.
- Biztonsági háló: óránkénti pollozás `syncToken`-nel (ha a webhook elveszne).
- A watch csatorna lejár (max. ~1 hét) → napi job megújítja.

**Szabályok (a definíció az appban él, a naptár „nézet”):**

| Google-oldali változás | App reakciója |
|---|---|
| Egy előfordulás áthúzása másik napra | Occurrence `due_date` felülírás (`is_override`), a sorozat nem változik. |
| Egész sorozat időpontjának módosítása | Kérdés az appban („Alkalmazzuk a teendő szabályára?”) – addig az app állapota marad érvényben, és a következő push visszaírja. Opcionálisan: felhasználói beállítás „Google-módosítás mindig nyer”. |
| Egy előfordulás törlése | Occurrence `skipped`. |
| Teljes sorozat törlése | Teendő `paused` + értesítés (nem töröljük az adatot). |
| Cím / leírás szerkesztése | Figyelmen kívül hagyjuk, következő push felülírja. |
| A „Háztartás” naptár törlése | Kapcsolat `disconnected`, értesítés, újra-létrehozás felajánlása. |

Saját visszhang kiszűrése: a pull során az `etag` alapján felismerjük a saját
változtatásainkat, így nincs végtelen ciklus.

### 5.4 Robusztusság
- Exponenciális backoff `403 rateLimitExceeded` / `429` / `5xx` esetén;
  felhasználónkénti token-bucket.
- Idempotencia: minden létrehozásnál kliens-generált `event.id`
  (base32hex a `occurrenceId`-ből) → dupla insert nem hoz létre duplikátumot.
- Kezdeti feltöltés kötegelve (`batch` endpoint), max. 12 hónapra előre.
- Lecsatlakozáskor választható: a „Háztartás” naptár törlése vagy megtartása.

### 5.5 Alternatíva más naptárakhoz
Csak-olvasható **iCal feed**: `https://app/ical/{secret-token}.ics` –
Apple Naptár, Outlook, bármi feliratkozhat rá. A token újragenerálható.

---

## 6. Értesítések

Csatornák: **Google Naptár emlékeztető** (ha be van kötve), **Web Push**
(PWA), **e-mail** (napi/heti összesítő). Tagonként állítható, csendes
időszakkal (pl. 22:00–8:00). Lejárt teendőkre napi egy összesítő, nem
spam.

---

## 7. Felhasználói felület

1. **Irányítópult** – „Lejárt”, „Ma”, „Ezen a héten”, „Hamarosan” csoportok;
   kártyán egy gomb: **Kész** (felugró ablakban bekéri a sablon szerinti
   adatot: összeg / mérőállás / km). Gyors „Kihagyás” és „Halasztás +N nap”.
2. **Naptár nézet** – havi / heti nézet, kategória-színekkel.
3. **Teendők listája** – szűrés kategória, asset, felelős szerint.
4. **Teendő szerkesztő** – sablonválasztó → név, kategória, asset, felelős →
   **ismétlődés-építő** (módválasztó + emberi nyelvű összefoglaló, pl.
   *„Minden hónap 10-én, ha hétvége, előtte lévő pénteken”*) + élő előnézet →
   emlékeztetők → Google szinkron kapcsoló.
5. **Asset oldal** – pl. autó: aktuális km, kapcsolódó teendők, költség-
   és km-történet grafikon; mérő: fogyasztási grafikon a diktált értékekből.
6. **Kimutatások** – havi rezsiköltség kategóriánként, éves összesítés,
   fogyasztás-trendek, CSV export.
7. **Beállítások** – háztartás tagjai, meghívás, Google-kapcsolat állapota
   (utolsó szinkron, hibák, „Újraszinkron” gomb), iCal link, értesítések.

Mobil-első, reszponzív, PWA (telepíthető, offline olvasás, push).
Nyelv: magyar elsődleges, i18n-re felkészítve.

---

## 8. Architektúra

```
┌─────────────┐   HTTPS    ┌──────────────────────────┐
│  Böngésző   │──────────▶│  Web app (Next.js)        │
│  PWA        │◀──────────│  - UI (React, SSR)        │
└─────────────┘  Web Push  │  - REST/tRPC API          │
                           │  - Auth (Google OIDC)     │
                           └─────┬───────────┬────────┘
                                 │           │ enqueue
                          ┌──────▼─────┐ ┌───▼──────────────┐
                          │ PostgreSQL │ │ Job queue        │
                          │            │◀┤ (pg-boss)        │
                          └────────────┘ └───┬──────────────┘
                                             │
                                  ┌──────────▼───────────┐
                                  │ Worker               │
                                  │ - occurrence generátor│
                                  │ - Google sync push/pull│
                                  │ - értesítések        │
                                  │ - watch megújítás    │
                                  └──────────┬───────────┘
                                             │
                       Google Calendar API ◀─┘──▶ Webhook (/webhooks/google)
```

### 8.1 Javasolt technológiai stack
| Réteg | Választás | Indok |
|---|---|---|
| Nyelv | TypeScript (végig) | közös típusok front/back között |
| Web | Next.js (App Router) + React + Tailwind + shadcn/ui | SSR, API route-ok egy helyen |
| Auth | Auth.js (Google provider) | inkrementális scope támogatás |
| DB | PostgreSQL + Prisma / Drizzle | tranzakciók, JSONB a szabályhoz |
| Queue | pg-boss (Postgres-alapú) | nincs külön Redis, elég ehhez a terheléshez |
| Ismétlődés | `rrule` + saját ünnepnap-modul | RFC 5545 kompatibilis, azonos a Google-lel |
| Google | `googleapis` hivatalos kliens | |
| Push | Web Push (VAPID) | |
| Fájlok | S3-kompatibilis tároló (bizonylatfotók) | |
| Hosting | pl. Fly.io / Render / Cloud Run + managed Postgres | EU régió (GDPR) |
| Teszt | Vitest (szabálymotor!), Playwright (E2E) | |

### 8.2 Ütemezett jobok
| Job | Gyakoriság | Feladat |
|---|---|---|
| `materialize_occurrences` | naponta + változáskor | előre 12 hónap occurrence-t tart fenn |
| `update_states` | óránként | `upcoming → due → overdue` átmenetek |
| `send_notifications` | 15 percenként | esedékes emlékeztetők kiküldése |
| `calendar_push` | eseményvezérelt | app → Google |
| `calendar_pull` | webhook + óránként | Google → app |
| `renew_watch_channels` | naponta | lejáró csatornák megújítása |

### 8.3 API vázlat (REST)
```
GET    /api/households/:id/dashboard
GET    /api/tasks?category=&assetId=&assignee=
POST   /api/tasks                      (sablonból is: { templateId, overrides })
PATCH  /api/tasks/:id
DELETE /api/tasks/:id                  (archiválás)
POST   /api/tasks/:id/preview          → következő N esedékesség
GET    /api/occurrences?from=&to=
POST   /api/occurrences/:id/complete   { amount?, meterValue?, odometerKm?, note?, attachments? }
POST   /api/occurrences/:id/skip
POST   /api/occurrences/:id/snooze     { days }
CRUD   /api/assets
POST   /api/assets/:id/readings        (km-állás → usage szabály újraszámolás)
POST   /api/integrations/google/connect
POST   /api/integrations/google/resync
DELETE /api/integrations/google        { deleteCalendar: bool }
POST   /webhooks/google/calendar
GET    /ical/:token.ics
```

---

## 9. Biztonság és adatvédelem
- Minden lekérdezés `household_id` szerint szűrve (sor-szintű jogosultság,
  Postgres RLS opcionálisan).
- Google tokenek titkosítva, csak a worker fér hozzá; minimális scope.
- Webhook ellenőrzés: `X-Goog-Channel-Token` titok egyezése +
  `X-Goog-Resource-ID` a tárolt csatornához.
- GDPR: adatexport (JSON/CSV), fiók és háztartás törlése (a Google-naptárral
  együtt, ha kéri), EU-s adattárolás, adatkezelési tájékoztató – a Google
  OAuth ellenőrzéshez is kell.
- Nincs banki / jelszó adat tárolás; számlaszámot csak opcionális megjegyzésként.

---

## 10. Megvalósítási ütemterv

**0. fázis – Alapok (1 hét)**
Projekt váz, auth, háztartás + tagok, DB séma, CI.

**1. fázis – MVP (3–4 hét)**
- Teendő CRUD, `calendar` és `after_completion` mód, ismétlődés-építő
  előnézettel, magyar ünnepnapok.
- Irányítópult, elvégzés adatbekéréssel, kihagyás/halasztás.
- 10–15 beépített sablon.
- Google Naptár **egyirányú** szinkron (app → Google), dedikált naptár.
- E-mail összesítő.

**2. fázis – v1 (3 hét)**
- Kétirányú szinkron (watch + syncToken), konfliktus-szabályok.
- `window` és `usage` mód, assetek, km-állás rögzítés, kombinált szabály.
- PWA + Web Push, iCal feed.

**3. fázis – v2**
- Kimutatások, grafikonok, CSV export, bizonylatfotók.
- Feladat-rotáció tagok között (pl. heti takarítási beosztás).
- Bővíthető sablonkönyvtár, szolgáltató-specifikus diktálási ablakok.
- Opcionális: e-mailes számlák automatikus felismerése (Gmail-szabály).

---

## 11. Nyitott kérdések
1. Egy közös „Háztartás” naptár (tulajdonosnál, megosztva) vagy tagonkénti
   saját naptár legyen az alapértelmezés? *(Javaslat: tagonkénti, a
   „csak nekem kiosztott” szűréssel.)*
2. Fix módú teendőknél a Google-ben elvégzettnek jelölés (pl. címbe ✅) ok-e,
   vagy maradjon az esemény változatlan és csak az app tudja az állapotot?
3. Kell-e több háztartás / felhasználó (pl. nyaraló, szülők lakása)?
   A modell támogatja, a UI-ban háztartásváltó kell.
4. Egyfelhasználós, önhosztolt változat (Docker Compose) is cél?
