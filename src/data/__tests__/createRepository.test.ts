import type { KinRepository, StorageAdapter } from '../contracts';
import { createRepository } from '../createRepository';

const storage: StorageAdapter = {
  getItem: async () => null,
  removeItem: async () => undefined,
  setItem: async () => undefined,
};

const repository = {} as KinRepository;

it('selects only the explicitly configured repository', () => {
  const createDemo = jest.fn(() => repository);
  const createConnected = jest.fn(() => repository);
  const factories = { createConnected, createDemo };

  expect(() => createRepository(storage, {}, factories))
    .toThrow('Set EXPO_PUBLIC_KIN_ENVIRONMENT');

  createRepository(storage, {
    EXPO_PUBLIC_KIN_ENVIRONMENT: 'demo',
  }, factories);
  expect(createDemo).toHaveBeenCalledTimes(1);
  expect(createConnected).not.toHaveBeenCalled();

  createRepository(storage, {
    EXPO_PUBLIC_KIN_ENVIRONMENT: 'preview',
    EXPO_PUBLIC_SUPABASE_URL: 'https://kin.supabase.co',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
  }, factories);
  expect(createConnected).toHaveBeenCalledWith({
    publishableKey: 'sb_publishable_example',
    storage,
    url: 'https://kin.supabase.co',
  });
});
