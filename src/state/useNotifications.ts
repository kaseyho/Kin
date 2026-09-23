import { useContext } from 'react';

import { NotificationContext } from './NotificationProvider';

export function useNotifications() {
  return useContext(NotificationContext);
}
