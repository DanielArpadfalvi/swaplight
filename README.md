# Hatékonyságnövelő ötletek – PM részleg (80 fős IT cég)

Kiindulópont: már létezik egy saját fejlesztésű alkalmazás, ami a projektek előrehaladását követi.
Az alábbi ötletek erre építenek, és prioritás szerint vannak csoportosítva
(**hatás / ráfordítás** arány alapján).

---

## 1. Gyors nyerések (1–4 hét, alacsony kockázat)

### 1.1 Automatikus státuszriport-generálás
- **Probléma:** a PM-ek heti több órát töltenek státuszriportok kézi összeállításával.
- **Megoldás:** a projektkövető adataiból (+ Jira/GitLab/Azure DevOps commitok, lezárt ticketek) heti automatikus
  riport, LLM-mel megírt rövid összefoglalóval ("mi készült el, mi csúszik, mi a kockázat").
- **Kimenet:** e-mail / Teams / Slack üzenet a stakeholdereknek, PDF az ügyfélnek.
- **Mérőszám:** PM-enként megtakarított óra/hét (reálisan 2–4 óra).

### 1.2 Korai figyelmeztető rendszer (early warning)
- Szabályalapú riasztások a meglévő adatokból:
  - burn rate > tervezett (költség vagy óra),
  - mérföldkő X napon belül, de a hozzá tartozó feladatok < Y%-a kész,
  - ticket N napja nem mozdult,
  - egy ember > 100%-ra van allokálva.
- Egyszerű cron job + értesítés; később ML-alapú csúszás-előrejelzéssé fejleszthető (lásd 3.1).

### 1.3 Időnaplózás egyszerűsítése
- Emlékeztető bot (Teams/Slack) a nap végén, egykattintásos óraelszámolással.
- Javaslat előtöltése a naptár-események és a napi commitok/ticketmozgások alapján.
- Pontosabb adat → megbízhatóbb projektkontrolling és számlázás.

### 1.4 Meeting-összefoglalók és action itemek
- Teams/Zoom átirat → automatikus jegyzőkönyv, döntések és feladatok kinyerése,
  a feladatok **automatikus létrehozása** a ticketkezelőben felelőssel és határidővel.

---

## 2. Közepes projektek (1–3 hónap)

### 2.1 Erőforrás- és kapacitástervező
- Ki min dolgozik, mennyi szabad kapacitása van a következő 4–12 hétben, milyen skillekkel.
- Szabadságok (HR-rendszerből) automatikus beolvasása.
- "Mi lenne, ha" szimuláció: új projekt bevállalásakor látszik, hol lesz szűk keresztmetszet.
- 80 fős cégnél ez tipikusan a legnagyobb rejtett veszteség (túlterhelt kulcsemberek, alulhasznált kapacitás).

### 2.2 Portfólió-dashboard a vezetésnek
- Egy képernyőn: összes projekt RAG-státusza, marzs, várható bevétel, kockázatok, kapacitás-kihasználtság.
- Trendek hónapról hónapra; drill-down projektre.
- Adatforrás: a meglévő projektkövető + pénzügyi/számlázó rendszer.

### 2.3 Projektindítás automatizálása (project kickoff pipeline)
- Egy űrlap kitöltése után automatikusan létrejön: repo, ticketkezelő projekt, Teams csatorna,
  dokumentációs tér (Confluence/SharePoint), jogosultságok, alap sablonok (kockázati napló, RACI, kommunikációs terv).
- Projektzáráskor fordítva: archiválás, jogosultság-visszavonás, lessons learned űrlap.

### 2.4 Változáskérés- és scope-kezelés
- Change request workflow jóváhagyással, az óra- és költséghatás automatikus becslésével.
- Csökkenti a "scope creep"-et és a nem számlázott többletmunkát.

### 2.5 Ügyfélportál
- Az ügyfél saját felületen látja a státuszt, mérföldköveket, nyitott kérdéseket, jóváhagyandó tételeket.
- Kevesebb "hol tart a projekt?" e-mail és hívás, gyorsabb ügyféljóváhagyások.

---

## 3. Stratégiai / AI-alapú fejlesztések (3–6+ hónap)

### 3.1 Csúszás- és kockázat-előrejelzés
- A lezárt projektek historikus adataiból modell, ami előre jelzi a várható csúszást és túlköltést.
- Már 20–30 lezárt projekt adata is ad használható jelzést, ha az adatok konzisztensek.

### 3.2 Becslés-támogatás
- Új ajánlatnál/projektnél a hasonló korábbi projektek tényleges ráfordításai alapján javasolt becslés
  (és a becslés–tény eltérés statisztikája csapatonként/technológiánként).
- Pontosabb ajánlatok → jobb marzs.

### 3.3 Belső tudásbázis-asszisztens (RAG)
- Kérdezhető AI-asszisztens a cég dokumentációin, korábbi projektjein, lessons learned anyagain.
  ("Csináltunk már SAP-integrációt? Ki dolgozott rajta? Mik voltak a buktatók?")
- Gyorsabb onboarding, kevesebb ismételt hiba.

### 3.4 Fejlesztési folyamatmetrikák (DORA / flow metrics)
- Lead time, deployment gyakoriság, átlagos ticket-ciklusidő, review-várakozási idő automatikus mérése.
- Megmutatja, hol akad el a munka (pl. code review, tesztelés, ügyféljóváhagyás).

---

## 4. Javasolt sorrend

| Lépés | Megoldás | Miért először |
|------|----------|---------------|
| 1 | Automatikus státuszriport (1.1) | Azonnal érezhető időmegtakarítás, a meglévő adatokra épül |
| 2 | Early warning riasztások (1.2) | Olcsó, és megelőzi a legdrágább problémákat |
| 3 | Időnaplózás egyszerűsítése (1.3) | Minden későbbi elemzés adatminőségét javítja |
| 4 | Kapacitástervező (2.1) | Legnagyobb üzleti hatás egy 80 fős cégnél |
| 5 | Portfólió-dashboard (2.2) | Vezetői döntéstámogatás |
| 6 | AI-előrejelzés, becslés (3.1–3.2) | Akkor érdemes, ha már van tiszta historikus adat |

## 5. Általános javaslatok
- **Először mérj:** a bevezetés előtt rögzítsd a kiinduló értékeket (riportírásra fordított idő, csúszások aránya,
  kapacitás-kihasználtság), hogy a hatás kimutatható legyen.
- **Integráció, ne új rendszer:** a meglévő eszközökhöz (Jira, Teams, számlázó) kapcsolódjon, ne kelljen új felületet tanulni.
- **Egy pilot csapat:** 1–2 projekten próbáld ki, majd skálázd.
- **Adatvédelem:** LLM-használatnál ügyféladatokra vonatkozó szabályok (GDPR, szerződéses titoktartás) tisztázása,
  szükség esetén EU-s / on-premise modell.
