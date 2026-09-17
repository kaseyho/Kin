import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

import { AuthScreen } from '@/features/auth/AuthScreen';
import { readPendingInviteDestination } from '@/features/invitations/invitationNavigation';

export default function AuthRoute() {
  const router = useRouter();

  async function continueAfterSignIn() {
    const invitation = await readPendingInviteDestination(AsyncStorage);
    router.replace(invitation ?? '/');
  }

  return <AuthScreen onSignedIn={() => void continueAfterSignIn()} />;
}
