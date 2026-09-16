import type { SupabaseClient } from '@supabase/supabase-js';

import type { KinEnvironment, EnvironmentValues } from '@/config/environment';
import { ConfigurationError, readEnvironment } from '@/config/environment';
import type { KinRepository, StorageAdapter } from '@/data/contracts';
import { createDemoKinRepository } from '@/data/demo/DemoKinRepository';
import { createSupabaseClient } from '@/data/supabase/client';
import type { Database } from '@/data/supabase/database.types';
import { createSupabaseKinRepository } from '@/data/supabase/SupabaseKinRepository';
import type { AuthService } from '@/services/auth/contracts';
import { createDemoAuthService } from '@/services/auth/demo';
import { createSupabaseAuthService } from '@/services/auth/supabase';
import type { PremiumService } from '@/services/billing/contracts';
import { createPremiumService } from '@/services/billing';

export type AppRuntime =
  | {
      status: 'ready';
      environment: KinEnvironment;
      authService: AuthService;
      repository: KinRepository;
      premiumService: PremiumService;
    }
  | { status: 'configuration-error'; error: ConfigurationError };

interface RuntimeFactories {
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
  values: EnvironmentValues = process.env,
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
