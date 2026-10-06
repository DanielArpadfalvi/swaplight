# Apple App Store kiadás – teendőlista (Dániel)

A technikai részt (iOS build macOS-es GitHub Actions runneren, aláírási pipeline, store-anyagok, szövegek) előkészítem. Ez a lista azt tartalmazza, amit neked kell elvégezned. Saját Mac **nem kell**. A részletes, kattintásról kattintásra szóló útmutató az M9-ben készül (`docs/RELEASE.md`).

## 1. Apple Developer Program – **érdemes most elindítani**
- [ ] Apple ID kétlépcsős azonosítással (2FA).
- [ ] Belépés: https://developer.apple.com/programs/enroll/ – **99 USD/év**.
- [ ] Fióktípus:
  - **Magánszemély**: gyorsabb. A store-ban a saját neved jelenik meg eladóként.
  - **Szervezet**: D-U-N-S szám kell (ingyenes, de napoktól hetekig tarthat). A cégnév jelenik meg.
- [ ] Azonosítás és jóváhagyás: általában 1–2 nap, néha több.

## 2. Szerződések, adó, bank (App Store Connect → Business)
- [ ] **Paid Applications Agreement** elfogadása. Enélkül nem lehet vásárlást (IAP) árulni.
- [ ] Bankszámla megadása.
- [ ] Adóűrlapok: nem amerikai magánszemélynek/cégnek **W-8BEN** vagy **W-8BEN-E**.
- [ ] Adózás egyeztetése a könyvelővel.

## 3. EU Digital Services Act (DSA) – kereskedői státusz
- [ ] Az EU-s terjesztéshez nyilatkozni kell arról, hogy kereskedő (trader) vagy-e.
- [ ] Ha igen (pénzt keresel az appal, ez a jellemző eset), a címed, telefonszámod és e-mail-címed **nyilvánosan megjelenik** az EU-s App Store-oldalon. Szervezeti fióknál a céges adatok jelennek meg. Ezt érdemes figyelembe venni a fióktípus választásánál.

## 4. App azonosítók és app rekord
- [ ] Bundle ID regisztrálása: `com.arpadfalvi.swaplight` (Certificates, Identifiers & Profiles). Ebben segítek.
- [ ] Új app létrehozása az App Store Connectben (név, elsődleges nyelv, bundle ID, SKU).

## 5. Aláírás és CI-feltöltés
- [ ] **App Store Connect API kulcs** létrehozása (Users and Access → Integrations, **„Admin”** szerepkör – a felhőben kezelt terjesztési tanúsítványhoz ez kell). A `.p8` fájlt, a Key ID-t és az Issuer ID-t GitHub secretként kell felvenni (lépések: `docs/RELEASE.md`).
- Ebből a CI (`xcodebuild` automatikus aláírás) létrehozza és kezeli a tanúsítványt és a provisioning profile-t, és feltölti a buildet TestFlightra.
- Az export-megfelelőséget a build kezeli: csak szabványos titkosítást használunk, ezért `ITSAppUsesNonExemptEncryption = NO`.
- Az Apple által aktuálisan megkövetelt Xcode/SDK verziót a CI runner biztosítja.

## 6. App adatlap
> Elkészült anyagok: szövegek `store/listing/`, screenshotok `store/screenshots/`, kérdőív-válaszok `docs/store-privacy-answers.md`, adatvédelmi/támogatási oldal `docs/site/` – lásd `docs/RELEASE.md` 6. fejezet.
- [ ] Adatvédelmi nyilatkozat URL (elkészítem, GitHub Pages-en hosztolható).
- [ ] **App Privacy** kérdőív: „Data Not Collected”, mert a játék offline. A válaszokat előkészítem.
- [ ] Korhatár-kérdőív (Age Rating): a válaszokat előkészítem, várhatóan a legalacsonyabb besorolást kapja.
- [ ] Kategória: Games → Puzzle. Ár: ingyenes. Támogatási (Support) URL.

## 7. Store-anyagok (elkészítem)
- Ikon 1024×1024.
- iPhone screenshotok: a legnagyobb, 6,9"-os méret kötelező (1320×2868). Ha támogatjuk az iPadet, 13"-os iPad screenshotok is kellenek.
- Leírás, alcím, kulcsszavak, „Újdonságok” szöveg EN + HU.

## 8. Egyszeri vásárlás (IAP)
- [ ] Non-consumable termék létrehozása: „Teljes verzió”, kb. 4,99 USD. Kell hozzá egy review-screenshot a vásárlási képernyőről, ezt elkészítem.
- [ ] Az első IAP-t **az app első verziójával együtt** kell beküldeni review-ra.
- [ ] RevenueCat összekötése az App Store-ral: az In-App Purchase kulcs (.p8) feltöltése a RevenueCatbe.
- [ ] RevenueCat termék + `full_version` entitlement + offering, és a `VITE_RC_API_KEY_IOS` GitHub secret – lépésenként: `RELEASE.md` 5. fejezet.
- A játékban lesz „Vásárlások visszaállítása” gomb, ezt az Apple megköveteli.

## 9. Tesztelés és kiadás
- [ ] **TestFlight belső teszt**: legfeljebb 100 tesztelő az App Store Connect csapatból, review nélkül.
- [ ] Opcionális **külső teszt**: legfeljebb 10 000 tesztelő nyilvános linkkel. Az első buildhez rövid béta-review kell.
- A Google Play-jel szemben itt **nincs kötelező 14 napos zárt teszt**.
- [ ] Beküldés App Review-ra. Ez általában 24–48 óra. Elutasítás esetén javítjuk, és újra beküldjük.
- [ ] Kiadás: azonnal, vagy kézzel a jóváhagyás után.
