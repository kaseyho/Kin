import { useContext } from 'react';

import { PremiumContext } from './PremiumProvider';

export function usePremiumGate() {
  return useContext(PremiumContext);
}
