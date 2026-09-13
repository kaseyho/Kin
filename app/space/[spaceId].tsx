import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Href } from 'expo-router';

import { ChatScreen } from '@/features/chats/ChatScreen';
import { expoMediaPicker } from '@/services/media/expo';

export default function SpaceRoute() {
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const router = useRouter();
  return (
    <ChatScreen
      mediaPicker={expoMediaPicker}
      onOpenKinPlus={() => router.push('/kin-plus' as Href)}
      onOpenRelationship={() =>
        router.push({ pathname: '/space/[spaceId]/relationship', params: { spaceId } })
      }
      spaceId={spaceId}
    />
  );
}
