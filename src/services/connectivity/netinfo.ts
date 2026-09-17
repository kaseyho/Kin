import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

import type { ConnectivityService, NetworkStatus } from './contracts';

export function mapNetInfoState(state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): NetworkStatus {
  if (state.isConnected === false || state.isInternetReachable === false) return 'offline';
  if (state.isConnected === true) return 'online';
  return 'reconnecting';
}

export function createNetInfoConnectivityService(): ConnectivityService {
  return {
    async getCurrentStatus() {
      return mapNetInfoState(await NetInfo.fetch());
    },
    subscribe(listener) {
      return NetInfo.addEventListener((state) => listener(mapNetInfoState(state)));
    },
  };
}
