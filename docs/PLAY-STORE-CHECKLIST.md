# Google Play kiadás – teendőlista (Dániel)

A technikai részt (build, aláírási pipeline, store-anyagok, szövegek) a fejlesztés során előkészítem; ez a lista azt tartalmazza, amit neked kell elvégezned. A részletes, kattintásról kattintásra szóló útmutató az M9-ben készül (`docs/RELEASE.md`).

## 1. Fejlesztői fiók – **érdemes most elindítani**
- [ ] Regisztráció: https://play.google.com/console – egyszeri 25 USD.
- [ ] Fióktípus kiválasztása:
  - **Magánszemély** – gyorsabb, de kötelező zárt teszt (lásd 3. pont).
  - **Szervezet** – D-U-N-S szám kell (ingyenes, de napok–hetek).
- [ ] Személyazonosság-ellenőrzés (igazolvány, cím, telefon) – akár napokig tarthat.

## 2. Fizetési profil (merchant account)
- [ ] Fizetési profil létrehozása a Console-ban (bankszámla, adóadatok) – az egyszeri „Teljes verzió” vásárláshoz kell.
- [ ] Adózás egyeztetése a könyvelővel (magánszemély vs. cég).

## 3. Kötelező zárt teszt – **a leglassabb lépés**
- [ ] A 2023 novembere után nyitott magánszemélyes fiókoknál éles kiadás előtt **≥12 tesztelő, 14 egymást követő napig** zárt tesztben.
- [ ] 12+ tesztelő összegyűjtése (Gmail-címek).
- Egy korai, stabil buildet jóval az 1.0 előtt feltöltünk, hogy a 14 nap minél hamarabb elindulhasson.

## 4. App adatlap a Console-ban
- [ ] Adatvédelmi nyilatkozat URL (elkészítem, GitHub Pages-en hosztolható).
- [ ] Data safety űrlap (offline játék, nincs adatgyűjtés – a válaszokat előkészítem).
- [ ] Korhatár-besorolás (IARC kérdőív – a válaszokat előkészítem).
- [ ] Célközönség, reklám-nyilatkozat (nincs reklám), kategória: Puzzle.

## 5. Store-anyagok (elkészítem)
- Ikon 512×512, kiemelt kép 1024×500, ≥2 telefonos + tabletes screenshot.
- Rövid (80 karakter) és hosszú leírás EN + HU.

## 6. Build és aláírás
- A Play AAB formátumot vár; a GitHub Actions készíti.
- **Play App Signing**: a végleges kulcsot a Google őrzi, te csak az *upload key*-t kezeled.
- [ ] Upload keystore létrehozása és felvétele GitHub secretként (lépések: `docs/RELEASE.md`, M9).
- A target API szint követelményét a build teljesíti.

## 7. Egyszeri vásárlás (IAP)
- [ ] Termék létrehozása a Console-ban: „Teljes verzió”, ~4,99 USD.
- [ ] RevenueCat fiók (ingyenes szint) + összekötés a Play-jel service account kulccsal.

## 8. Kiadás
- [ ] Belső teszt → zárt teszt (12 fő / 14 nap) → hozzáférés kérése az éles kiadáshoz → éles kiadás.
- Az első Google-ellenőrzés általában néhány óra – néhány nap.
