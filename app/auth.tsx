import { useRouter } from 'expo-router';

import { AuthScreen } from '@/features/auth/AuthScreen';

export default function AuthRoute() {
  const router = useRouter();
  return <AuthScreen onSignedIn={() => router.replace('/')} />;
}
