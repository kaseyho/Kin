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

export type AppRuntime =
  | {
      status: 'ready';
      environment: KinEnvironment;
      accountService: AccountService;
      authService: AuthService;
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
  createSupabaseClient?: (options: {
    publishableKey: string;
    storage: StorageAdapter;
    url: string;
  }) => SupabaseClient<Database>;
}

const defaultFactories: RuntimeFactories = {
  createAccountService: (_storage, _values, environment, client) =>
    environment.mode === 'demo'
      ? createDemoAccountService()
      : createSupabaseAccountService(requireConnectedClient(client)),
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
    return {
      accountService: factories.createAccountService(storage, values, environment, client),
      authService: factories.createAuthService(storage, values, environment, client),
      environment,
      premiumService: factories.createPremiumService(storage, values, environment),
      repository: factories.createRepository(storage, values, environment, client),
      status: 'ready',
    };
  } catch (error) {
    if (error instanceof ConfigurationError) return { error, status: 'configuration-error' };
    throw error;
  }
}
