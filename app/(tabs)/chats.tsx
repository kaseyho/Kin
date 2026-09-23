import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { readDemoDate } from '@/config/demoDate';
import { ChatListScreen } from '@/features/chats/ChatListScreen';
import { clearPendingNotification } from '@/features/notifications/pendingNotification';

const NOTIFICATION_UNAVAILABLE_COPY = 'That conversation is no longer available. Your Chats are still here.';

export default function ChatsRoute() {
  const router = useRouter();
  const { demoDate: rawDemoDate, notice } = useLocalSearchParams<{
    demoDate?: string;
    notice?: string;
  }>();
  const demoDate = readDemoDate(rawDemoDate);
  return (
    <ChatListScreen
      notice={notice === 'notification-unavailable' ? NOTIFICATION_UNAVAILABLE_COPY : undefined}
      onDismissNotice={() => {
        void clearPendingNotification(AsyncStorage).finally(() => {
          router.replace(demoDate
            ? { pathname: '/(tabs)/chats', params: { demoDate } }
            : '/(tabs)/chats');
        });
      }}
      onNewSpace={() => router.push('/space/new')}
      onOpenSpace={(spaceId) => router.push(demoDate
        ? { pathname: '/space/[spaceId]', params: { demoDate, spaceId } }
        : `/space/${spaceId}` as Href)}
    />
  );
}
