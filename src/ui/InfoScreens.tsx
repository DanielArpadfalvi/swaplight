import { versionLabel } from '../core/version';
import type { GameActions } from '../game/state';
import { t } from '../i18n';
import { Sheet } from './Sheet';

interface Props {
  actions: GameActions;
  leaving: boolean;
  z: number;
}

/** Collection placeholder until the Run mode discovers relics / charms / bosses. */
export function CollectionScreen({ actions, leaving, z }: Props) {
  return (
    <Sheet
      title={t('collection.title')}
      testId="collection"
      leaving={leaving}
      z={z}
      onBack={() => actions.closeOverlay()}
    >
      <div class="empty-state">
        <svg viewBox="0 0 120 104" width="150" height="130" aria-hidden="true" class="hex-art">
          {[
            [30, 18],
            [60, 18],
            [90, 18],
            [15, 44],
            [45, 44],
            [75, 44],
            [105, 44],
            [30, 70],
            [60, 70],
            [90, 70],
          ].map(([x, y], i) => (
            <polygon
              key={i}
              points={hexPoints(x!, y!, 13)}
              class={i === 4 ? 'hex hex-lit' : i === 8 ? 'hex hex-lit2' : 'hex'}
            />
          ))}
        </svg>
        <h3 class="empty-title">{t('collection.soonTitle')}</h3>
        <p class="empty-body">{t('collection.soonBody')}</p>
      </div>
    </Sheet>
  );
}

function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

export function CreditsScreen({ actions, leaving, z }: Props) {
  return (
    <Sheet
      title={t('about.creditsTitle')}
      testId="credits"
      leaving={leaving}
      z={z}
      onBack={() => actions.closeOverlay()}
    >
      <div class="about">
        <div class="logo logo-small" aria-hidden="true">
          <span class="logo-swap">SWAP</span>
          <span class="logo-light">LIGHT</span>
        </div>
        <dl class="credits">
          <dt>{t('about.madeBy')}</dt>
          <dd>{t('about.madeByName')}</dd>
          <dt>{t('about.artAudio')}</dt>
          <dd>{t('about.artAudioBody')}</dd>
          <dt>{t('about.tech')}</dt>
          <dd>{t('about.techList')}</dd>
        </dl>
        <p class="about-thanks">{t('about.thanks')}</p>
        <p class="ui-label ui-label-static">{versionLabel()}</p>
      </div>
    </Sheet>
  );
}

export function PrivacyScreen({ actions, leaving, z }: Props) {
  return (
    <Sheet
      title={t('about.privacyTitle')}
      testId="privacy"
      leaving={leaving}
      z={z}
      onBack={() => actions.closeOverlay()}
    >
      <div class="about about-text">
        <p>{t('about.privacyBody1')}</p>
        <p>{t('about.privacyBody2')}</p>
        <p class="about-note">{t('about.privacyBody3')}</p>
      </div>
    </Sheet>
  );
}

/** Android back on the main menu: confirm leaving the app. */
export function ExitDialog({ actions, leaving, z }: Props) {
  return (
    <div
      class={`overlay overlay-dim dialog${leaving ? ' is-leaving' : ''}`}
      style={{ zIndex: z }}
      data-testid="exit-confirm"
      role="alertdialog"
      aria-modal="true"
    >
      <div class="panel">
        <h2 class="panel-title">{t('menu.exitTitle')}</h2>
        <p class="panel-body">{t('menu.exitBody')}</p>
        <button
          type="button"
          class="btn btn-primary"
          data-testid="exit-stay"
          onClick={() => actions.closeOverlay()}
        >
          {t('menu.stay')}
        </button>
        <button
          type="button"
          class="btn btn-ghost"
          data-testid="exit-app"
          onClick={() => actions.exitApp()}
        >
          {t('menu.exit')}
        </button>
      </div>
    </div>
  );
}
