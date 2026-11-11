import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nodex.terminal',
  appName: 'NodeX Terminal',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#080808',
    webContentsDebuggingEnabled: false,
  },
};

export default config;
