import { useContext } from 'react';

import { KinContext } from './KinProvider';

export function useKin() {
  const context = useContext(KinContext);
  if (!context) throw new Error('useKin must be used inside KinProvider');
  return context;
}
