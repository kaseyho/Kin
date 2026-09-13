import type { KinRepository, StorageAdapter } from '../contracts';
import { createRepository } from '../createRepository';

const storage: StorageAdapter = {
  getItem: async () => null,
  removeItem: async () => undefined,
  setItem: async () => undefined,
};

const repository = {} as KinRepository;

it('selects demo unless connected public configuration is complete', () => {
  const createDemo = jest.fn(() => repository);
  const createConnected = jest.fn(() => repository);

  createRepository(storage, {}, { createConnected, createDemo });
  expect(createDemo).toHaveBeenCalledTimes(1);
  expect(createConnected).not.toHaveBeenCalled();

  createRepository(storage, {
    EXPO_PUBLIC_SUPABASE_URL: 'https://kin.supabase.co',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
  }, { createConnected, createDemo });
  expect(createConnected).toHaveBeenCalledWith({
    publishableKey: 'sb_publishable_example',
    storage,
    url: 'https://kin.supabase.co',
  });
});
