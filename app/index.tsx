import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect, type Href, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { ScreenState } from '@/components/ScreenState';
import { readDemoDate } from '@/config/demoDate';
import {
  readPendingInviteDestination,
  type PendingInviteDestination,
} from '@/features/invitations/invitationNavigation';
import {
  readPendingNotification,
  type PendingNotificationDestination,
} from '@/features/notifications/pendingNotification';
import { resolveEntryRoute } from '@/navigation/resolveEntryRoute';
import { useAuth } from '@/state/useAuth';
import { useKin } from '@/state/useKin';

export default function IndexRoute() {
  const auth = useAuth();
  const kin = useKin();
  const params = useLocalSearchParams<{ demo?: string; demoDate?: string }>();
  const demoDate = readDemoDate(params.demoDate);
  const startedDemo = useRef(false);
  const sessionKey = auth.state.status === 'signed-in'
    ? `user:${auth.state.user.id}`
    : auth.state.status === 'demo'
      ? 'demo'
      : null;
  const [pendingLookup, setPendingLookup] = useState<{
    inviteDestination: PendingInviteDestination | null;
    notificationDestination: PendingNotificationDestination | null;
    sessionKey: string;
  } | null>(null);

  useEffect(() => {
    if (!sessionKey) return;
    let active = true;
    void Promise.all([
      readPendingInviteDestination(AsyncStorage),
      readPendingNotification(AsyncStorage),
    ]).then(([inviteDestination, notificationDestination]) => {
      if (active) setPendingLookup({ inviteDestination, notificationDestination, sessionKey });
    });
    return () => {
      active = false;
    };
  }, [sessionKey]);

  useEffect(() => {
    if (
      params.demo === 'story' &&
      kin.mode === 'demo' &&
      kin.status === 'ready' &&
      !kin.snapshot?.currentUserId &&
      !startedDemo.current
    ) {
      startedDemo.current = true;
      void kin.resetDemo();
    }
  }, [kin, params.demo]);

  const entryRoute = resolveEntryRoute({
    authState: auth.state,
    kinStatus: kin.status,
    snapshot: kin.snapshot,
  });

  if (
    entryRoute === 'loading'
    || (sessionKey && pendingLookup?.sessionKey !== sessionKey)
    || (entryRoute === '/(tabs)/chats' && pendingLookup?.notificationDestination)
    || (kin.mode === 'demo' && params.demo === 'story' && !kin.snapshot?.currentUserId)
  ) {
    return <ScreenState message="Bringing your people close…" title="Opening Kin" />;
  }
  if (entryRoute === '/(tabs)/chats' && pendingLookup?.inviteDestination) {
    return <Redirect href={pendingLookup.inviteDestination} />;
  }
  if (entryRoute !== '/(tabs)/chats') return <Redirect href={entryRoute as Href} />;
  return (
    <Redirect
      href={demoDate
        ? { pathname: '/(tabs)/chats', params: { demoDate } }
        : '/(tabs)/chats'}
    />
  );
}
