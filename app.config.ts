import type { ConfigContext, ExpoConfig } from 'expo/config';

type BuildDeployment = 'demo' | 'development' | 'preview' | 'production';
const DEFAULT_SUPPORT_EMAIL = 'support@kin.invalid';

export default ({ config }: ConfigContext): ExpoConfig => {
  const environment = readBuildEnvironment();
  const easBuildPlatform = process.env.EAS_BUILD_PLATFORM?.trim();
  if (easBuildPlatform === 'ios' || easBuildPlatform === 'android') {
    assertRevenueCatBuildKey(environment.deployment, easBuildPlatform);
  }
  const publicUrl = new URL(environment.publicAppUrl);
  const verifiedWebDomain = publicUrl.protocol === 'https:'
    && !publicUrl.hostname.endsWith('.invalid')
    && !isLoopbackHostname(publicUrl.hostname);
  const invitationPath = `${publicUrl.pathname.replace(/\/$/, '')}/invite`;

  return {
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
      ...(verifiedWebDomain
        ? { associatedDomains: [`applinks:${publicUrl.hostname}`] }
        : {}),
      bundleIdentifier: 'com.kaseyho.kin',
      supportsTablet: true,
    },
    android: {
      ...config.android,
      ...(verifiedWebDomain
        ? {
            intentFilters: [
              {
                action: 'VIEW',
                autoVerify: true,
                category: ['BROWSABLE', 'DEFAULT'],
                data: [{ host: publicUrl.hostname, pathPrefix: invitationPath, scheme: 'https' }],
              },
            ],
          }
        : {}),
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
      'expo-notifications',
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
      kinEnvironment: environment.deployment,
      kinPublicUrl: environment.publicAppUrl,
      kinSupportEmail: environment.supportEmail,
    },
  };
};

function readBuildEnvironment(): {
  deployment: BuildDeployment;
  publicAppUrl: string;
  supportEmail: string;
} {
  const deployment = process.env.EXPO_PUBLIC_KIN_ENVIRONMENT?.trim();
  if (!isBuildDeployment(deployment)) {
    throw new Error('Set EXPO_PUBLIC_KIN_ENVIRONMENT before evaluating the Expo config.');
  }
  const rawSupportEmail = process.env.EXPO_PUBLIC_KIN_SUPPORT_EMAIL?.trim();
  const configuredSupportEmail = normalizeSupportEmail(rawSupportEmail);
  if (rawSupportEmail && !configuredSupportEmail) {
    throw new Error('Kin requires a valid public support email.');
  }
  if (deployment === 'demo') {
    return {
      deployment,
      publicAppUrl: 'https://demo.kin.invalid',
      supportEmail: configuredSupportEmail ?? DEFAULT_SUPPORT_EMAIL,
    };
  }

  const configuredUrl = process.env.EXPO_PUBLIC_KIN_PUBLIC_URL?.trim()
    || (deployment === 'development' ? 'http://localhost:8081' : '');
  let publicAppUrl: string;
  try {
    const url = new URL(configuredUrl);
    const isLoopback = isLoopbackHostname(url.hostname);
    const allowedProtocol = url.protocol === 'https:'
      || (deployment === 'development' && url.protocol === 'http:' && isLoopback);
    if (
      !allowedProtocol
      || (deployment !== 'development' && isLoopback)
      || !url.hostname
      || url.username
      || url.password
      || url.search
      || url.hash
    ) {
      throw new Error('invalid public URL');
    }
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    publicAppUrl = url.toString().replace(/\/$/, '');
  } catch {
    throw new Error('Kin requires a public HTTPS app URL outside local development.');
  }
  if (!configuredSupportEmail && deployment !== 'development') {
    throw new Error('Kin requires a valid public support email for preview and production.');
  }
  return {
    deployment,
    publicAppUrl,
    supportEmail: configuredSupportEmail ?? DEFAULT_SUPPORT_EMAIL,
  };
}

function normalizeSupportEmail(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
  const domain = normalized.split('@')[1];
  if (
    domain === 'localhost'
    || domain.endsWith('.localhost')
    || domain.endsWith('.invalid')
    || domain.endsWith('.example')
  ) {
    return null;
  }
  return normalized;
}

function isBuildDeployment(value: string | undefined): value is BuildDeployment {
  return value === 'demo' || value === 'development' || value === 'preview' || value === 'production';
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized === '::1'
    || normalized === '[::1]'
    || /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

function assertRevenueCatBuildKey(
  deployment: BuildDeployment,
  platform: 'android' | 'ios',
): void {
  if (deployment === 'demo') return;
  const value = (platform === 'ios'
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
    : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY)?.trim();
  if (!value) {
    if (deployment === 'production') {
      throw new Error(`Production Kin requires a RevenueCat ${platform} public key.`);
    }
    return;
  }
  const prefix = platform === 'ios' ? 'appl_' : 'goog_';
  const validProviderKey = value.startsWith(prefix) && value.length > prefix.length;
  const validTestStoreKey = value.startsWith('test_') && value.length > 'test_'.length;
  if (deployment === 'production' ? !validProviderKey : !validProviderKey && !validTestStoreKey) {
    throw new Error(
      `Kin requires a valid RevenueCat ${platform} ${deployment === 'production' ? 'production ' : ''}public key.`,
    );
  }
}
