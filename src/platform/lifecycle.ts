import { App } from '@capacitor/app';
import { ListenerSet } from './listeners';
import type { Lifecycle } from './types';

/**
 * Web lifecycle: `visibilitychange` maps to pause/resume, the Escape key acts
 * as the back button. DOM listeners are attached on construction.
 */
export function createWebLifecycle(
  doc: Document | undefined = globalThis.document,
): Lifecycle & { dispose(): void } {
  const pause = new ListenerSet();
  const resume = new ListenerSet();
  const back = new ListenerSet();

  const onVisibility = (): void => {
    if (!doc) return;
    if (doc.visibilityState === 'hidden') pause.emit();
    else resume.emit();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || e.repeat) return;
    if (back.emitLast()) e.preventDefault();
  };

  doc?.addEventListener('visibilitychange', onVisibility);
  doc?.addEventListener('keydown', onKey);

  return {
    onPause: (l) => pause.add(l),
    onResume: (l) => resume.add(l),
    onBackButton: (l) => back.add(l),
    exitApp: () => undefined,
    dispose: () => {
      doc?.removeEventListener('visibilitychange', onVisibility);
      doc?.removeEventListener('keydown', onKey);
    },
  };
}

/**
 * Native lifecycle via @capacitor/app. Registering a `backButton` listener
 * disables Android's default behaviour, so with no handler subscribed we
 * exit the app ourselves.
 */
export function createNativeLifecycle(): Lifecycle {
  const pause = new ListenerSet();
  const resume = new ListenerSet();
  const back = new ListenerSet();

  void App.addListener('pause', () => pause.emit());
  void App.addListener('resume', () => resume.emit());
  void App.addListener('backButton', () => {
    if (!back.emitLast()) void App.exitApp();
  });

  return {
    onPause: (l) => pause.add(l),
    onResume: (l) => resume.add(l),
    onBackButton: (l) => back.add(l),
    exitApp: () => void App.exitApp(),
  };
}
