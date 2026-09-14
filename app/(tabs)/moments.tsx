import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { readDemoDate } from '@/config/demoDate';
import { MomentsFeedScreen } from '@/features/moments/MomentsFeedScreen';

export default function MomentsRoute() {
  const router = useRouter();
  const { demoDate: rawDemoDate } = useLocalSearchParams<{ demoDate?: string }>();
  return (
    <MomentsFeedScreen
      onOpenMemory={(memoryId) => router.push(`/moment/${memoryId}` as Href)}
      today={readDemoDate(rawDemoDate)}
    />
  );
}
