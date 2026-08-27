const PRODUCTION_API_URL = 'https://budgeting-app-m3aj.onrender.com'

process.env.EXPO_PUBLIC_API_URL =
  process.env.EXPO_PUBLIC_API_URL || PRODUCTION_API_URL

export default {
  expo: {
    name: 'Setaside',
    slug: 'setaside',
    version: '0.1.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    scheme: 'setaside',
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#f3f6f2',
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.setasideplan.app',
    },
    android: {
      package: 'com.setasideplan.app',
      versionCode: 1,
      adaptiveIcon: {
        backgroundColor: '#1f4b3a',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      permissions: ['INTERNET', 'ACCESS_NETWORK_STATE'],
      blockedPermissions: [
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.VIBRATE',
      ],
      predictiveBackGestureEnabled: false,
    },
    plugins: ['expo-secure-store', './plugins/withNodeBinary'],
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL,
    },
  },
}
