import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import type { StorageAdapter } from '@/data/contracts';
import { createDemoKinRepository } from '@/data/demo/DemoKinRepository';
import { KinProvider } from '../KinProvider';
import { useKin } from '../useKin';

const storage: StorageAdapter = {
  getItem: async () => null,
  setItem: async () => undefined,
  removeItem: async () => undefined,
};

function Probe() {
  const kin = useKin();
  return <Text>{`${kin.status}:${kin.snapshot?.currentUserId ?? 'none'}`}</Text>;
}

describe('KinProvider', () => {
  it('loads an empty first run and publishes the explicit demo reset', async () => {
    const repository = createDemoKinRepository(storage);
    await render(
      <KinProvider repository={repository}>
        <Probe />
      </KinProvider>,
    );

    expect(await screen.findByText('ready:none')).toBeTruthy();
    await act(async () => {
      await repository.resetDemo();
    });
    expect(await screen.findByText('ready:maya')).toBeTruthy();
  });
});
