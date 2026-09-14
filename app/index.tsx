import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';

import { ScreenState } from '@/components/ScreenState';
import { readDemoDate } from '@/config/demoDate';
import { useKin } from '@/state/useKin';

export default function IndexRoute() {
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

  if (
    kin.status === 'loading'
    || (kin.mode === 'demo' && params.demo === 'story' && !kin.snapshot?.currentUserId)
  ) {
    return <ScreenState message="Bringing your people close…" title="Opening Kin" />;
  }
  if (!kin.snapshot?.currentUserId) return <Redirect href="/onboarding" />;
  return (
    <Redirect
      href={demoDate
        ? { pathname: '/(tabs)/chats', params: { demoDate } }
        : '/(tabs)/chats'}
    />
  );
}
