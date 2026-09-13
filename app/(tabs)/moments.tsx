import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';

import { MomentsFeedScreen } from '@/features/moments/MomentsFeedScreen';

export default function MomentsRoute() {
  const router = useRouter();
  return <MomentsFeedScreen onOpenMemory={(memoryId) => router.push(`/moment/${memoryId}` as Href)} />;
}
