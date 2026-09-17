import { mapNetInfoState } from '../netinfo';

describe('connectivity mapping', () => {
  it.each([
    [{ isConnected: false, isInternetReachable: false }, 'offline'],
    [{ isConnected: true, isInternetReachable: false }, 'offline'],
    [{ isConnected: true, isInternetReachable: true }, 'online'],
    [{ isConnected: true, isInternetReachable: null }, 'online'],
    [{ isConnected: null, isInternetReachable: null }, 'reconnecting'],
  ] as const)('maps %o to %s', (state, expected) => {
    expect(mapNetInfoState(state)).toBe(expected);
  });
});
