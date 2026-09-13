import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { TimelineScreen } from '@/features/moments/TimelineScreen';

export default function TimelineRoute() {
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const router = useRouter();
  return (
    <TimelineScreen
      onBack={() => router.back()}
      onOpenMemory={(memoryId) => router.push(`/moment/${memoryId}` as Href)}
      spaceId={spaceId}
    />
  );
}
