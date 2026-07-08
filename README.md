# Instagram politikai tényellenőrző - prototípus

Fél-automatizált, **ember-a-hurokban** tényellenőrző pipeline: népszerű
posztokban (magyar politikusok kommunikációjában) megjelenő ellenőrizhető
állításokat gyűjt ki, próbál rájuk verdiktet és forrást találni, majd
egy Instagram carousel-vázlatot (szöveg + forráslista) generál a
**saját** fiókodra. Semmi nem jut publikálásig emberi jóváhagyás nélkül.

Ez a döntés (saját tartalom, nem másokéra kommentelés) egy korábbi
beszélgetés eredménye: az Instagram API nem teszi lehetővé idegen posztok
alá automatizált kommentelést, a scraping-alapú megoldás pedig
ToS-sértő és bannolási kockázatot jelent. A saját posztos formátum
teljesen API-kompatibilis és megtartja az emberi minőségbiztosítást.

## Architektúra

```
fetch (Instagram Business Discovery API / mock minta adatok)
   -> analysis.claim_extraction   (LLM: ellenőrizhető állítások kinyerése)
   -> analysis.verification       retrieval-augmentált tényellenőrzés:
        1. analysis.retrieval_planner  (LLM: állítás -> strukturált lekérdezések)
        2. retrieval.orchestrator      (ÉLŐ adatok: Eurostat + KSH API, JSON-stat)
           + retrieval.websearch       (opcionális Tavily fallback, ha nincs dataset)
        3. LLM szintézis               (verdikt + források A LEKÉRT ADATOKBÓL)
   -> drafting.generator          (carousel szöveg-vázlat + caption)
   -> review.queue                (JSON fájlalapú: pending/approved/rejected/published)
   -> [EMBERI JÓVÁHAGYÁS]
   -> drafting.slide_renderer     (PNG slide-ok, opcionális, Pillow-val)
   -> publish.instagram_publish   (Content Publishing API a saját fiókra)
```

Minden lépés egy tiszta Python modul (`src/factcheck/`), CLI-n
(`cli.py`) keresztül vezérelve.

### Retrieval-augmentált tényellenőrzés

A verification már **nem** az LLM emlékezetéből dolgozik. Egy állításra:
1. az LLM strukturált lekérdezés-tervet ad (melyik Eurostat/KSH dataset,
   milyen dimenzió-szűrőkkel, milyen időszakra),
2. a `retrieval` réteg **valódi adatokat** húz le a hivatalos, kulcs
   nélküli API-król (Eurostat JSON-stat REST; KSH disszemináció),
3. az LLM már csak ezekből a konkrét, hivatkozható adatpontokból hoz
   verdiktet - kitalált szám/forrás tiltva.

Az adatlekérés hibatűrő: ha egy API nem elérhető vagy nincs találat, a
pipeline nem áll meg, a `needs_human_research` flag bekapcsol, és a CLI
jelzi. Élő lekérés kipróbálása a verification nélkül:

```bash
python cli.py retrieve --source eurostat --dataset une_rt_m \
  --filter geo=HU --filter sex=T --filter age=TOTAL \
  --filter s_adj=SA --filter unit=PC_ACT --since 2024-01
```

## Gyors indulás (mock mód, API-kulcs nélkül)

A prototípus alapból **mock módban** fut: nincs szükség Instagram vagy
Anthropic API-kulcsra, fiktív minta posztokkal és előre elkészített
"LLM-kimenetekkel" dolgozik (`src/factcheck/fetch/sample_data.py`),
hogy végig lehessen kísérni a teljes folyamatot.

```bash
pip install -r requirements.txt   # yaml, requests kellenek; Pillow/anthropic opcionális

python cli.py run                 # pipeline futtatása -> pending draft(ok)
python cli.py list pending        # mi vár jóváhagyásra
python cli.py show <draft_id>     # állítások, verdiktek, carousel-szöveg, források
python cli.py approve <draft_id> --notes "..."
python cli.py render <draft_id>   # PNG slide-ok generálása (data/generated_images/)
python cli.py publish <draft_id>  # dry-run: kiírja, mit posztolna
```

Teszt: `PYTHONPATH=src pytest tests/`

## Éles módba kapcsolás - milyen API-kulcsok kellenek?

Másold `.env.example` -> `.env`. Minden kulcs **opcionális és független**:
amelyik lépéshez kitöltöd a kulcsot, az éles módra vált, a többi mock/
dry-run marad. A teljes éles működéshez ezek kellenek:

| Lépés | Env változó(k) | Kell kulcs? | Honnan |
|---|---|---|---|
| **LLM** (állítás-kinyerés, lekérdezés-terv, szintézis) | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | **Igen** | console.anthropic.com -> API Keys |
| **Eurostat** adatlekérés | — | **Nem** (nyilvános) | csak hálózati elérés az ec.europa.eu-hoz |
| **KSH** adatlekérés | `KSH_API_BASE` (opcionális felülírás) | **Nem** (nyilvános) | statinfo.ksh.hu / www.ksh.hu/stadat |
| **Instagram figyelés** (Business Discovery) | `IG_ACCESS_TOKEN`, `IG_BUSINESS_ACCOUNT_ID` | **Igen** | developers.facebook.com (Meta app) |
| **Instagram publikálás** (Content Publishing) | `IG_ACCESS_TOKEN`, `IG_BUSINESS_ACCOUNT_ID` (+ publikus kép-URL) | **Igen** | ugyanaz a token |
| **Webkeresés fallback** (opcionális) | `TAVILY_API_KEY` | opcionális | docs.tavily.com |

**A minimum az igazi tényellenőrzéshez:** `ANTHROPIC_API_KEY`. Ezzel az
LLM valódi állításokat nyer ki és élő Eurostat/KSH adatból dolgozik
(a statisztikai API-khoz nem kell külön kulcs). Az Instagram-kulcsok
csak a figyelés/publikálás automatizálásához kellenek - addig kézzel is
be lehet táplálni posztot és kézzel posztolni a jóváhagyott draftot.

### Instagram token beszerzése (röviden)

1. Meta fejlesztői fiók + app: developers.facebook.com
2. Az IG fiók legyen **Business** vagy **Creator** típusú, Facebook
   oldalhoz kötve.
3. Engedélyek: `instagram_basic`, `instagram_content_publish`,
   `pages_read_engagement`, `business_management`.
4. Generálj **long-lived** access tokent, és a saját IG business
   account ID-t tedd a `.env`-be.

Figyelt fiókok listája: `config/accounts.yaml`.

## Fontos korlátok

1. **A verification élő forráskeresést végez, DE emberi jóváhagyás
   továbbra is kötelező.** Az LLM strukturált Eurostat/KSH lekérdezést
   tervez, a rendszer valódi adatot húz le, és az LLM ebből hoz
   verdiktet. Ettől függetlenül minden éles eredményen bekapcsol a
   `needs_human_research` flag, ha nem jött vissza adat, hiba volt, vagy
   a bizonyosság < 0,75 - és a review-queue amúgy is mindig emberi
   jóváhagyást vár publikálás előtt. A dataset-kód/dimenzió megválasztása
   LLM-feladat, ezért tévedhet: a lekért adat és a verdikt összhangját
   embernek kell ellenőriznie.
2. **A KSH API kevésbé stabil, mint az Eurostaté.** A pontos végpont/
   dataset-azonosítás változhat; `KSH_API_BASE`-zel felülírható, és hiba
   esetén a pipeline nem áll meg, csak "nincs adat" jelzést ad. Az
   Eurostat a megbízhatóbb elsődleges forrás.
3. **Csak a szöveges caption-t elemzi.** Instagram posztok nagy része
   kép/videó - OCR és multimodális képelemzés még nincs bekötve
   (`Post.image_description` mezőt kézzel/külön lépéssel kell
   feltölteni, ha kép is hordoz állítást).
3. **A Business Discovery API csak business/creator fiókokra megy.**
   Ha egy politikus fiókja sima személyes fiók, API-val nem érhető el
   - kézi/beküldéses figyelésre van szükség.
4. **A publikálás képhosztingot igényel.** A Graph API `image_url`-t
   vár, nem fájlfeltöltést - a renderelt slide-okat előbb publikus
   tárhelyre (pl. S3+CloudFront) kell tölteni, az URL-eket a
   `publish --image-url` kapja meg. Enélkül a `publish` mindig dry-run.
5. **Szerkesztői fegyelem, nem technikai kérdés.** A projekt
   védhetősége azon áll, hogy (a) csak ellenőrizhető ténystátuszú
   állításokkal foglalkozik, nem véleményekkel, (b) minden oldal
   posztjait ugyanolyan mércével nézi, (c) minden korrekcióhoz teljes
   forráslista jár, (d) semmi nem publikálódik emberi jóváhagyás
   nélkül.

## Roadmap-ötletek

- További strukturált források a retrievalbe: MNB, ÁSZ, Magyar Közlöny
  (a `retrieval` réteg providerekre bontott, könnyen bővíthető).
- Kép/videó OCR + multimodális elemzés a caption-only elemzés helyett.
- Egyszerű webes review-felület a CLI helyett (a `review/queue.py`
  fájlalapú tárolása miatt ez könnyen ráépíthető).
- Automatikus S3-feltöltés a renderelt slide-okhoz, hogy a `publish`
  éles módban is egy gombnyomásos legyen.
- Napi/óránkénti ütemezés a `cli.py run`-ra a saját fiókod
  Business Discovery hozzáférésével.
