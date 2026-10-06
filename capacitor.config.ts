import type { CapacitorConfig } from '@capacitor/cli';

const BACKGROUND = '#07070f';

const config: CapacitorConfig = {
  appId: 'com.arpadfalvi.swaplight',
  appName: 'Swaplight',
  webDir: 'dist',
  backgroundColor: BACKGROUND,
  android: {
    backgroundColor: BACKGROUND,
    // Over-scroll glow is disabled natively in MainActivity (no config key for it).
  },
  ios: {
    backgroundColor: BACKGROUND,
    contentInset: 'never',
    // No rubber-band bounce: the game owns every touch.
    scrollEnabled: false,
    // Hide the WKWebView link preview / long-press callouts.
    allowsLinkPreview: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: BACKGROUND,
    },
    SystemBars: {
      // Edge-to-edge webview; safe areas come from env(safe-area-inset-*) / --safe-area-inset-*.
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      // Light system-bar icons on the dark backdrop.
      style: 'DARK',
    },
  },
};

export default config;
