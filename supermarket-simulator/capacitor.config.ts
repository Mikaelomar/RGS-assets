import type { CapacitorConfig } from '@capacitor/cli';

// Change appId to your own reverse-domain id before publishing (it must be unique on Google Play / App Store).
const config: CapacitorConfig = {
  appId: 'com.supermarketlife.sim',
  appName: 'Supermarket Life',
  webDir: 'dist',
  backgroundColor: '#10202e',
  android: {
    backgroundColor: '#10202e',
    allowMixedContent: false,
  },
  ios: {
    backgroundColor: '#10202e',
    contentInset: 'never',
    scrollEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: false,
      backgroundColor: '#10202e',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
  },
};

export default config;
