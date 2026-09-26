import type { SupabaseClient } from '@supabase/supabase-js';

import type { KinEnvironment, EnvironmentValues } from '@/config/environment';
import {
  ConfigurationError,
  readEnvironment,
  readPublicEnvironmentValues,
} from '@/config/environment';
import type { KinRepository, StorageAdapter } from '@/data/contracts';
import { createDemoKinRepository } from '@/data/demo/DemoKinRepository';
import { createSupabaseClient } from '@/data/supabase/client';
import type { Database } from '@/data/supabase/database.types';
import { createSupabaseKinRepository } from '@/data/supabase/SupabaseKinRepository';
import type { AccountService } from '@/services/account/contracts';
import { createDemoAccountService } from '@/services/account/demo';
import { createSupabaseAccountService } from '@/services/account/supabase';
import type { AuthService } from '@/services/auth/contracts';
import { createDemoAuthService } from '@/services/auth/demo';
import { createSupabaseAuthService } from '@/services/auth/supabase';
import type { PremiumService } from '@/services/billing/contracts';
import { createPremiumService } from '@/services/billing';
import type { NotificationService } from '@/services/notifications/contracts';
import { createNotificationService } from '@/services/notifications';

export type AppRuntime =
  | {
      status: 'ready';
      environment: KinEnvironment;
      accountService: AccountService;
      authService: AuthService;
      notificationService: NotificationService;
      repository: KinRepository;
      premiumService: PremiumService;
    }
  | { status: 'configuration-error'; error: ConfigurationError };

interface RuntimeFactories {
  createAccountService: (
    storage: StorageAdapter,
    values: EnvironmentValues,
    environment: KinEnvironment,
    client?: SupabaseClient<Database>,
    notificationService?: NotificationService,
    premiumService?: PremiumService,
  ) => AccountService;
  createAuthService: (
    storage: StorageAdapter,
    values: EnvironmentValues,
    environment: KinEnvironment,
    client?: SupabaseClient<Database>,
  ) => AuthService;
  createRepository: (
    storage: StorageAdapter,
    values: EnvironmentValues,
    environment: KinEnvironment,
    client?: SupabaseClient<Database>,
  ) => KinRepository;
  createPremiumService: (
    storage: StorageAdapter,
    values: EnvironmentValues,
    environment: KinEnvironment,
  ) => PremiumService;
  createNotificationService: (
    storage: StorageAdapter,
    values: EnvironmentValues,
    environment: KinEnvironment,
    client?: SupabaseClient<Database>,
  ) => NotificationService;
  createSupabaseClient?: (options: {
    publishableKey: string;
    storage: StorageAdapter;
    url: string;
  }) => SupabaseClient<Database>;
}

const defaultFactories: RuntimeFactories = {
  createAccountService: (
    _storage,
    _values,
    environment,
    client,
    notificationService,
    premiumService,
  ) =>
    environment.mode === 'demo'
      ? createDemoAccountService()
      : createSupabaseAccountService(requireConnectedClient(client), {
          beforeDelete: async () => {
            await Promise.allSettled([
              notificationService?.deactivateCurrentInstallation() ?? Promise.resolve(),
              premiumService?.deactivateUser() ?? Promise.resolve(),
            ]);
          },
        }),
  createAuthService: (_storage, _values, environment, client) =>
    environment.mode === 'demo'
      ? createDemoAuthService()
      : createSupabaseAuthService(requireConnectedClient(client)),
  createRepository: (storage, _values, environment, client) =>
    environment.mode === 'demo'
      ? createDemoKinRepository(storage)
      : createSupabaseKinRepository(requireConnectedClient(client)),
  createPremiumService: (storage, values, environment) => createPremiumService({
    deployment: environment.deployment,
    storage,
    values,
  }),
  createNotificationService: (storage, _values, environment, client) => createNotificationService({
    client,
    deployment: environment.deployment,
    storage,
  }),
  createSupabaseClient,
};

function requireConnectedClient(
  client: SupabaseClient<Database> | undefined,
): SupabaseClient<Database> {
  if (!client) throw new Error('Connected Kin requires a shared Supabase client.');
  return client;
}

export function createAppRuntime(
  storage: StorageAdapter,
  values: EnvironmentValues = readPublicEnvironmentValues(),
  factories: RuntimeFactories = defaultFactories,
): AppRuntime {
  try {
    const environment = readEnvironment(values);
    const client = environment.mode === 'connected'
      ? (factories.createSupabaseClient ?? defaultFactories.createSupabaseClient)?.({
          publishableKey: environment.supabasePublishableKey,
          storage,
          url: environment.supabaseUrl,
        })
      : undefined;
    const premiumService = factories.createPremiumService(storage, values, environment);
    const notificationService = factories.createNotificationService(
      storage,
      values,
      environment,
      client,
    );
    const accountService = factories.createAccountService(
      storage,
      values,
      environment,
      client,
      notificationService,
      premiumService,
    );
    const authService = factories.createAuthService(storage, values, environment, client);
    const repository = factories.createRepository(storage, values, environment, client);
    return {
      accountService,
      authService,
      environment,
      notificationService,
      premiumService,
      repository,
      status: 'ready',
    };
  } catch (error) {
    if (error instanceof ConfigurationError) return { error, status: 'configuration-error' };
    throw error;
  }
}
