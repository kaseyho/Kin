import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { RelationshipPanel } from '@/features/spaces/RelationshipPanel';
import { readDemoDate } from '@/config/demoDate';

export default function RelationshipRoute() {
  const { demoDate: rawDemoDate, spaceId } = useLocalSearchParams<{ demoDate?: string; spaceId: string }>();
  const demoDate = readDemoDate(rawDemoDate);
  const router = useRouter();
  return (
    <RelationshipPanel
      onBack={() => router.back()}
      onOpenKinPlus={() => router.push('/kin-plus' as Href)}
      onOpenMemory={(memoryId) => router.push(`/moment/${memoryId}` as Href)}
      onOpenTimeline={() => router.push(demoDate
        ? { pathname: '/space/[spaceId]/timeline', params: { demoDate, spaceId } }
        : `/space/${spaceId}/timeline` as Href)}
      onSpaceUnavailable={() => router.replace('/(tabs)/chats')}
      spaceId={spaceId}
      today={demoDate}
    />
  );
}
