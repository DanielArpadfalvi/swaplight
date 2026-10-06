/** Copy plain text to the system clipboard (share texts). */
export interface Clipboard {
  /** False when the platform offers no clipboard API (hide "copy" buttons). */
  readonly available: boolean;
  /** Resolves to true when the text was copied. Never rejects. */
  writeText(text: string): Promise<boolean>;
}

interface ClipboardLike {
  writeText(text: string): Promise<void>;
}

/**
 * Web / Capacitor WebView clipboard via `navigator.clipboard` (available in secure contexts; the
 * native shells serve the app from a secure origin, so no plugin is needed).
 */
export function createWebClipboard(
  api: ClipboardLike | undefined = globalThis.navigator?.clipboard,
): Clipboard {
  return {
    available: typeof api?.writeText === 'function',
    async writeText(text: string): Promise<boolean> {
      if (!api) return false;
      try {
        await api.writeText(text);
        return true;
      } catch {
        return false;
      }
    },
  };
}
