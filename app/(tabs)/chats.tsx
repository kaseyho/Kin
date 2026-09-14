import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { readDemoDate } from '@/config/demoDate';
import { ChatListScreen } from '@/features/chats/ChatListScreen';

export default function ChatsRoute() {
  const router = useRouter();
  const { demoDate: rawDemoDate } = useLocalSearchParams<{ demoDate?: string }>();
  const demoDate = readDemoDate(rawDemoDate);
  return (
    <ChatListScreen
      onNewSpace={() => router.push('/space/new')}
      onOpenSpace={(spaceId) => router.push(demoDate
        ? { pathname: '/space/[spaceId]', params: { demoDate, spaceId } }
        : `/space/${spaceId}` as Href)}
    />
  );
}
