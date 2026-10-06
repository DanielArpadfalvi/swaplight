import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.arpadfalvi.swaplight',
  appName: 'Swaplight',
  webDir: 'dist',
  backgroundColor: '#07070f',
  android: {
    backgroundColor: '#07070f',
  },
  ios: {
    backgroundColor: '#07070f',
    contentInset: 'never',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: '#07070f',
    },
  },
};

export default config;
