import { Haptics as CapHaptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import type { Haptics, ImpactStrength, NotificationKind } from './types';

/** Low-level haptic output, without the enable gate. */
export interface HapticsDriver {
  impact(strength: ImpactStrength): Promise<void> | void;
  notify(kind: NotificationKind): Promise<void> | void;
  selection(): Promise<void> | void;
}

/** Wraps a driver with the global enable flag and error swallowing. */
export function createHaptics(driver: HapticsDriver, enabled = true): Haptics {
  let on = enabled;
  const fire = (fn: () => Promise<void> | void): void => {
    if (!on) return;
    try {
      const result = fn();
      if (result) result.catch(() => undefined);
    } catch {
      // Haptics are best-effort only.
    }
  };
  return {
    impact: (strength) => fire(() => driver.impact(strength)),
    notify: (kind) => fire(() => driver.notify(kind)),
    selection: () => fire(() => driver.selection()),
    setEnabled: (value) => {
      on = value;
    },
    isEnabled: () => on,
  };
}

/** Vibration patterns (ms) used by the web fallback. */
export const WEB_VIBRATION_PATTERNS = {
  light: 10,
  medium: 20,
  heavy: 35,
  success: [15, 40, 15],
  warning: [30, 60, 30],
  selection: 5,
} as const satisfies Record<ImpactStrength | NotificationKind | 'selection', number | number[]>;

type Vibrate = (pattern: number | number[]) => boolean;

function defaultVibrate(): Vibrate | undefined {
  const nav = globalThis.navigator as Navigator | undefined;
  if (!nav || typeof nav.vibrate !== 'function') return undefined;
  return (pattern) => nav.vibrate(pattern);
}

/** Web driver: `navigator.vibrate` when available (Android browsers), else no-op. */
export function createWebHapticsDriver(
  vibrate: Vibrate | undefined = defaultVibrate(),
): HapticsDriver {
  const play = (pattern: number | readonly number[]): void => {
    vibrate?.(typeof pattern === 'number' ? pattern : [...pattern]);
  };
  return {
    impact: (strength) => play(WEB_VIBRATION_PATTERNS[strength]),
    notify: (kind) => play(WEB_VIBRATION_PATTERNS[kind]),
    selection: () => play(WEB_VIBRATION_PATTERNS.selection),
  };
}

const IMPACT_STYLE: Record<ImpactStrength, ImpactStyle> = {
  light: ImpactStyle.Light,
  medium: ImpactStyle.Medium,
  heavy: ImpactStyle.Heavy,
};

const NOTIFICATION_TYPE: Record<NotificationKind, NotificationType> = {
  success: NotificationType.Success,
  warning: NotificationType.Warning,
};

export function createNativeHapticsDriver(): HapticsDriver {
  return {
    impact: (strength) => CapHaptics.impact({ style: IMPACT_STYLE[strength] }),
    notify: (kind) => CapHaptics.notification({ type: NOTIFICATION_TYPE[kind] }),
    selection: async () => {
      await CapHaptics.selectionStart();
      await CapHaptics.selectionChanged();
      await CapHaptics.selectionEnd();
    },
  };
}
