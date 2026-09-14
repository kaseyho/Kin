import { ConfigurationError, readEnvironment } from '../environment';

describe('readEnvironment', () => {
  it('requires an explicit deployment profile', () => {
    expect(() => readEnvironment({})).toThrow(ConfigurationError);
    expect(() => readEnvironment({})).toThrow('Set EXPO_PUBLIC_KIN_ENVIRONMENT');
  });

  it('selects an isolated demo only when requested', () => {
    expect(readEnvironment({ EXPO_PUBLIC_KIN_ENVIRONMENT: 'demo' })).toEqual({
      deployment: 'demo',
      mode: 'demo',
    });
  });

  it.each(['development', 'preview', 'production'] as const)(
    'requires complete Supabase configuration for %s',
    (deployment) => {
      expect(() => readEnvironment({ EXPO_PUBLIC_KIN_ENVIRONMENT: deployment }))
        .toThrow('Supabase URL and publishable key');
    },
  );

  it('accepts HTTPS hosted connected configuration', () => {
    expect(readEnvironment({
      EXPO_PUBLIC_KIN_ENVIRONMENT: 'production',
      EXPO_PUBLIC_SUPABASE_URL: 'https://kin.supabase.co',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
    })).toEqual({
      deployment: 'production',
      mode: 'connected',
      supabasePublishableKey: 'sb_publishable_example',
      supabaseUrl: 'https://kin.supabase.co',
    });
  });

  it('allows loopback HTTP and legacy local anon keys only in development', () => {
    expect(readEnvironment({
      EXPO_PUBLIC_KIN_ENVIRONMENT: 'development',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'eyJlocal-anon-key',
      EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    }).mode).toBe('connected');

    expect(readEnvironment({
      EXPO_PUBLIC_KIN_ENVIRONMENT: 'development',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'eyJlocal-anon-key',
      EXPO_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
    }).mode).toBe('connected');

    expect(() => readEnvironment({
      EXPO_PUBLIC_KIN_ENVIRONMENT: 'production',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'eyJlocal-anon-key',
      EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    })).toThrow('HTTPS Supabase URL');
  });

  it.each(['service_role_secret', 'sb_secret_example'])(
    'rejects privileged-looking public key %s',
    (key) => {
      expect(() => readEnvironment({
        EXPO_PUBLIC_KIN_ENVIRONMENT: 'production',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
        EXPO_PUBLIC_SUPABASE_URL: 'https://kin.supabase.co',
      })).toThrow('publishable key');
    },
  );
});
