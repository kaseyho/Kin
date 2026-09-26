import { DEFAULT_KIN_SUPPORT_EMAIL, normalizeSupportEmail } from './support';
import { readPlatformRevenueCatPublicEnvironment } from './revenuecat-public-key';

export type KinDeployment = 'demo' | 'development' | 'preview' | 'production';

export type KinEnvironment =
  | { deployment: 'demo'; mode: 'demo'; publicAppUrl: string; supportEmail: string }
  | {
      deployment: Exclude<KinDeployment, 'demo'>;
      mode: 'connected';
      publicAppUrl: string;
      supportEmail: string;
      supabaseUrl: string;
      supabasePublishableKey: string;
    };

export type EnvironmentValues = Record<string, string | undefined>;
export type RevenueCatPlatform = 'android' | 'ios' | 'web';

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export function readPublicEnvironmentValues(): EnvironmentValues {
  // Expo statically substitutes direct EXPO_PUBLIC_* property reads in application bundles.
  // Keep these explicit rather than spreading or forwarding the process.env object.
  return {
    EXPO_PUBLIC_KIN_ENVIRONMENT: process.env.EXPO_PUBLIC_KIN_ENVIRONMENT,
    EXPO_PUBLIC_KIN_PUBLIC_URL: process.env.EXPO_PUBLIC_KIN_PUBLIC_URL,
    EXPO_PUBLIC_KIN_SUPPORT_EMAIL: process.env.EXPO_PUBLIC_KIN_SUPPORT_EMAIL,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    ...readPlatformRevenueCatPublicEnvironment(),
  };
}

export function readRevenueCatPublicKey(
  values: EnvironmentValues,
  deployment: KinDeployment,
  platform: string,
): string | null {
  if (deployment === 'demo') return null;
  if (!isRevenueCatPlatform(platform)) {
    if (deployment === 'production') {
      throw new ConfigurationError(`Production Kin does not support RevenueCat on ${platform}.`);
    }
    return null;
  }

  const configuration = {
    android: {
      name: 'EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY',
      prefix: 'goog_',
    },
    ios: {
      name: 'EXPO_PUBLIC_REVENUECAT_IOS_API_KEY',
      prefix: 'appl_',
    },
    web: {
      name: 'EXPO_PUBLIC_REVENUECAT_WEB_API_KEY',
      prefix: 'rcb_',
    },
  } as const;
  const { name, prefix } = configuration[platform];
  const value = values[name]?.trim();
  if (!value) {
    if (deployment === 'production') {
      throw new ConfigurationError(`Production Kin requires a RevenueCat ${platform} public key.`);
    }
    return null;
  }

  const validProviderKey = value.startsWith(prefix) && value.length > prefix.length;
  const validTestStoreKey = value.startsWith('test_') && value.length > 'test_'.length;
  if (deployment === 'production' ? !validProviderKey : !validProviderKey && !validTestStoreKey) {
    throw new ConfigurationError(
      `Kin requires a valid RevenueCat ${platform} ${deployment === 'production' ? 'production ' : ''}public key.`,
    );
  }
  return value;
}

export function readEnvironment(
  values: EnvironmentValues = readPublicEnvironmentValues(),
): KinEnvironment {
  const deployment = values.EXPO_PUBLIC_KIN_ENVIRONMENT?.trim();
  if (!isDeployment(deployment)) {
    throw new ConfigurationError(
      'Set EXPO_PUBLIC_KIN_ENVIRONMENT to demo, development, preview, or production.',
    );
  }
  const rawSupportEmail = values.EXPO_PUBLIC_KIN_SUPPORT_EMAIL?.trim();
  const configuredSupportEmail = normalizeSupportEmail(rawSupportEmail);
  if (rawSupportEmail && !configuredSupportEmail) {
    throw new ConfigurationError('Kin requires a valid public support email.');
  }
  if (deployment === 'demo') {
    return {
      deployment,
      mode: 'demo',
      publicAppUrl: 'https://demo.kin.invalid',
      supportEmail: configuredSupportEmail ?? DEFAULT_KIN_SUPPORT_EMAIL,
    };
  }

  const supabaseUrl = values.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const supabasePublishableKey = values.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new ConfigurationError('Connected Kin requires a Supabase URL and publishable key.');
  }
  if (!isAllowedUrl(supabaseUrl, deployment)) {
    throw new ConfigurationError(
      'Connected Kin requires an HTTPS Supabase URL outside local development.',
    );
  }
  if (!isAllowedPublicKey(supabasePublishableKey, deployment)) {
    throw new ConfigurationError(
      'Use a Supabase publishable key; never expose a secret or service-role key.',
    );
  }
  const publicAppUrl = normalizePublicAppUrl(
    values.EXPO_PUBLIC_KIN_PUBLIC_URL?.trim()
      || (deployment === 'development' ? 'http://localhost:8081' : ''),
    deployment,
  );
  if (!configuredSupportEmail && deployment !== 'development') {
    throw new ConfigurationError('Kin requires a valid public support email for preview and production.');
  }
  return {
    deployment,
    mode: 'connected',
    publicAppUrl,
    supportEmail: configuredSupportEmail ?? DEFAULT_KIN_SUPPORT_EMAIL,
    supabasePublishableKey,
    supabaseUrl,
  };
}

function normalizePublicAppUrl(
  value: string,
  deployment: Exclude<KinDeployment, 'demo'>,
): string {
  try {
    const url = new URL(value);
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
    return url.toString().replace(/\/$/, '');
  } catch {
    throw new ConfigurationError(
      'Kin requires a public HTTPS app URL outside local development.',
    );
  }
}

export function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized === '::1'
    || normalized === '[::1]'
    || /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

function isDeployment(value: string | undefined): value is KinDeployment {
  return value === 'demo' || value === 'development' || value === 'preview' || value === 'production';
}

function isRevenueCatPlatform(value: string): value is RevenueCatPlatform {
  return value === 'android' || value === 'ios' || value === 'web';
}

function isAllowedUrl(value: string, deployment: Exclude<KinDeployment, 'demo'>): boolean {
  try {
    const url = new URL(value);
    if (url.username || url.password || !url.hostname) return false;
    if (url.protocol === 'https:') return true;
    return deployment === 'development'
      && url.protocol === 'http:'
      && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
  } catch {
    return false;
  }
}

function isAllowedPublicKey(
  value: string,
  deployment: Exclude<KinDeployment, 'demo'>,
): boolean {
  const normalized = value.toLowerCase();
  if (normalized.includes('service_role') || normalized.startsWith('sb_secret_')) return false;
  if (value.startsWith('sb_publishable_')) return true;
  return deployment === 'development' && value.startsWith('eyJ');
}
