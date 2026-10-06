import { analyzePuzzle, generatePuzzles, type GenParams, type GeneratedPuzzle } from './generator';
import { HANDCRAFTED } from './handcrafted';
import { goalLabel, type PuzzleDef } from './types';

/**
 * Pack recipes for the offline generator (`scripts/gen-puzzles.ts`). Each pack
 * is 30 puzzles: handcrafted ones first (pack 1), then the generated ones
 * sorted by difficulty. Every generated puzzle has `moves = par = shortest`.
 */

export const PACK_COUNT = 4;
export const PACK_SIZE = 30;

export interface PackGroup {
  count: number;
  params: GenParams;
  /** Candidate boards tried before giving up on this group. */
  attempts: number;
}

const CLEAR = 'clearAll' as const;
const chain = (length: number) => ({ type: 'chain' as const, length });
const combo = (size: number) => ({ type: 'combo' as const, size });

export const PACK_RECIPES: Readonly<Record<number, readonly PackGroup[]>> = {
  // Tutorial: 1–2 moves, small boards, 2–3 colors.
  1: [
    {
      count: 10,
      attempts: 3000,
      params: {
        moves: 1,
        goal: CLEAR,
        style: 'random',
        colors: 3,
        triples: [2, 3],
        width: [3, 5],
        maxHeight: 3,
      },
    },
    {
      count: 11,
      attempts: 3000,
      params: {
        moves: 2,
        goal: CLEAR,
        style: 'bricks',
        colors: 3,
        triples: [2, 4],
        width: [3, 5],
        maxHeight: 4,
        maxSolutions: 6,
      },
    },
    {
      count: 2,
      attempts: 3000,
      params: {
        moves: 2,
        goal: chain(2),
        style: 'random',
        colors: 3,
        triples: [3, 4],
        width: [3, 5],
        maxHeight: 4,
        maxSolutions: 4,
      },
    },
  ],
  // Chains: 2–3 moves.
  2: [
    {
      count: 10,
      attempts: 3000,
      params: {
        moves: 2,
        goal: CLEAR,
        style: 'bricks',
        colors: 3,
        triples: [3, 5],
        width: [4, 5],
        maxHeight: 5,
        maxSolutions: 4,
        minChain: 2,
      },
    },
    {
      count: 14,
      attempts: 3000,
      params: {
        moves: 3,
        goal: CLEAR,
        style: 'bricks',
        colors: 4,
        triples: [3, 5],
        width: [4, 6],
        maxHeight: 5,
        maxSolutions: 8,
      },
    },
    {
      count: 3,
      attempts: 3000,
      params: {
        moves: 2,
        goal: chain(2),
        style: 'random',
        colors: 4,
        triples: [4, 5],
        width: [4, 6],
        maxHeight: 5,
        maxSolutions: 3,
      },
    },
    {
      count: 3,
      attempts: 3000,
      params: {
        moves: 3,
        goal: chain(2),
        style: 'random',
        colors: 4,
        triples: [4, 5],
        width: [4, 6],
        maxHeight: 5,
        maxSolutions: 6,
      },
    },
  ],
  // Combos and chains: 3–4 moves, wider boards.
  3: [
    {
      count: 9,
      attempts: 2000,
      params: {
        moves: 3,
        goal: CLEAR,
        style: 'bricks',
        colors: 4,
        triples: [5, 6],
        width: [5, 6],
        maxHeight: 5,
        maxSolutions: 6,
        minChain: 2,
      },
    },
    {
      count: 13,
      attempts: 2000,
      params: {
        moves: 4,
        goal: CLEAR,
        style: 'bricks',
        colors: 4,
        triples: [5, 7],
        width: [5, 6],
        maxHeight: 6,
        maxSolutions: 12,
      },
    },
    {
      count: 4,
      attempts: 2000,
      params: {
        moves: 3,
        goal: chain(3),
        style: 'random',
        colors: 4,
        triples: [5, 6],
        width: [5, 6],
        maxHeight: 6,
        maxSolutions: 6,
      },
    },
    {
      count: 4,
      attempts: 2000,
      params: {
        moves: 3,
        goal: combo(5),
        style: 'random',
        colors: 4,
        triples: [5, 6],
        width: [5, 6],
        maxHeight: 6,
        maxSolutions: 6,
      },
    },
  ],
  // Tricky: 4–5 moves.
  4: [
    {
      count: 10,
      attempts: 1500,
      params: {
        moves: 4,
        goal: CLEAR,
        style: 'bricks',
        colors: 5,
        triples: [6, 8],
        width: [6, 6],
        maxHeight: 6,
        maxSolutions: 6,
        minChain: 2,
      },
    },
    {
      count: 14,
      attempts: 1500,
      params: {
        moves: 5,
        goal: CLEAR,
        style: 'bricks',
        colors: 4,
        triples: [6, 8],
        width: [5, 6],
        maxHeight: 6,
        maxSolutions: 10,
      },
    },
    {
      count: 3,
      attempts: 1500,
      params: {
        moves: 4,
        goal: chain(3),
        style: 'random',
        colors: 4,
        triples: [6, 7],
        width: [6, 6],
        maxHeight: 6,
        maxSolutions: 4,
      },
    },
    {
      count: 3,
      attempts: 1500,
      params: {
        moves: 4,
        goal: combo(6),
        style: 'random',
        colors: 4,
        triples: [6, 7],
        width: [6, 6],
        maxHeight: 6,
        maxSolutions: 4,
      },
    },
  ],
};

export interface BuildLog {
  (message: string): void;
}

function toDef(pack: number, index: number, p: GeneratedPuzzle, hint?: string): PuzzleDef {
  const def: PuzzleDef = {
    id: `p${pack}-${String(index + 1).padStart(2, '0')}`,
    pack,
    index,
    board: p.board,
    moves: p.par,
    goal: p.goal,
    par: p.par,
    solution: p.solution,
    difficulty: p.difficulty,
  };
  if (hint) def.hint = hint;
  return def;
}

/** Handcrafted puzzles, verified and rated by the solver. */
export function handcraftedPuzzles(): GeneratedPuzzle[] {
  return HANDCRAFTED.map((h) => {
    const a = analyzePuzzle(h.board, h.goal, h.par);
    if (a.par !== h.par || !a.solution) {
      throw new Error(`handcrafted puzzle has par ${a.par}, expected ${h.par}:\n${h.board}`);
    }
    return {
      board: h.board,
      goal: h.goal,
      par: h.par,
      solution: a.solution,
      solutions: a.solutions,
      chain: a.chain,
      blocks: h.board.replace(/[^A-Z]/gi, '').length,
      difficulty: a.difficulty,
    };
  });
}

/** Generate one pack (deterministic; `exclude` = boards used elsewhere). */
export function buildPack(
  pack: number,
  exclude: ReadonlySet<string> = new Set(),
  log: BuildLog = () => {},
): PuzzleDef[] {
  const recipe = PACK_RECIPES[pack];
  if (!recipe) throw new Error(`no recipe for pack ${pack}`);
  const used = new Set(exclude);
  const fixed = pack === 1 ? handcraftedPuzzles() : [];
  for (const p of fixed) used.add(p.board);
  const generated: GeneratedPuzzle[] = [];
  recipe.forEach((group, g) => {
    const found = generatePuzzles(
      `swaplight-pack${pack}-${g}`,
      group.params,
      group.count,
      group.attempts,
      used,
    );
    for (const p of found) used.add(p.board);
    log(
      `pack ${pack} group ${g} (${goalLabel(group.params.goal)} in ${group.params.moves}): ${found.length}/${group.count}`,
    );
    generated.push(...found);
  });
  generated.sort(
    (a, b) => a.difficulty - b.difficulty || a.par - b.par || (a.board < b.board ? -1 : 1),
  );
  const hints = pack === 1 ? HANDCRAFTED.map((h) => h.hint) : [];
  const all = [...fixed, ...generated].slice(0, PACK_SIZE);
  return all.map((p, i) => toDef(pack, i, p, hints[i]));
}

function quote(s: string): string {
  return `'${s}'`;
}

/** TypeScript source of a pack data file (`packs/packN.ts`). */
export function packSource(pack: number, defs: readonly PuzzleDef[]): string {
  const lines: string[] = [
    '// Generated by scripts/gen-puzzles.ts – do not edit by hand (regenerate instead).',
    "import { rows, type PuzzleDef } from '../types';",
    '',
    `export const PACK_${pack}: readonly PuzzleDef[] = [`,
  ];
  for (const d of defs) {
    const goal =
      d.goal === 'clearAll'
        ? quote('clearAll')
        : d.goal.type === 'chain'
          ? `{ type: 'chain', length: ${d.goal.length} }`
          : `{ type: 'combo', size: ${d.goal.size} }`;
    const moves = (d.solution ?? []).map((m) => `{ row: ${m.row}, col: ${m.col} }`);
    // Prettier style: an array of several objects goes one per line.
    const solution =
      moves.length <= 1
        ? `[${moves.join('')}]`
        : `[\n${moves.map((m) => `      ${m},\n`).join('')}    ]`;
    lines.push('  {');
    lines.push(`    id: ${quote(d.id)},`);
    lines.push(`    pack: ${d.pack},`);
    lines.push(`    index: ${d.index},`);
    lines.push(`    board: rows(${d.board.split('\n').map(quote).join(', ')}),`);
    lines.push(`    moves: ${d.moves},`);
    lines.push(`    goal: ${goal},`);
    if (d.par !== undefined) lines.push(`    par: ${d.par},`);
    if (d.hint) lines.push(`    hint: ${quote(d.hint)},`);
    lines.push(`    solution: ${solution},`);
    if (d.difficulty !== undefined) lines.push(`    difficulty: ${d.difficulty},`);
    lines.push('  },');
  }
  lines.push('];', '');
  return lines.join('\n');
}
