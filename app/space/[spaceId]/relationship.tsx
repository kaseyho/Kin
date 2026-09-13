import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { RelationshipPanel } from '@/features/spaces/RelationshipPanel';

export default function RelationshipRoute() {
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const router = useRouter();
  return (
    <RelationshipPanel
      onBack={() => router.back()}
      onOpenKinPlus={() => router.push('/kin-plus' as Href)}
      onOpenTimeline={() => router.push(`/space/${spaceId}/timeline` as Href)}
      onSpaceUnavailable={() => router.replace('/(tabs)/chats')}
      spaceId={spaceId}
    />
  );
}
