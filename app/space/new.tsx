import { useRouter } from 'expo-router';

import { CreateJoinSpaceScreen } from '@/features/spaces/CreateJoinSpaceScreen';

export default function NewSpaceRoute() {
  const router = useRouter();
  return (
    <CreateJoinSpaceScreen
      onSpaceReady={(spaceId) => router.replace({ pathname: '/space/[spaceId]', params: { spaceId } })}
    />
  );
}
