import { readEnvironment } from '@/config/environment';
import type { KinRepository, StorageAdapter } from './contracts';
import { createDemoKinRepository } from './demo/DemoKinRepository';
import { createSupabaseClient } from './supabase/client';
import { createSupabaseKinRepository } from './supabase/SupabaseKinRepository';

interface ConnectedOptions {
  publishableKey: string;
  storage: StorageAdapter;
  url: string;
}

interface RepositoryFactories {
  createDemo: (storage: StorageAdapter) => KinRepository;
  createConnected: (options: ConnectedOptions) => KinRepository;
}

const defaultFactories: RepositoryFactories = {
  createDemo: createDemoKinRepository,
  createConnected: ({ publishableKey, storage, url }) =>
    createSupabaseKinRepository(createSupabaseClient({ publishableKey, storage, url })),
};

export function createRepository(
  storage: StorageAdapter,
  values: Record<string, string | undefined> = process.env,
  factories: RepositoryFactories = defaultFactories,
): KinRepository {
  const environment = readEnvironment(values);
  if (environment.mode === 'demo') return factories.createDemo(storage);
  return factories.createConnected({
    publishableKey: environment.supabasePublishableKey,
    storage,
    url: environment.supabaseUrl,
  });
}
