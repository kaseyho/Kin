import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { readEnvironment } from '@/config/environment';
import { InvitationScreen } from '@/features/invitations/InvitationScreen';
import { useAuth } from '@/state/useAuth';
import { useKin } from '@/state/useKin';

export default function SpaceInvitationRoute() {
  const auth = useAuth();
  const kin = useKin();
  const router = useRouter();
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const publicAppUrl = readEnvironment().publicAppUrl;
  const inviteCode = kin.snapshot?.spaces.find((space) => space.id === spaceId)
    ?.activeInvitation?.code ?? '';

  return (
    <InvitationScreen
      authStatus={auth.state.status}
      hostSpaceId={spaceId}
      inviteCode={inviteCode}
      onAuthenticationRequired={() => router.replace('/auth')}
      onDismiss={() => router.replace('/(tabs)/chats')}
      onProfileRequired={() => router.replace('/onboarding')}
      onSpaceReady={(id) => router.replace({ pathname: '/space/[spaceId]', params: { spaceId: id } })}
      publicAppUrl={publicAppUrl}
      storage={AsyncStorage}
    />
  );
}
