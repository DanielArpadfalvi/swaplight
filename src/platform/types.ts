/** Call to remove a previously registered listener. Safe to call more than once. */
export type Unsubscribe = () => void;

/** JSON-serialisable value accepted by {@link Storage}. */
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** Async key-value store for JSON values (settings, saves, mock entitlements). */
export interface Storage {
  /** Returns the stored value, or `undefined` if missing or unreadable. */
  get<T extends JsonValue = JsonValue>(key: string): Promise<T | undefined>;
  set(key: string, value: JsonValue): Promise<void>;
  remove(key: string): Promise<void>;
}

export type ImpactStrength = 'light' | 'medium' | 'heavy';
export type NotificationKind = 'success' | 'warning';

/** Fire-and-forget haptic feedback. All calls are no-ops while disabled. */
export interface Haptics {
  impact(strength: ImpactStrength): void;
  notify(kind: NotificationKind): void;
  /** Short tick, e.g. when a swap happens or a picker changes value. */
  selection(): void;
  setEnabled(enabled: boolean): void;
  isEnabled(): boolean;
}

/**
 * App lifecycle events. Back-button handlers form a stack: only the most
 * recently registered (still subscribed) handler is invoked.
 */
export interface Lifecycle {
  onPause(listener: () => void): Unsubscribe;
  onResume(listener: () => void): Unsubscribe;
  onBackButton(listener: () => void): Unsubscribe;
  /** Close the app (Android back on the main menu). No-op on the web. */
  exitApp(): void;
}

/** `dark` = dark app background, i.e. light status bar content. */
export type StatusBarStyle = 'dark' | 'light';

export interface SystemUI {
  setStatusBarStyle(style: StatusBarStyle): Promise<void>;
  hideStatusBar(): Promise<void>;
  showStatusBar(): Promise<void>;
  hideSplash(): Promise<void>;
}
