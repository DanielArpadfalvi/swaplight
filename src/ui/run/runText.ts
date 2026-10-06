import { TICKS_PER_SECOND } from '../../core/config';
import type { StageGoal } from '../../core/run';
import { t, type TranslationKey } from '../../i18n';

/** Translated names / descriptions of Run content (keys follow the core `i18nKey`s). */

const key = (k: string): TranslationKey => k as TranslationKey;

export const relicName = (id: string): string => t(key(`relic.${id}.name`));
export const relicDesc = (id: string): string => t(key(`relic.${id}.desc`));
export const charmName = (id: string): string => t(key(`charm.${id}.name`));
export const charmDesc = (id: string): string => t(key(`charm.${id}.desc`));
export const curseName = (id: string): string => t(key(`boss.${id}.name`));
export const curseDesc = (id: string): string => t(key(`boss.${id}.desc`));
export const deckName = (id: string): string => t(key(`deck.${id}.name`));
export const deckDesc = (id: string): string => t(key(`deck.${id}.desc`));
export const brightnessName = (level: number): string => t(key(`brightness.${level}.name`));
export const brightnessDesc = (level: number): string => t(key(`brightness.${level}.desc`));

/** "Score 2 000 points" / "Make 3 chains of ×2+" … */
export function goalText(goal: StageGoal, fmt: (n: number) => string): string {
  switch (goal.type) {
    case 'scoreInTime':
      return t('goal.scoreInTime', { target: fmt(goal.target) });
    case 'clearBlocks':
      return t('goal.clearBlocks', { target: fmt(goal.target) });
    case 'survive':
      return t('goal.survive', { seconds: Math.round(goal.timeLimit / TICKS_PER_SECOND) });
    case 'chainTarget':
      return t('goal.chainTarget', { target: goal.target, length: goal.chainLength });
  }
}

export const goalShort = (goal: StageGoal): string => t(key(`goal.short.${goal.type}`));

/** "1:30" */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
