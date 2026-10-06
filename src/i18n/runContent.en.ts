/**
 * English names and descriptions of the Run-mode content (relics, charms, boss curses, decks,
 * brightness levels, stage goals). Keys follow the `i18nKey` of each definition in `src/core/run`
 * (`relic.<id>.name` / `.desc`, `charm.<id>…`, `boss.<id>…`, `deck.<id>…`, `brightness.<n>…`).
 */
export const runContentEn = {
  relic: {
    spark_plug: { name: 'Spark Plug', desc: '+15 base on every clear.' },
    heavy_hand: { name: 'Heavy Hand', desc: 'Combos (4+ blocks): +10 base per block.' },
    ruby_ember: { name: 'Ruby Ember', desc: '+10 base for every red block cleared.' },
    jade_echo: { name: 'Jade Echo', desc: 'Clears with a green block: +3 mult.' },
    sapphire_tide: {
      name: 'Sapphire Tide',
      desc: 'Clearing blue blocks grants at least 1 s of stop time.',
    },
    steady_hand: { name: 'Steady Hand', desc: 'Plain clears (3 blocks, no chain): +2 mult.' },
    lucky_four: { name: 'Lucky Four', desc: 'Combos of exactly 4: +4 mult.' },
    slow_tide: { name: 'Slow Tide', desc: 'The stack rises 20% slower.' },
    chronoglass: { name: 'Chronoglass', desc: 'Stop time earned +50%.' },
    piggy_bank: { name: 'Piggy Bank', desc: '+2 Sparks after every won stage.' },
    overclock: { name: 'Overclock', desc: '+1 mult per speed level above 1.' },
    packed_stack: { name: 'Packed Stack', desc: '+1 base per block on the board.' },
    early_bird: { name: 'Early Bird', desc: '+3 mult during the first 20 seconds of a stage.' },
    constellation: { name: 'Constellation', desc: '+1 mult per relic owned.' },
    recycler: { name: 'Recycler', desc: 'Using a charm gives +2 Sparks.' },
    overachiever: { name: 'Overachiever', desc: 'Overachievement Sparks are doubled.' },
    clockwork: { name: 'Clockwork', desc: 'Remaining-time Sparks are doubled.' },
    bounty_hunter: { name: 'Bounty Hunter', desc: '+5 Sparks for every boss defeated.' },
    refractor: { name: 'Refractor', desc: 'Chain links: +2 mult.' },
    cascade_coil: { name: 'Cascade Coil', desc: 'Chain links: +25 base per chain level above 1.' },
    violet_fever: { name: 'Violet Fever', desc: '+1 mult for every purple block cleared.' },
    amber_bank: {
      name: 'Amber Bank',
      desc: '+1 Spark per 10 yellow blocks cleared in a stage (max 4).',
    },
    hot_streak: {
      name: 'Hot Streak',
      desc: 'Clears within 2.5 s of each other build a streak: +1 mult per step (max +8).',
    },
    snowball: {
      name: 'Snowball',
      desc: 'Gains +5 base for the rest of the run with every combo of 5+.',
    },
    last_stand: { name: 'Last Stand', desc: '×2 mult while any block sits in the top two rows.' },
    featherweight: {
      name: 'Featherweight',
      desc: 'Blocks hover a little longer before falling (easier chains).',
    },
    safety_net: {
      name: 'Safety Net',
      desc: 'The stack rises at half speed while it is within 3 rows of the top.',
    },
    compound_interest: { name: 'Compound Interest', desc: 'Interest cap +5.' },
    coupon_book: { name: 'Coupon Book', desc: 'The first reroll in every shop is free.' },
    talisman_pouch: { name: 'Talisman Pouch', desc: '+1 charm slot.' },
    expansion_rack: { name: 'Expansion Rack', desc: '+2 relic slots (it takes one itself).' },
    afterglow: { name: 'Afterglow', desc: 'For 10 s after using a charm: +4 mult.' },
    minimalist: { name: 'Minimalist', desc: '+3 mult per empty relic slot.' },
    domino: { name: 'Domino', desc: 'Every 3rd combo (4+) turns a random block into a bomb.' },
    clean_sweep: {
      name: 'Clean Sweep',
      desc: '×1.5 mult when at most 18 blocks remain after the clear.',
    },
    stasis_field: { name: 'Stasis Field', desc: '+4 mult while stop time is active.' },
    supernova: { name: 'Supernova', desc: 'Combos of 6+: ×2 mult.' },
    chain_reactor: {
      name: 'Chain Reactor',
      desc: 'Chain links: ×(1 + 0.25 per chain level above 1) mult.',
    },
    glass_cannon: { name: 'Glass Cannon', desc: '×2 mult, but the stack rises 25% faster.' },
    rainbow_bridge: {
      name: 'Rainbow Bridge',
      desc: 'Clears with 2 colors: ×1.5 mult; 3+ colors: ×3 mult.',
    },
    momentum: {
      name: 'Momentum',
      desc: 'Gains ×0.1 mult for the rest of the run with every chain that reaches ×3.',
    },
    joker_seed: {
      name: 'Joker Seed',
      desc: 'Chain links of ×3 or more turn a random block into a wild block.',
    },
    gold_leaf: {
      name: 'Gold Leaf',
      desc: '+1 mult per 5 Sparks held when the stage started (max +10).',
    },
    infinity_loop: { name: 'Infinity Loop', desc: 'Chain ×n gives n² mult instead of n.' },
    midas_engine: {
      name: 'Midas Engine',
      desc: '×1.25 mult, +×0.25 for every boss defeated this run.',
    },
    black_hole: { name: 'Black Hole', desc: 'Combos: ×(1 + 0.5 per block above 3) mult.' },
    zenith: { name: 'Zenith', desc: '+2 mult per level of the longest chain made this run.' },
  },
  charm: {
    purge: { name: 'Purge', desc: 'Clear a column of your choice.' },
    undertow: { name: 'Undertow', desc: 'Remove the bottom row; everything above drops.' },
    cryo: { name: 'Cryo', desc: 'Freeze the rising stack for 5 seconds.' },
    monotone: { name: 'Monotone', desc: 'Recolor a row of your choice to its most common color.' },
    kaleido: { name: 'Kaleido', desc: 'Shuffle the colors of the top three rows of the stack.' },
    joker: { name: 'Joker', desc: 'Two random blocks become wild (they match any color).' },
    fuse: {
      name: 'Fuse',
      desc: 'Two random blocks become bombs (a matched bomb clears its 3×3 area).',
    },
    detonate: { name: 'Detonate', desc: 'Blast the 3×3 area around a block of your choice.' },
    hourglass: { name: 'Hourglass', desc: '+8 seconds of stop time.' },
    overcharge: { name: 'Overcharge', desc: '+3 mult on every clear for 15 seconds.' },
    golden_ticket: { name: 'Golden Ticket', desc: 'Gain 6 Sparks. Works in the shop too.' },
    vanish: {
      name: 'Vanish',
      desc: 'Remove every block of the most common color in the top three rows.',
    },
    skeleton_key: {
      name: 'Skeleton Key',
      desc: 'Unlock frozen columns and swap locks for the rest of the stage.',
    },
    lantern: { name: 'Lantern', desc: 'Reveal the hidden color.' },
    lifeline: { name: 'Lifeline', desc: 'Clear the top three rows and refill the top-out grace.' },
  },
  boss: {
    surge: { name: 'The Surge', desc: 'The stack rises 60% faster.' },
    veil: { name: 'The Veil', desc: 'One block color is hidden.' },
    lock: {
      name: 'The Lock',
      desc: 'One of the middle columns is frozen: its blocks cannot be swapped.',
    },
    spectrum: { name: 'The Spectrum', desc: 'One extra block color.' },
    drought: { name: 'The Drought', desc: 'Combos and chains earn no stop time.' },
    judge: { name: 'The Judge', desc: 'Clears score half unless they are part of a chain.' },
    stagger: { name: 'The Stagger', desc: 'Every chain link locks swapping for 1 second.' },
    shiver: { name: 'The Shiver', desc: 'Blocks hover only a third as long before falling.' },
  },
  deck: {
    neon: {
      name: 'Neon Deck',
      desc: 'The standard rules. Starts with 4 Sparks and an Hourglass charm.',
    },
    prism: { name: 'Prism Deck', desc: '6 block colors, but every clear scores ×2 mult.' },
    zen: {
      name: 'Zen Deck',
      desc: 'The stack rises 30% slower; stage rewards −1 Spark, interest cap −2.',
    },
    gambler: {
      name: 'Gambler Deck',
      desc: 'Shops offer one more relic and charm, relics cost +1. Starts with 6 Sparks.',
    },
    cascade: {
      name: 'Cascade Deck',
      desc: 'Chain ×n gives 2n−1 mult, but combos earn no combo bonus.',
    },
    collector: {
      name: 'Collector Deck',
      desc: '6 relic slots and a random common relic, but only 1 charm slot.',
    },
  },
  brightness: {
    '1': { name: 'Glow', desc: 'The standard run.' },
    '2': { name: 'Dim', desc: 'Goals +15% (score) and +10% (blocks).' },
    '3': { name: 'Flicker', desc: 'The first stage of each act pays no base Sparks.' },
    '4': { name: 'Pressure', desc: 'The stack rises 15% faster.' },
    '5': { name: 'Scarcity', desc: 'Everything in the shop costs +1.' },
    '6': { name: 'Escalation', desc: 'Score goals grow faster in acts 2 and 3.' },
    '7': { name: 'Haste', desc: 'Stop time −25%, interest cap −2.' },
    '8': { name: 'Eclipse', desc: 'Every boss carries two curses.' },
  },
  goal: {
    scoreInTime: 'Score {target} points',
    clearBlocks: 'Clear {target} blocks',
    survive: 'Survive {seconds} seconds',
    chainTarget: 'Make {target} chains of ×{length}+',
    short: {
      scoreInTime: 'Score',
      clearBlocks: 'Blocks',
      survive: 'Survive',
      chainTarget: 'Chains',
    },
  },
};
