import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/design/tokens';
import type { Message } from '@/domain/models';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  currentUserId: string;
  messages: readonly Message[];
  partnerName: string;
  onOpenActions: (messageId: string) => void;
  onRetry: (messageId: string) => void;
}

export function MessageList({
  currentUserId,
  messages,
  onOpenActions,
  onRetry,
  partnerName,
}: MessageListProps) {
  const ordered = [...messages].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.list}>
      {ordered.map((message, index) => {
        const calendarDate = message.createdAt.slice(0, 10);
        const previousDate = ordered[index - 1]?.createdAt.slice(0, 10);
        const showDate = calendarDate !== previousDate;
        return (
          <View key={message.id}>
            {showDate ? <Text style={styles.date}>{formatDate(message.createdAt)}</Text> : null}
            <MessageBubble
              currentUserId={currentUserId}
              message={message}
              onOpenActions={() => onOpenActions(message.id)}
              onRetry={() => onRetry(message.id)}
              senderName={partnerName}
            />
          </View>
        );
      })}
    </ScrollView>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(value),
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  date: {
    color: colors.mutedInk,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  list: { flex: 1 },
});
