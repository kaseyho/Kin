import { useRouter } from 'expo-router';

import { CreateJoinSpaceScreen } from '@/features/spaces/CreateJoinSpaceScreen';

export default function NewSpaceRoute() {
  const router = useRouter();
  return (
    <CreateJoinSpaceScreen
      onInvitationReady={(_code, spaceId) => router.replace({
        pathname: '/space/[spaceId]/invitation',
        params: { spaceId },
      })}
      onSpaceReady={(spaceId) => router.replace({ pathname: '/space/[spaceId]', params: { spaceId } })}
    />
  );
}
