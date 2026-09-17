import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { readEnvironment } from '@/config/environment';
import { InvitationScreen } from '@/features/invitations/InvitationScreen';
import { useAuth } from '@/state/useAuth';

export default function InvitationRoute() {
  const auth = useAuth();
  const router = useRouter();
  const publicAppUrl = readEnvironment().publicAppUrl;
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const inviteCode = Array.isArray(params.code) ? params.code[0] ?? '' : params.code ?? '';

  return (
    <InvitationScreen
      authStatus={auth.state.status}
      inviteCode={inviteCode}
      onAuthenticationRequired={() => router.replace('/auth')}
      onDismiss={() => router.replace('/')}
      onInvitationChanged={(code) => router.setParams({ code })}
      onProfileRequired={() => router.replace('/onboarding')}
      onSpaceReady={(spaceId) => router.replace({ pathname: '/space/[spaceId]', params: { spaceId } })}
      publicAppUrl={publicAppUrl}
      storage={AsyncStorage}
    />
  );
}
