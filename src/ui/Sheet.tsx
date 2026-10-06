import type { ComponentChildren } from 'preact';
import { t } from '../i18n';
import { IconBack } from './icons';

/** Full-screen panel with a back button header and a scrollable body (settings, stats…). */
export function Sheet({
  title,
  testId,
  leaving,
  z,
  onBack,
  children,
}: {
  title: string;
  testId: string;
  leaving: boolean;
  z: number;
  onBack: () => void;
  children: ComponentChildren;
}) {
  return (
    <div
      class={`overlay sheet${leaving ? ' is-leaving' : ''}`}
      style={{ zIndex: z }}
      data-testid={testId}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div class="sheet-frame">
        <header class="sheet-head">
          <button
            type="button"
            class="icon-btn sheet-back"
            aria-label={t('common.back')}
            data-testid="sheet-back"
            onClick={onBack}
          >
            <IconBack />
          </button>
          <h2 class="sheet-title">{title}</h2>
          <span class="sheet-spacer" />
        </header>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <section class="section">
      <h3 class="section-title">{title}</h3>
      <div class="section-card">{children}</div>
    </section>
  );
}
