import { useRouter } from 'expo-router';

import { KinPlusScreen } from '@/features/premium/KinPlusScreen';

export default function KinPlusRoute() {
  const router = useRouter();
  return <KinPlusScreen onClose={() => router.back()} />;
}
