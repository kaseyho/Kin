import { Redirect, type Href, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';

import { ScreenState } from '@/components/ScreenState';
import { readDemoDate } from '@/config/demoDate';
import { resolveEntryRoute } from '@/navigation/resolveEntryRoute';
import { useAuth } from '@/state/useAuth';
import { useKin } from '@/state/useKin';

export default function IndexRoute() {
  const auth = useAuth();
  const kin = useKin();
  const params = useLocalSearchParams<{ demo?: string; demoDate?: string }>();
  const demoDate = readDemoDate(params.demoDate);
  const startedDemo = useRef(false);

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
    || (kin.mode === 'demo' && params.demo === 'story' && !kin.snapshot?.currentUserId)
  ) {
    return <ScreenState message="Bringing your people close…" title="Opening Kin" />;
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
