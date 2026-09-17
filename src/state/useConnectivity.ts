import { useContext } from 'react';

import { ConnectivityContext } from './ConnectivityProvider';

export function useConnectivity() {
  return useContext(ConnectivityContext);
}
