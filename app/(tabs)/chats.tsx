import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';

import { ChatListScreen } from '@/features/chats/ChatListScreen';

export default function ChatsRoute() {
  const router = useRouter();
  return (
    <ChatListScreen
      onNewSpace={() => router.push('/space/new')}
      onOpenSpace={(spaceId) => router.push(`/space/${spaceId}` as Href)}
    />
  );
}
