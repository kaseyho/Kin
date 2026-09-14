import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Kin',
  slug: 'kin',
  owner: 'moondrunk',
  scheme: 'kin',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  ios: {
    ...config.ios,
    bundleIdentifier: 'com.kaseyho.kin',
    supportsTablet: true,
  },
  android: {
    ...config.android,
    blockedPermissions: ['android.permission.RECORD_AUDIO'],
    package: 'com.kaseyho.kin',
  },
  web: {
    ...config.web,
    bundler: 'metro',
    output: 'single',
  },
  plugins: [
    'expo-router',
    [
      'expo-image-picker',
      {
        cameraPermission: false,
        microphonePermission: false,
        photosPermission: 'Choose photos to share privately in Kin.',
      },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: {
    ...config.extra,
    kinEnvironment: process.env.EXPO_PUBLIC_KIN_ENVIRONMENT,
  },
});
