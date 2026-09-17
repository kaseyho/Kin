import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

import { readPendingInviteDestination } from '@/features/invitations/invitationNavigation';
import { OnboardingScreen } from '@/features/onboarding/OnboardingScreen';

export default function OnboardingRoute() {
  const router = useRouter();

  async function continueAfterOnboarding() {
    const invitation = await readPendingInviteDestination(AsyncStorage);
    router.replace(invitation ?? '/space/new');
  }

  return (
    <OnboardingScreen
      onComplete={() => void continueAfterOnboarding()}
      onTryDemo={() => router.replace('/(tabs)/chats')}
    />
  );
}
