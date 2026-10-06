import type { Dictionary } from './dictionary';

type ModeContent = Pick<Dictionary, 'puzzle' | 'tutorial'>;

/** A Fejtörő mód és az interaktív oktatás magyar szövegei (lásd `modeContent.en.ts`). */
export const modeContentHu: ModeContent = {
  puzzle: {
    title: 'Fejtörők',
    packs: 'Fejtörő-csomagok',
    packLabel: '{n}.\u00a0csomag',
    packName: {
      p1: 'Első fény',
      p2: 'Utófény',
      p3: 'Neonlabirintus',
      p4: 'Szupernóva',
    },
    packDesc: {
      p1: 'Az alapok, egy-egy ügyes cserével.',
      p2: 'Két- és háromlépéses előkészítések.',
      p3: 'Hosszabb láncok, szűkebb keret.',
      p4: 'Az igazi csere-mestereknek.',
    },
    solvedCount: '{solved}/{total} megoldva',
    packLocked: 'Ez a csomag a teljes verzióval érhető el.',
    levelLocked: 'Oldd meg az előző fejtörőt a feloldásához.',
    levelTitle: '{pack}.\u00a0csomag · {level}',
    movesLeft: 'Hátralévő lépés',
    goal: 'Cél',
    goalClearAll: 'Tüntess el minden blokkot',
    goalChain: 'Csinálj ×{n} láncot',
    goalCombo: 'Tüntess el egyszerre {n} blokkot',
    par: 'Ideális: {n}',
    undo: 'Visszavonás',
    restart: 'Újra',
    hintButton: 'Tipp',
    hintTitle: 'Tipp',
    hintConfirmTitle: 'Mutassunk egy lépést?',
    hintConfirmBody:
      'Felvillan a megoldás következő lépése. Tippel legfeljebb 2 csillagot kaphatsz.',
    hintConfirmRestart: 'Az eddigi cseréid törlődnek.',
    hintShow: 'Mutasd',
    hintCancel: 'Még ne',
    gotIt: 'Értem',
    hintUsed: 'Tipp felhasználva',
    waitSettle: 'Várd meg, míg a blokkok leérnek',
    solved: 'Megoldva!',
    solvedIn: { other: '{count} cserével megoldva' },
    starSolved: 'Megoldva',
    starPar: 'Ideális lépésszám',
    starNoHint: 'Tipp nélkül',
    newBest: 'Új rekord!',
    nextPuzzle: 'Következő',
    retry: 'Újra',
    allPuzzles: 'Összes fejtörő',
    packComplete: 'Csomag teljesítve!',
    failTitle: 'Elfogytak a lépések',
    failBody: 'Nem sikerült elérni a célt. Vonj vissza egy lépést, vagy kezdd újra.',
    hint: {
      swap: 'Húzz oldalra egy blokkot, hogy helyet cseréljen a szomszédjával. Három egy sorban eltűnik!',
      slide: 'A blokkot üres helyre is áthúzhatod.',
      vertical: 'A függőleges sorok is számítanak. Egy blokk egyszerre két sort is kiegészíthet.',
      combo: 'A közös blokkon osztozó sorok együtt tűnnek el, egy nagy kombóként.',
      chain: 'Az eltűnő blokkok fölött lévők lezuhannak. Ha új sort alkotnak, az lánc!',
      prepare: 'Nem kell minden cserének eltüntetnie valamit. Előbb készítsd elő, aztán süsd el.',
      chainSetup:
        'Előbb rendezd el a lezuhanó blokkokat, aztán jöhet az eltüntetés, ami leejti őket.',
    },
  },
  tutorial: {
    title: 'Oktatás',
    stepOf: '{n}.\u00a0lépés / {total}',
    skip: 'Kihagyom',
    next: 'Tovább',
    finish: 'Játsszunk!',
    nice: 'Szép!',
    retry: 'Majdnem! Próbáljuk újra.',
    complete: 'Kész az oktatás. Jó játékot!',
    bannerTitle: 'Új vagy? Próbáld ki az oktatást',
    bannerBody: 'Cserék, kombók és láncok két perc alatt.',
    steps: {
      swap: {
        title: 'Csere',
        body: 'Húzd oldalra a világító blokkot, hogy helyet cseréljen a szomszédjával.',
      },
      match: {
        title: 'Hármas',
        body: 'Rakj egy sorba három azonos színű blokkot, és eltűnnek.',
      },
      drop: {
        title: 'Ejtsd bele',
        body: 'Húzz le egy blokkot a pereméről: lezuhan, és kiegészíthet egy függőleges sort.',
      },
      combo: {
        title: 'Kombó',
        body: 'Tüntess el egy cserével négy vagy több blokkot: ez a kombó. A nagyobb eltüntetés több pontot ér.',
      },
      chain: {
        title: 'Lánc',
        body: 'Először húzd félre a kijelölt blokkot, hogy előkészítsd a láncot.',
        bodyTrigger: 'Most süsd el: a lezuhanó blokkok újra eltűnnek, ez egy ×2 lánc!',
      },
      raise: {
        title: 'Emelkedik a fal',
        body: 'Alulról folyamatosan új sorok jönnek. Tartsd nyomva az ▲ EMELÉS gombot a gyorsításhoz.',
        danger: 'Ha a blokkok elérik a tetejét, vége a játéknak!',
      },
      relics: {
        title: 'Jöhet egy Futam?',
        body: 'Futam módban szakaszcélokat teljesítesz, vásárolsz a boltban, és ereklyéket gyűjtesz, amelyek megsokszorozzák a pontjaidat. Minden futam más.',
      },
    },
  },
};
