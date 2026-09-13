import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import type { StorageAdapter } from '@/data/contracts';
import { createDemoKinRepository } from '@/data/demo/DemoKinRepository';
import { KinProvider } from '@/state/KinProvider';

export function createTestRepository() {
  let value: string | null = null;
  let sequence = 0;
  const storage: StorageAdapter = {
    getItem: async () => value,
    setItem: async (_key, next) => {
      value = next;
    },
    removeItem: async () => {
      value = null;
    },
  };

  return createDemoKinRepository(storage, {
    id: (kind) => `${kind}-${++sequence}`,
    inviteCode: () => 'KIN123',
    now: () => '2026-09-13T08:00:00.000Z',
  });
}

export async function renderKin(ui: ReactElement, repository = createTestRepository()) {
  const result = await render(<KinProvider repository={repository}>{ui}</KinProvider>);
  return { ...result, repository };
}
