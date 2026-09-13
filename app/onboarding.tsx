import { useRouter } from 'expo-router';

import { OnboardingScreen } from '@/features/onboarding/OnboardingScreen';

export default function OnboardingRoute() {
  const router = useRouter();
  return (
    <OnboardingScreen
      onComplete={() => router.replace('/space/new')}
      onTryDemo={() => router.replace('/(tabs)/chats')}
    />
  );
}
