import type { Dictionary } from './dictionary';

type RunContent = Pick<Dictionary, 'relic' | 'charm' | 'boss' | 'deck' | 'brightness' | 'goal'>;

/** A Futam mód tartalmának magyar nevei és leírásai (lásd `runContent.en.ts`). */
export const runContentHu: RunContent = {
  relic: {
    spark_plug: { name: 'Gyújtógyertya', desc: 'Minden eltüntetés +15 alappontot ad.' },
    heavy_hand: { name: 'Nehéz kéz', desc: 'Kombó (4+ blokk): blokkonként +10 alap.' },
    ruby_ember: { name: 'Rubinparázs', desc: 'Minden eltüntetett piros blokk +10 alap.' },
    jade_echo: { name: 'Jádevisszhang', desc: 'Zöld blokkot tartalmazó eltüntetés: +3 szorzó.' },
    sapphire_tide: {
      name: 'Zafírdagály',
      desc: 'Kék blokkok eltüntetése legalább 1 mp megállást ad.',
    },
    steady_hand: {
      name: 'Biztos kéz',
      desc: 'Sima eltüntetés (3 blokk, lánc nélkül): +2 szorzó.',
    },
    lucky_four: { name: 'Szerencsenégyes', desc: 'Pontosan 4 blokkos kombó: +4 szorzó.' },
    slow_tide: { name: 'Lassú dagály', desc: 'A fal 20%-kal lassabban emelkedik.' },
    chronoglass: { name: 'Időüveg', desc: '+50% megszerzett megállási idő.' },
    piggy_bank: { name: 'Malacpersely', desc: 'Minden megnyert szakasz után +2 szikra.' },
    overclock: { name: 'Túlhajtás', desc: 'Az 1 feletti sebességszintenként +1 szorzó.' },
    packed_stack: { name: 'Tömött torony', desc: 'A táblán lévő blokkonként +1 alap.' },
    early_bird: {
      name: 'Korán kelő',
      desc: 'A szakasz első 20 másodpercében +3 szorzó.',
    },
    constellation: { name: 'Csillagkép', desc: 'Birtokolt ereklyénként +1 szorzó.' },
    recycler: { name: 'Újrahasznosító', desc: 'Talizmán használatáért +2 szikra jár.' },
    overachiever: { name: 'Stréber', desc: 'Duplán jár a túlteljesítésért kapott szikra.' },
    clockwork: { name: 'Óramű', desc: 'Duplán jár a maradék időért kapott szikra.' },
    bounty_hunter: { name: 'Fejvadász', desc: 'Minden legyőzött főellenségért +5 szikra.' },
    refractor: { name: 'Fénytörő', desc: 'Láncszemek: +2 szorzó.' },
    cascade_coil: {
      name: 'Kaszkádtekercs',
      desc: 'Láncszemek: az 1 feletti láncszintenként +25 alap.',
    },
    violet_fever: { name: 'Lila láz', desc: 'Minden eltüntetett lila blokk +1 szorzó.' },
    amber_bank: {
      name: 'Borostyánbank',
      desc: 'Szakaszonként minden 10 eltüntetett sárga blokk után +1 szikra (legfeljebb 4).',
    },
    hot_streak: {
      name: 'Lángoló sorozat',
      desc: 'A 2,5 mp-en belül egymást követő eltüntetések sorozatot építenek: lépésenként +1 szorzó (legfeljebb +8).',
    },
    snowball: {
      name: 'Hógolyó',
      desc: 'Minden 5+ blokkos kombó után a futam végéig +5 alapot nyer.',
    },
    last_stand: {
      name: 'Utolsó bástya',
      desc: '×2 szorzó, amíg bármelyik blokk a felső két sorban van.',
    },
    featherweight: {
      name: 'Pehelysúly',
      desc: 'A blokkok kicsit tovább lebegnek zuhanás előtt (könnyebb láncok).',
    },
    safety_net: {
      name: 'Biztonsági háló',
      desc: 'Fele olyan gyorsan emelkedik a fal, ha 3 soron belül van a tetőhöz.',
    },
    compound_interest: { name: 'Kamatos kamat', desc: '+5 kamatplafon.' },
    coupon_book: { name: 'Kuponfüzet', desc: 'Minden boltban ingyenes az első újrasorsolás.' },
    talisman_pouch: { name: 'Talizmánerszény', desc: '+1 talizmánhely.' },
    expansion_rack: { name: 'Bővítőpolc', desc: '+2 ereklyehely (egyet maga foglal el).' },
    afterglow: { name: 'Utófény', desc: 'Talizmán használata után 10 mp-ig +4 szorzó.' },
    minimalist: { name: 'Minimalista', desc: 'Üres ereklyehelyenként +3 szorzó.' },
    domino: {
      name: 'Dominó',
      desc: 'Minden 3. kombó (4+ blokk) egy véletlen blokkot bombává alakít.',
    },
    clean_sweep: {
      name: 'Tiszta lap',
      desc: '×1,5 szorzó, ha az eltüntetés után legfeljebb 18 blokk marad.',
    },
    stasis_field: { name: 'Sztázismező', desc: '+4 szorzó, amíg tart a megállás.' },
    supernova: { name: 'Szupernóva', desc: '6+ blokkos kombó: ×2 szorzó.' },
    chain_reactor: {
      name: 'Láncreaktor',
      desc: 'Láncszemek: ×(1 + 0,25 az 1 feletti láncszintenként) szorzó.',
    },
    glass_cannon: {
      name: 'Üvegágyú',
      desc: '×2 szorzó, de a fal 25%-kal gyorsabban emelkedik.',
    },
    rainbow_bridge: {
      name: 'Szivárványhíd',
      desc: 'Kétszínű eltüntetés: ×1,5 szorzó; három vagy több szín: ×3 szorzó.',
    },
    momentum: {
      name: 'Lendület',
      desc: 'Minden ×3-at elérő lánc után a futam végéig további ×0,1 szorzót nyer.',
    },
    joker_seed: {
      name: 'Jokermag',
      desc: 'A ×3-as vagy nagyobb láncszemek egy véletlen blokkot jokerré alakítanak.',
    },
    gold_leaf: {
      name: 'Aranyfüst',
      desc: 'A szakasz kezdetén birtokolt minden 5 szikra után +1 szorzó (legfeljebb +10).',
    },
    infinity_loop: { name: 'Végtelen hurok', desc: 'A ×n lánc n helyett n² szorzót ad.' },
    midas_engine: {
      name: 'Midasz-motor',
      desc: '×1,25 szorzó, és a futamban legyőzött főellenségenként további ×0,25.',
    },
    black_hole: {
      name: 'Fekete lyuk',
      desc: 'Combók: ×(1 + 0,5 a 3 feletti blokkonként) szorzó.',
    },
    zenith: {
      name: 'Zenit',
      desc: 'A futam leghosszabb láncának minden szintje +2 szorzót ad.',
    },
  },
  charm: {
    purge: { name: 'Tisztítás', desc: 'Eltüntet egy általad választott oszlopot.' },
    undertow: {
      name: 'Mélyáram',
      desc: 'Eltávolítja az alsó sort; minden, ami fölötte van, lejjebb esik.',
    },
    cryo: { name: 'Fagyasztás', desc: '5 másodpercre megfagyasztja a fal emelkedését.' },
    monotone: {
      name: 'Egyszín',
      desc: 'Egy általad választott sort átfest a leggyakoribb színére.',
    },
    kaleido: { name: 'Kaleidoszkóp', desc: 'Összekeveri a felső három sor színeit.' },
    joker: {
      name: 'Joker',
      desc: 'Két véletlen blokk jokerré válik (bármelyik színnel párosul).',
    },
    fuse: {
      name: 'Gyújtózsinór',
      desc: 'Két véletlen blokk bombává válik (a párosított bomba a 3×3-as környezetét is eltünteti).',
    },
    detonate: {
      name: 'Robbantás',
      desc: 'Felrobbantja egy általad választott blokk 3×3-as környezetét.',
    },
    hourglass: { name: 'Homokóra', desc: '+8 másodperc megállás.' },
    overcharge: { name: 'Túltöltés', desc: '15 másodpercig minden eltüntetés +3 szorzót kap.' },
    golden_ticket: { name: 'Aranyjegy', desc: '+6 szikra. A boltban is használható.' },
    vanish: {
      name: 'Eltűnés',
      desc: 'Eltünteti a felső három sor leggyakoribb színének összes blokkját.',
    },
    skeleton_key: {
      name: 'Álkulcs',
      desc: 'A szakasz végéig feloldja a befagyott oszlopokat és a cserezárakat.',
    },
    lantern: { name: 'Lámpás', desc: 'Felfedi a rejtett színt.' },
    lifeline: {
      name: 'Mentőöv',
      desc: 'Eltünteti a felső három sort, és újratölti a türelmi időt.',
    },
  },
  boss: {
    surge: { name: 'A Hullám', desc: 'A fal 60%-kal gyorsabban emelkedik.' },
    veil: { name: 'A Fátyol', desc: 'Az egyik blokkszín rejtve marad.' },
    lock: {
      name: 'A Lakat',
      desc: 'Az egyik középső oszlop befagy: a blokkjai nem cserélhetők.',
    },
    spectrum: { name: 'A Spektrum', desc: 'Eggyel több blokkszín.' },
    drought: { name: 'Az Aszály', desc: 'A kombók és a láncok nem adnak megállási időt.' },
    judge: { name: 'A Bíró', desc: 'Az eltüntetés csak fél pontot ér, ha nem része láncnak.' },
    stagger: { name: 'A Tántorgás', desc: 'Minden láncszem 1 másodpercre zárolja a cserét.' },
    shiver: {
      name: 'A Borzongás',
      desc: 'A blokkok csak harmadannyi ideig lebegnek zuhanás előtt.',
    },
  },
  deck: {
    neon: {
      name: 'Neon pakli',
      desc: 'Az alapszabályok. 4 szikrával és egy Homokóra talizmánnal indul.',
    },
    prism: {
      name: 'Prizma pakli',
      desc: '6 blokkszín, de minden eltüntetés ×2 szorzót kap.',
    },
    zen: {
      name: 'Zen pakli',
      desc: '30%-kal lassabb emelkedés; szakaszjutalom −1 szikra, kamatplafon −2.',
    },
    gambler: {
      name: 'Szerencsejátékos pakli',
      desc: 'A boltban eggyel több ereklye és talizmán, de az ereklyék +1-be kerülnek. 6 szikrával indul.',
    },
    cascade: {
      name: 'Kaszkád pakli',
      desc: 'A ×n lánc 2n−1 szorzót ad, de a kombók nem kapnak kombóbónuszt.',
    },
    collector: {
      name: 'Gyűjtő pakli',
      desc: '6 ereklyehely és egy véletlen gyakori ereklye, de csak 1 talizmánhely.',
    },
  },
  brightness: {
    '1': { name: 'Izzás', desc: 'Az alap futam.' },
    '2': { name: 'Derengés', desc: 'A célok +15% (pont) és +10% (blokk).' },
    '3': { name: 'Pislákolás', desc: 'A felvonások első szakasza nem ad alap szikrát.' },
    '4': { name: 'Nyomás', desc: 'A fal 15%-kal gyorsabban emelkedik.' },
    '5': { name: 'Szűkösség', desc: 'A boltban minden +1-be kerül.' },
    '6': { name: 'Eszkaláció', desc: 'A pontcélok gyorsabban nőnek a 2. és 3. felvonásban.' },
    '7': { name: 'Sietség', desc: '−25% megállási idő, kamatplafon −2.' },
    '8': { name: 'Napfogyatkozás', desc: 'Minden főellenség két átkot hordoz.' },
  },
  goal: {
    scoreInTime: 'Szerezz {target} pontot',
    clearBlocks: 'Tüntess el {target} blokkot',
    survive: 'Élj túl {seconds} másodpercet',
    chainTarget: 'Csinálj {target} láncot (×{length}+)',
    short: {
      scoreInTime: 'Pont',
      clearBlocks: 'Blokk',
      survive: 'Túlélés',
      chainTarget: 'Lánc',
    },
  },
};
