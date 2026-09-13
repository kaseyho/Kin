import { readEnvironment } from '../environment';

describe('readEnvironment', () => {
  it('uses demo mode unless both public Supabase values are valid', () => {
    expect(readEnvironment({})).toMatchObject({ mode: 'demo' });
    expect(readEnvironment({
      EXPO_PUBLIC_SUPABASE_URL: 'https://kin.supabase.co',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
    })).toEqual({
      mode: 'connected',
      supabasePublishableKey: 'sb_publishable_example',
      supabaseUrl: 'https://kin.supabase.co',
    });
  });

  it('rejects partial, insecure, and service-role configuration', () => {
    expect(readEnvironment({ EXPO_PUBLIC_SUPABASE_URL: 'https://kin.supabase.co' }).mode).toBe('demo');
    expect(readEnvironment({
      EXPO_PUBLIC_SUPABASE_URL: 'http://kin.supabase.co',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
    }).mode).toBe('demo');
    expect(readEnvironment({
      EXPO_PUBLIC_SUPABASE_URL: 'https://kin.supabase.co',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'service_role_secret',
    }).mode).toBe('demo');
  });
});
