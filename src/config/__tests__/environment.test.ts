import {
  ConfigurationError,
  readEnvironment,
  readPublicEnvironmentValues,
} from '../environment';

describe('readEnvironment', () => {
  it('requires an explicit deployment profile', () => {
    expect(() => readEnvironment({})).toThrow(ConfigurationError);
    expect(() => readEnvironment({})).toThrow('Set EXPO_PUBLIC_KIN_ENVIRONMENT');
  });

  it('selects an isolated demo only when requested', () => {
    expect(readEnvironment({ EXPO_PUBLIC_KIN_ENVIRONMENT: 'demo' })).toEqual({
      deployment: 'demo',
      mode: 'demo',
      publicAppUrl: 'https://demo.kin.invalid',
      supportEmail: 'support@kin.invalid',
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
      EXPO_PUBLIC_KIN_PUBLIC_URL: 'https://kin.example/invite/',
      EXPO_PUBLIC_KIN_SUPPORT_EMAIL: ' Support@Kin-App.com ',
      EXPO_PUBLIC_SUPABASE_URL: 'https://kin.supabase.co',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
    })).toEqual({
      deployment: 'production',
      mode: 'connected',
      publicAppUrl: 'https://kin.example/invite',
      supportEmail: 'support@kin-app.com',
      supabasePublishableKey: 'sb_publishable_example',
      supabaseUrl: 'https://kin.supabase.co',
    });
  });

  it.each(['preview', 'production'] as const)(
    'requires a valid support email for %s',
    (deployment) => {
      expect(() => readEnvironment({
        EXPO_PUBLIC_KIN_ENVIRONMENT: deployment,
        EXPO_PUBLIC_KIN_PUBLIC_URL: 'https://kin.example',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
        EXPO_PUBLIC_SUPABASE_URL: 'https://kin.supabase.co',
      })).toThrow('support email');
      expect(() => readEnvironment({
        EXPO_PUBLIC_KIN_ENVIRONMENT: deployment,
        EXPO_PUBLIC_KIN_PUBLIC_URL: 'https://kin.example',
        EXPO_PUBLIC_KIN_SUPPORT_EMAIL: 'not-an-email',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
        EXPO_PUBLIC_SUPABASE_URL: 'https://kin.supabase.co',
      })).toThrow('support email');
    },
  );

  it.each(['preview', 'production'] as const)(
    'requires a public HTTPS app URL for %s',
    (deployment) => {
      expect(() => readEnvironment({
        EXPO_PUBLIC_KIN_ENVIRONMENT: deployment,
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
        EXPO_PUBLIC_SUPABASE_URL: 'https://kin.supabase.co',
      })).toThrow('public HTTPS app URL');
    },
  );

  it.each(['preview', 'production'] as const)(
    'rejects loopback as the public app URL for %s even over HTTPS',
    (deployment) => {
      for (const publicAppUrl of [
        'https://localhost:8081',
        'https://dev.localhost',
        'https://127.0.0.2',
        'https://[::1]',
      ]) {
        expect(() => readEnvironment({
          EXPO_PUBLIC_KIN_ENVIRONMENT: deployment,
          EXPO_PUBLIC_KIN_PUBLIC_URL: publicAppUrl,
          EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
          EXPO_PUBLIC_SUPABASE_URL: 'https://kin.supabase.co',
        })).toThrow('public HTTPS app URL');
      }
    },
  );

  it('normalizes the public app URL and rejects query strings, fragments, and credentials', () => {
    expect(readEnvironment({
      EXPO_PUBLIC_KIN_ENVIRONMENT: 'production',
      EXPO_PUBLIC_KIN_PUBLIC_URL: 'https://KIN.example/base///',
      EXPO_PUBLIC_KIN_SUPPORT_EMAIL: 'support@kin-app.com',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
      EXPO_PUBLIC_SUPABASE_URL: 'https://kin.supabase.co',
    }).publicAppUrl).toBe('https://kin.example/base');

    for (const publicAppUrl of [
      'https://kin.example/?campaign=unsafe',
      'https://kin.example/#unsafe',
      'https://user:secret@kin.example',
    ]) {
      expect(() => readEnvironment({
        EXPO_PUBLIC_KIN_ENVIRONMENT: 'production',
        EXPO_PUBLIC_KIN_PUBLIC_URL: publicAppUrl,
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
        EXPO_PUBLIC_SUPABASE_URL: 'https://kin.supabase.co',
      })).toThrow('public HTTPS app URL');
    }
  });

  it('allows loopback HTTP and legacy local anon keys only in development', () => {
    expect(readEnvironment({
      EXPO_PUBLIC_KIN_ENVIRONMENT: 'development',
      EXPO_PUBLIC_KIN_PUBLIC_URL: 'http://127.0.0.1:8081/',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'eyJlocal-anon-key',
      EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    })).toMatchObject({ mode: 'connected', publicAppUrl: 'http://127.0.0.1:8081' });

    expect(readEnvironment({
      EXPO_PUBLIC_KIN_ENVIRONMENT: 'development',
      EXPO_PUBLIC_KIN_PUBLIC_URL: 'http://[::1]:8081/',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'eyJlocal-anon-key',
      EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    })).toMatchObject({ mode: 'connected', publicAppUrl: 'http://[::1]:8081' });

    expect(readEnvironment({
      EXPO_PUBLIC_KIN_ENVIRONMENT: 'development',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'eyJlocal-anon-key',
      EXPO_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
    })).toMatchObject({ mode: 'connected', publicAppUrl: 'http://localhost:8081' });

    expect(() => readEnvironment({
      EXPO_PUBLIC_KIN_ENVIRONMENT: 'production',
      EXPO_PUBLIC_KIN_PUBLIC_URL: 'https://kin.example',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'eyJlocal-anon-key',
      EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    })).toThrow('HTTPS Supabase URL');
  });

  it.each(['service_role_secret', 'sb_secret_example'])(
    'rejects privileged-looking public key %s',
    (key) => {
      expect(() => readEnvironment({
        EXPO_PUBLIC_KIN_ENVIRONMENT: 'production',
        EXPO_PUBLIC_KIN_PUBLIC_URL: 'https://kin.example',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
        EXPO_PUBLIC_SUPABASE_URL: 'https://kin.supabase.co',
      })).toThrow('publishable key');
    },
  );
});

describe('readPublicEnvironmentValues', () => {
  it('collects each Expo public value through an explicit property read', () => {
    const previous = process.env.EXPO_PUBLIC_KIN_PUBLIC_URL;
    const previousSupport = process.env.EXPO_PUBLIC_KIN_SUPPORT_EMAIL;
    process.env.EXPO_PUBLIC_KIN_PUBLIC_URL = 'https://bundle.kin.example';
    process.env.EXPO_PUBLIC_KIN_SUPPORT_EMAIL = 'support@bundle.kin.example';
    try {
      expect(readPublicEnvironmentValues().EXPO_PUBLIC_KIN_PUBLIC_URL)
        .toBe('https://bundle.kin.example');
      expect(readPublicEnvironmentValues().EXPO_PUBLIC_KIN_SUPPORT_EMAIL)
        .toBe('support@bundle.kin.example');
    } finally {
      if (previous === undefined) delete process.env.EXPO_PUBLIC_KIN_PUBLIC_URL;
      else process.env.EXPO_PUBLIC_KIN_PUBLIC_URL = previous;
      if (previousSupport === undefined) delete process.env.EXPO_PUBLIC_KIN_SUPPORT_EMAIL;
      else process.env.EXPO_PUBLIC_KIN_SUPPORT_EMAIL = previousSupport;
    }
  });
});
