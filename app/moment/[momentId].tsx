import { useLocalSearchParams, useRouter } from 'expo-router';

import { MomentDetailScreen } from '@/features/moments/MomentDetailScreen';

export default function MomentDetailRoute() {
  const { momentId } = useLocalSearchParams<{ momentId: string }>();
  const router = useRouter();
  return <MomentDetailScreen memoryId={momentId} onBack={() => router.back()} onDeleted={() => router.back()} />;
}
