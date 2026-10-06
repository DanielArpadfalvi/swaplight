import { emptyCells, newBlock } from './board';
import type { Block, BlockState, SimState } from './types';

/**
 * ASCII board format (tests, puzzles, debugging).
 *
 * One line per row, top to bottom, exactly `cols` characters:
 *   R G B Y P C  → colors 0..5,  `.` → empty.
 * Lowercase letters create the block with its chain flag set.
 * Fewer lines than `rows` are bottom-aligned (missing rows on top are empty).
 * An optional `--` line followed by one more line sets the preview row.
 * Blank lines and surrounding whitespace are ignored.
 */
export const COLOR_CHARS = 'RGBYPC';

export interface ParsedCell {
  color: number;
  chain: boolean;
}

export interface ParsedBoard {
  rows: (ParsedCell | null)[][];
  preview: ParsedCell[] | null;
}

function parseChar(ch: string): ParsedCell | null {
  if (ch === '.') return null;
  const color = COLOR_CHARS.indexOf(ch.toUpperCase());
  if (color < 0) throw new Error(`ascii: unknown cell character '${ch}'`);
  return { color, chain: ch !== ch.toUpperCase() };
}

export function parseAscii(text: string, cols: number): ParsedBoard {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const sep = lines.indexOf('--');
  const boardLines = sep >= 0 ? lines.slice(0, sep) : lines;
  const previewLines = sep >= 0 ? lines.slice(sep + 1) : [];
  if (previewLines.length > 1) throw new Error('ascii: at most one preview line');
  const parseLine = (line: string) => {
    if (line.length !== cols) throw new Error(`ascii: line '${line}' must have ${cols} cells`);
    return [...line].map(parseChar);
  };
  const rows = boardLines.map(parseLine);
  let preview: ParsedCell[] | null = null;
  if (previewLines[0] !== undefined) {
    const cells = parseLine(previewLines[0]);
    if (cells.some((c) => c === null)) throw new Error('ascii: preview row must be full');
    preview = cells as ParsedCell[];
  }
  return { rows, preview };
}

/**
 * Replace the board (and optionally the preview row) with an ASCII layout.
 * All blocks start idle; floating blocks will hover and fall on the next step.
 * Clears match groups, chain and stop time. Colors must be < config.colors.
 */
export function loadAscii(sim: SimState, text: string): void {
  const { rows, cols, colors } = sim.config;
  const parsed = parseAscii(text, cols);
  if (parsed.rows.length > rows) throw new Error(`ascii: more than ${rows} rows`);
  const make = (cell: ParsedCell): Block => {
    if (cell.color >= colors) throw new Error(`ascii: color ${cell.color} >= ${colors}`);
    const b = newBlock(sim, cell.color);
    b.chain = cell.chain;
    return b;
  };
  sim.cells = emptyCells(rows, cols);
  const offset = rows - parsed.rows.length;
  parsed.rows.forEach((line, r) => {
    line.forEach((cell, c) => {
      if (cell) sim.cells[(offset + r) * cols + c] = make(cell);
    });
  });
  if (parsed.preview) sim.preview = parsed.preview.map(make);
  sim.groups = [];
  sim.garbage = [];
  sim.chain = 1;
  sim.stopTicks = 0;
  sim.matchScanPending = true;
}

const STATE_MARKS: Record<BlockState, string> = {
  idle: '',
  swapping: 's',
  hovering: 'h',
  falling: 'f',
  landing: '',
  matched: 'm',
  popping: 'p',
  popped: 'x',
};

export interface AsciiOptions {
  /** Include rows from the topmost non-empty row only (default true). */
  trim?: boolean;
  /** Append `--` and the preview row. */
  preview?: boolean;
}

/**
 * Render the board in the same format `loadAscii` reads (block states are not encoded).
 * Garbage cells print as `#` (not readable back – use `placeGarbage`).
 */
export function boardToAscii(sim: SimState, options: AsciiOptions = {}): string {
  const { trim = true, preview = false } = options;
  const { rows, cols } = sim.config;
  const ch = (b: Block | null | undefined) => {
    if (!b) return '.';
    if (b.slab !== 0) return '#';
    const letter = COLOR_CHARS[b.color] ?? '?';
    return b.chain ? letter.toLowerCase() : letter;
  };
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) line += ch(sim.cells[r * cols + c]);
    lines.push(line);
  }
  while (trim && lines.length > 0 && /^\.+$/.test(lines[0] as string)) lines.shift();
  if (preview) lines.push('--', sim.preview.map(ch).join(''));
  return lines.join('\n');
}

/** Debug view: one token per cell, color letter + state mark (e.g. `Rh` = red hovering). */
export function boardStatesToAscii(sim: SimState): string {
  const { rows, cols } = sim.config;
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    const tokens: string[] = [];
    for (let c = 0; c < cols; c++) {
      const b = sim.cells[r * cols + c];
      const letter = b && b.slab !== 0 ? '#' : (COLOR_CHARS[b?.color ?? 0] ?? '?');
      tokens.push(b ? `${letter}${STATE_MARKS[b.state]}`.padEnd(2) : '. ');
    }
    lines.push(tokens.join(' '));
  }
  return lines.join('\n');
}
