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
   -> analysis.claim_extraction  (LLM: ellenőrizhető állítások kinyerése)
   -> analysis.verification      (LLM: verdikt + forrás-vázlat + bizonyosság)
   -> drafting.generator         (carousel szöveg-vázlat + caption)
   -> review.queue               (JSON fájlalapú review-queue: pending/approved/rejected/published)
   -> [EMBERI JÓVÁHAGYÁS]
   -> drafting.slide_renderer    (PNG slide-ok, opcionális, Pillow-val)
   -> publish.instagram_publish  (Content Publishing API a saját fiókra)
```

Minden lépés egy tiszta Python modul (`src/factcheck/`), CLI-n
(`cli.py`) keresztül vezérelve.

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

## Éles módba kapcsolás

Másold `.env.example` -> `.env`, és töltsd ki:

- **`ANTHROPIC_API_KEY`** - ha be van állítva, a claim-extraction és a
  verification valódi LLM-hívást használ a mock adatok helyett.
- **`IG_ACCESS_TOKEN` / `IG_BUSINESS_ACCOUNT_ID`** - a saját
  business/creator IG fiókodhoz tartozó token. Ezzel a `fetch` a
  Business Discovery API-t hívja (mások NYILVÁNOS business/creator
  fiókjainak posztjait lekérve, felhasználónév alapján - ez a
  hivatalos, ToS-kompatibilis módja a figyelésnek), a `publish` pedig a
  Content Publishing API-t.
- Figyelt fiókok: `config/accounts.yaml`.

## Fontos korlátok (tudatosan így lett tervezve)

1. **Nincs élő forráskeresés.** A `verification` modul jelenleg az LLM
   paraméteres tudására támaszkodik, nem hív web-keresést vagy
   KSH/Eurostat API-t. Ezért minden éles-módú eredményen
   `needs_human_research=True` van, és a CLI figyelmeztet rá. Ez a
   legfontosabb hiányzó darab a valódi éles használathoz - a
   következő lépés egy retrieval-lépés bekötése (websearch vagy
   közvetlen KSH/Eurostat/MNB API hívás) lenne, mielőtt bármi
   elmenne emberi kutató elé.
2. **Csak a szöveges caption-t elemzi.** Instagram posztok nagy része
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

- Retrieval-lépés a verification elé (web keresés vagy közvetlen
  KSH/Eurostat/MNB/Magyar Közlöny API-lekérdezések).
- Kép/videó OCR + multimodális elemzés a caption-only elemzés helyett.
- Egyszerű webes review-felület a CLI helyett (a `review/queue.py`
  fájlalapú tárolása miatt ez könnyen ráépíthető).
- Automatikus S3-feltöltés a renderelt slide-okhoz, hogy a `publish`
  éles módban is egy gombnyomásos legyen.
- Napi/óránkénti ütemezés a `cli.py run`-ra a saját fiókod
  Business Discovery hozzáférésével.
