import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import type { ConnectivityService, NetworkStatus } from '@/services/connectivity/contracts';
import { ConnectivityProvider } from '../ConnectivityProvider';
import { useConnectivity } from '../useConnectivity';

function Probe() {
  return <Text>{useConnectivity().phase}</Text>;
}

it('exposes offline, restored, and settled-online phases without polling', async () => {
  jest.useFakeTimers();
  let listener: ((status: NetworkStatus) => void) | undefined;
  const service: ConnectivityService = {
    getCurrentStatus: async () => 'offline',
    subscribe: (next) => {
      listener = next;
      return () => { listener = undefined; };
    },
  };
  await render(
    <ConnectivityProvider service={service}>
      <Probe />
    </ConnectivityProvider>,
  );

  expect(await screen.findByText('offline')).toBeTruthy();
  await act(async () => listener?.('online'));
  expect(screen.getByText('restored')).toBeTruthy();
  await act(async () => jest.advanceTimersByTime(2500));
  expect(screen.getByText('online')).toBeTruthy();
  jest.useRealTimers();
});
