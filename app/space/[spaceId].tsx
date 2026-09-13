import { useLocalSearchParams, useRouter } from 'expo-router';

import { ChatScreen } from '@/features/chats/ChatScreen';
import { expoMediaPicker } from '@/services/media/expo';

export default function SpaceRoute() {
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const router = useRouter();
  return (
    <ChatScreen
      mediaPicker={expoMediaPicker}
      onOpenRelationship={() =>
        router.push({ pathname: '/space/[spaceId]/relationship', params: { spaceId } })
      }
      spaceId={spaceId}
    />
  );
}
