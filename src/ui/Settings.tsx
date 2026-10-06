import { VERSION } from '../core/version';
import { LANGUAGE_SETTINGS, type LanguageSetting, type Settings } from '../game/settings';
import type { GameActions, GameUiState } from '../game/state';
import { LANGUAGE_NAMES, t } from '../i18n';
import { IconChevron } from './icons';
import { Section, Sheet } from './Sheet';

interface Props {
  state: GameUiState;
  actions: GameActions;
  leaving: boolean;
  z: number;
}

export function SettingsScreen({ state, actions, leaving, z }: Props) {
  const s = state.settings;
  const set = (patch: Partial<Settings>) => actions.updateSettings(patch);
  return (
    <Sheet
      title={t('settings.title')}
      testId="settings"
      leaving={leaving}
      z={z}
      onBack={() => actions.closeOverlay()}
    >
      <Section title={t('settings.sectionAudio')}>
        <VolumeRow
          id="music"
          label={t('settings.music')}
          value={s.musicVolume}
          onChange={(v) => set({ musicVolume: v })}
        />
        <VolumeRow
          id="sfx"
          label={t('settings.sfx')}
          value={s.sfxVolume}
          onChange={(v) => set({ sfxVolume: v })}
        />
      </Section>

      <Section title={t('settings.sectionGameplay')}>
        <ToggleRow
          id="haptics"
          label={t('settings.haptics')}
          hint={t('settings.hapticsHint')}
          value={s.haptics}
          onChange={(v) => set({ haptics: v })}
        />
        <ToggleRow
          id="breakdown"
          label={t('settings.showBreakdown')}
          hint={t('settings.showBreakdownHint')}
          value={s.showBreakdown}
          onChange={(v) => set({ showBreakdown: v })}
        />
      </Section>

      <Section title={t('settings.sectionAccessibility')}>
        <ToggleRow
          id="reduced-motion"
          label={t('settings.reducedMotion')}
          hint={t('settings.reducedMotionHint')}
          value={s.reducedMotion}
          onChange={(v) => set({ reducedMotion: v })}
        />
        <ToggleRow
          id="high-contrast"
          label={t('settings.highContrast')}
          hint={t('settings.highContrastHint')}
          value={s.highContrast}
          onChange={(v) => set({ highContrast: v })}
        />
      </Section>

      <Section title={t('settings.sectionLanguage')}>
        <div class="row row-stack">
          <div class="segmented" role="radiogroup" aria-label={t('settings.language')}>
            {LANGUAGE_SETTINGS.map((lang) => (
              <button
                key={lang}
                type="button"
                role="radio"
                aria-checked={s.language === lang ? 'true' : 'false'}
                class={`seg${s.language === lang ? ' seg-on' : ''}`}
                data-testid={`lang-${lang}`}
                onClick={() => set({ language: lang })}
              >
                {languageLabel(lang)}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title={t('settings.sectionPurchases')}>
        <div class="row">
          <span class="row-text">
            <span class="row-label">
              {state.fullVersion
                ? t('settings.fullVersionOwned')
                : t('settings.fullVersionNotOwned')}
            </span>
            {state.restoreStatus !== 'idle' && state.restoreStatus !== 'busy' && (
              <span class="row-hint" data-testid="restore-status" role="status">
                {restoreMessage(state.restoreStatus)}
              </span>
            )}
          </span>
          <span class={`dot${state.fullVersion ? ' dot-on' : ''}`} aria-hidden="true" />
        </div>
        {!state.fullVersion && (
          <div class="row row-stack">
            <button
              type="button"
              class="btn btn-primary btn-small"
              data-testid="settings-unlock"
              onClick={() => actions.openPaywall('settings')}
            >
              {t('paywall.settingsUnlock')}
            </button>
          </div>
        )}
        <div class="row row-stack">
          <button
            type="button"
            class="btn btn-ghost btn-small"
            data-testid="restore-purchases"
            disabled={state.restoreStatus === 'busy'}
            onClick={() => actions.restorePurchases()}
          >
            {state.restoreStatus === 'busy'
              ? t('settings.restoring')
              : t('settings.restorePurchases')}
          </button>
        </div>
      </Section>

      <Section title={t('settings.sectionAbout')}>
        <LinkRow
          label={t('settings.credits')}
          testId="open-credits"
          onClick={() => actions.openOverlay('credits')}
        />
        <LinkRow
          label={t('settings.privacy')}
          testId="open-privacy"
          onClick={() => actions.openOverlay('privacy')}
        />
        <div class="row">
          <span class="row-label">{t('settings.version')}</span>
          <span class="row-value" data-testid="version">
            {VERSION}
          </span>
        </div>
      </Section>
    </Sheet>
  );
}

function languageLabel(lang: LanguageSetting): string {
  return lang === 'auto' ? t('settings.languageAuto') : LANGUAGE_NAMES[lang];
}

function restoreMessage(status: GameUiState['restoreStatus']): string {
  if (status === 'restored') return t('settings.restoreSuccess');
  if (status === 'nothing') return t('settings.restoreNothing');
  return t('settings.restoreFailed');
}

function ToggleRow({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      class="row row-button"
      role="switch"
      aria-checked={value ? 'true' : 'false'}
      data-testid={`toggle-${id}`}
      onClick={() => onChange(!value)}
    >
      <span class="row-text">
        <span class="row-label">{label}</span>
        <span class="row-hint">{hint}</span>
      </span>
      <span class={`switch${value ? ' switch-on' : ''}`} aria-hidden="true">
        <span class="switch-knob" />
      </span>
    </button>
  );
}

function VolumeRow({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const pct = Math.round(value * 100);
  return (
    <label class="row row-stack row-volume">
      <span class="row-line">
        <span class="row-label">{label}</span>
        <span class="row-value">{pct}%</span>
      </span>
      <input
        type="range"
        class="slider"
        min={0}
        max={100}
        step={5}
        value={pct}
        style={{ '--fill': `${pct}%` }}
        data-testid={`volume-${id}`}
        aria-label={label}
        onInput={(e) => onChange(Number((e.currentTarget as HTMLInputElement).value) / 100)}
      />
    </label>
  );
}

function LinkRow({
  label,
  testId,
  onClick,
}: {
  label: string;
  testId: string;
  onClick: () => void;
}) {
  return (
    <button type="button" class="row row-button" data-testid={testId} onClick={onClick}>
      <span class="row-label">{label}</span>
      <span class="row-chevron">
        <IconChevron />
      </span>
    </button>
  );
}
