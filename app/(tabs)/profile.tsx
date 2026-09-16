import { useRouter } from 'expo-router';

import { ProfileScreen } from '@/features/profile/ProfileScreen';

export default function ProfileRoute() {
  const router = useRouter();
  return (
    <ProfileScreen
      onOpenKinPlus={() => router.push('/kin-plus')}
      onSignedOut={() => router.replace('/')}
    />
  );
}
