# Store-adatlap szövegek (EN + HU)

Egy mező = egy fájl, nyelvenként (`en/`, `hu/`). Másold be őket a konzolba úgy, ahogy vannak
(a záró sortörés nem számít bele). Hosszellenőrzés: `npm run store:check`.

| Fájl | Hova | Korlát |
|---|---|---|
| `name.txt` | App Store *Name* · Play *App name* | 30 karakter |
| `subtitle.txt` | App Store *Subtitle* | 30 karakter |
| `short_description.txt` | Play *Short description* | 80 karakter |
| `full_description.txt` | App Store *Description* · Play *Full description* | 4000 karakter |
| `keywords.txt` | App Store *Keywords* (vessző, szóköz nélkül) | 100 bájt |
| `promotional_text.txt` | App Store *Promotional Text* (review nélkül bármikor módosítható) | 170 karakter |
| `release_notes.txt` | App Store *What's New* · Play *Release notes* (1.0) | 4000 / 500 karakter |

A kulcsszavak nem ismétlik a névben már szereplő szavakat (az Apple azokat amúgy is indexeli), és
nem tartalmaznak védjegyet (más játékok nevét). A leírások sem hivatkoznak más játékokra.

## Kategória

- **App Store:** elsődleges *Games*, alkategóriák: **Puzzle** + **Arcade**. Másodlagos kategória:
  *Games → Strategy* (opcionális).
- **Google Play:** *Game* → **Puzzle**. Címkék (Store settings → Tags): *Puzzle*, *Match 3*,
  *Casual*, *Offline*, *Single player*, *Stylized*.
- Ár: ingyenes, egy nem fogyó (non-consumable) IAP: „Full Version / Teljes verzió” (~4,99 USD).

## Korhatár (várható eredmény)

- **App Store:** 4+ · **IARC:** PEGI 3, ESRB Everyone, USK 0, (Brazília) L.
- A kérdőívek pontos válaszai: `docs/store-privacy-answers.md`.

## Célközönség (Play → Target audience)

13+ korcsoportok (13–15, 16–17, 18+). A 13 év alattiak kihagyása **nem** a tartalom miatt
javasolt (az mindenkinek való), hanem mert gyerek-célközönségnél a Play Families Policy további
követelményeket ír elő (minden SDK – így a RevenueCat – megfelelése, szigorúbb adatkezelés,
külön ellenőrzés). Ha később gyerekeket is meg akarsz célozni, előtte nézzük át a Families
Policyt. „Appeal to children”: nem.
