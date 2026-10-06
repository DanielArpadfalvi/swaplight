import { describe, expect, it } from 'vitest';
import { cellAt } from '../../../src/core/board';
import { checkInvariants } from '../../../src/core/invariants';
import { simFromAscii } from './helpers';

const base = () => simFromAscii('R.....\nGB....');

describe('checkInvariants', () => {
  it('accepts a valid board', () => {
    expect(checkInvariants(base())).toEqual([]);
  });

  it('reports each kind of corruption', () => {
    const cases: [string, (s: ReturnType<typeof base>) => void][] = [
      ['cells length', (s) => s.cells.push(null)],
      ['preview length', (s) => s.preview.pop()],
      ['riseOffset', (s) => (s.riseOffset = 16)],
      ['riseAccum', (s) => (s.riseAccum = -1)],
      ['chain', (s) => (s.chain = 0)],
      ['duplicate block id', (s) => (cellAt(s, 11, 1)!.id = cellAt(s, 11, 0)!.id)],
      ['nextBlockId', (s) => (s.nextBlockId = 1)],
      ['bad color', (s) => (cellAt(s, 11, 0)!.color = 9)],
      ['group/state mismatch', (s) => (cellAt(s, 11, 0)!.state = 'matched')],
      [
        'unknown group',
        (s) => {
          const b = cellAt(s, 11, 0)!;
          b.state = 'matched';
          b.group = 7;
        },
      ],
      ['has 0/3 blocks', (s) => s.groups.push({ id: 3, size: 3, age: 0, chain: 1 })],
      ['hover timer', (s) => (cellAt(s, 10, 0)!.state = 'hovering')],
      ['swap timer', (s) => (cellAt(s, 10, 0)!.state = 'swapping')],
      ['fall progress', (s) => (cellAt(s, 10, 0)!.fall = 3)],
      [
        'floating idle',
        (s) => {
          s.cells[5 * 6 + 3] = { ...cellAt(s, 10, 0)!, id: 999 };
          s.nextBlockId = 1000;
        },
      ],
      [
        'idle block on hovering',
        (s) => {
          const g = cellAt(s, 11, 0)!;
          g.state = 'hovering';
          g.timer = 3;
        },
      ],
      ['preview block', (s) => (s.preview[0]!.state = 'falling')],
    ];
    for (const [msg, corrupt] of cases) {
      const sim = base();
      corrupt(sim);
      const errors = checkInvariants(sim);
      expect(errors.join('|'), msg).toContain(msg);
    }
  });
});
