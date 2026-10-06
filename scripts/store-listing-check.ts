/// <reference types="node" />
/**
 * Checks the store listing texts in `store/listing/<lang>/` against the store limits and a few
 * content rules (no trademarked game names, keyword format).
 *
 *   npm run store:check
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'store', 'listing');

interface FieldRule {
  file: string;
  /** Max length in characters (Unicode code points). */
  maxChars: number;
  /** Max length in UTF-8 bytes (App Store keywords). */
  maxBytes?: number;
}

const FIELDS: readonly FieldRule[] = [
  { file: 'name.txt', maxChars: 30 },
  { file: 'subtitle.txt', maxChars: 30 },
  { file: 'short_description.txt', maxChars: 80 },
  { file: 'full_description.txt', maxChars: 4000 },
  { file: 'keywords.txt', maxChars: 100, maxBytes: 100 },
  { file: 'promotional_text.txt', maxChars: 170 },
  // Google Play's limit (App Store allows 4000).
  { file: 'release_notes.txt', maxChars: 500 },
];

/** Other games' trademarks must not appear in the listing. */
const FORBIDDEN = [/tetris/i, /puzzle league/i, /panel de pon/i, /balatro/i, /tetris attack/i];

const read = (lang: string, file: string): string =>
  readFileSync(join(ROOT, lang, file), 'utf8').replace(/\n+$/, '');

const problems: string[] = [];
const langs = readdirSync(ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

for (const lang of langs) {
  const rows: string[] = [];
  for (const rule of FIELDS) {
    const path = join(ROOT, lang, rule.file);
    if (!existsSync(path)) {
      problems.push(`${lang}/${rule.file}: missing`);
      continue;
    }
    const text = read(lang, rule.file);
    const chars = [...text].length;
    const bytes = Buffer.byteLength(text, 'utf8');
    rows.push(`  ${rule.file.padEnd(24)} ${String(chars).padStart(5)} / ${rule.maxChars}`);
    if (chars === 0) problems.push(`${lang}/${rule.file}: empty`);
    if (chars > rule.maxChars) {
      problems.push(`${lang}/${rule.file}: ${chars} characters (max ${rule.maxChars})`);
    }
    if (rule.maxBytes !== undefined && bytes > rule.maxBytes) {
      problems.push(`${lang}/${rule.file}: ${bytes} bytes (max ${rule.maxBytes})`);
    }
    if (
      rule.file !== 'full_description.txt' &&
      rule.file !== 'release_notes.txt' &&
      text.includes('\n')
    ) {
      problems.push(`${lang}/${rule.file}: must be a single line`);
    }
    for (const re of FORBIDDEN) {
      if (re.test(text)) problems.push(`${lang}/${rule.file}: contains a trademark (${re.source})`);
    }
  }
  const keywords = read(lang, 'keywords.txt');
  if (/,\s|\s,/.test(keywords)) problems.push(`${lang}/keywords.txt: no spaces around commas`);
  const nameWords = new Set(
    read(lang, 'name.txt')
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u),
  );
  for (const kw of keywords.split(',')) {
    if (nameWords.has(kw.trim().toLowerCase())) {
      problems.push(`${lang}/keywords.txt: "${kw}" is already in the app name`);
    }
  }
  console.log(`${lang}:\n${rows.join('\n')}`);
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('\nStore listing OK.');
