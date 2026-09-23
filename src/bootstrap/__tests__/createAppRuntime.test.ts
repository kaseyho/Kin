import type { SupabaseClient } from '@supabase/supabase-js';

import type { StorageAdapter, KinRepository } from '@/data/contracts';
import type { Database } from '@/data/supabase/database.types';
import type { PremiumService } from '@/services/billing/contracts';
import type { AuthService } from '@/services/auth/contracts';
import type { AccountService } from '@/services/account/contracts';
import type { NotificationService } from '@/services/notifications/contracts';

import { createAppRuntime } from '../createAppRuntime';

jest.mock('@/services/billing', () => ({
  createPremiumService: jest.fn(),
}));

const storage: StorageAdapter = {
  getItem: async () => null,
  removeItem: async () => undefined,
  setItem: async () => undefined,
};

const repository = {} as KinRepository;
const premiumService = {} as PremiumService;
const authService = {} as AuthService;
const accountService = {} as AccountService;
const notificationService = {} as NotificationService;

describe('createAppRuntime', () => {
  it('turns invalid configuration into a renderable result', () => {
    const runtime = createAppRuntime(storage, {});

    expect(runtime.status).toBe('configuration-error');
    if (runtime.status === 'configuration-error') {
      expect(runtime.error.message).toContain('EXPO_PUBLIC_KIN_ENVIRONMENT');
    }
  });

  it('assembles demo services only for the demo deployment', () => {
    const runtime = createAppRuntime(
      storage,
      { EXPO_PUBLIC_KIN_ENVIRONMENT: 'demo' },
      {
        createAccountService: () => accountService,
        createAuthService: () => authService,
        createNotificationService: () => notificationService,
        createPremiumService: () => premiumService,
        createRepository: () => repository,
      },
    );

    expect(runtime).toEqual({
      accountService,
      environment: {
        deployment: 'demo',
        mode: 'demo',
        publicAppUrl: 'https://demo.kin.invalid',
        supportEmail: 'support@kin.invalid',
      },
      authService,
      notificationService,
      premiumService,
      repository,
      status: 'ready',
    });
  });

  it('does not hide unexpected service construction failures', () => {
    expect(() => createAppRuntime(
      storage,
      { EXPO_PUBLIC_KIN_ENVIRONMENT: 'demo' },
      {
        createAccountService: () => accountService,
        createAuthService: () => authService,
        createNotificationService: () => notificationService,
        createPremiumService: () => premiumService,
        createRepository: () => { throw new Error('construction failed'); },
      },
    )).toThrow('construction failed');
  });

  it('shares one connected client between auth and repository services', () => {
    const client = { marker: 'shared-client' } as unknown as SupabaseClient<Database>;
    const clientsSeen: unknown[] = [];
    const runtime = createAppRuntime(
      storage,
      {
        EXPO_PUBLIC_KIN_ENVIRONMENT: 'development',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'eyJ-development-test-key',
        EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      },
      {
        createAccountService: (_storage, _values, _environment, suppliedClient) => {
          clientsSeen.push(suppliedClient);
          return accountService;
        },
        createAuthService: (_storage, _values, _environment, suppliedClient) => {
          clientsSeen.push(suppliedClient);
          return authService;
        },
        createNotificationService: (_storage, _values, _environment, suppliedClient) => {
          clientsSeen.push(suppliedClient);
          return notificationService;
        },
        createPremiumService: () => premiumService,
        createRepository: (_storage, _values, _environment, suppliedClient) => {
          clientsSeen.push(suppliedClient);
          return repository;
        },
        createSupabaseClient: () => client,
      },
    );

    expect(runtime).toEqual({
      accountService,
      environment: {
        deployment: 'development',
        mode: 'connected',
        publicAppUrl: 'http://localhost:8081',
        supportEmail: 'support@kin.invalid',
        supabasePublishableKey: 'eyJ-development-test-key',
        supabaseUrl: 'http://127.0.0.1:54321',
      },
      authService,
      notificationService,
      premiumService,
      repository,
      status: 'ready',
    });
    expect(clientsSeen).toEqual([client, client, client, client]);
  });
});
