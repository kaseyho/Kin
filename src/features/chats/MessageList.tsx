import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/design/tokens';
import type { Message } from '@/domain/models';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  currentUserId: string;
  messages: readonly Message[];
  partnerName: string;
  rememberedMessageIds?: ReadonlySet<string>;
  onOpenActions: (messageId: string) => void;
  onMessageRef?: (messageId: string, node: View | null) => void;
  onRetry: (messageId: string) => void;
  onRemove: (messageId: string) => void;
  hasOlderMessages?: boolean;
  historyStatus?: 'idle' | 'loading' | 'error';
  onLoadOlder?: () => void;
  showBeginning?: boolean;
}

export function MessageList({
  currentUserId,
  messages,
  onOpenActions,
  onMessageRef,
  onRemove,
  onRetry,
  hasOlderMessages = false,
  historyStatus = 'idle',
  onLoadOlder,
  partnerName,
  rememberedMessageIds = new Set(),
  showBeginning = false,
}: MessageListProps) {
  const ordered = [...messages].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
      style={styles.list}
    >
      {hasOlderMessages || historyStatus !== 'idle' ? (
        <View style={styles.historyControl}>
          {historyStatus === 'loading' ? (
            <Text accessibilityLiveRegion="polite" style={styles.historyText}>Loading earlier messages…</Text>
          ) : (
            <Pressable
              accessibilityLabel={historyStatus === 'error' ? 'Retry loading earlier messages' : 'Load earlier messages'}
              accessibilityRole="button"
              onPress={onLoadOlder}
              style={styles.historyButton}
            >
              <Text style={styles.historyButtonText}>
                {historyStatus === 'error' ? 'Couldn’t load earlier messages. Retry' : 'Load earlier messages'}
              </Text>
            </Pressable>
          )}
        </View>
      ) : showBeginning ? (
        <Text accessibilityLabel="Beginning of conversation" style={styles.historyText}>
          Beginning of conversation
        </Text>
      ) : null}
      {ordered.map((message, index) => {
        const calendarDate = message.createdAt.slice(0, 10);
        const previousDate = ordered[index - 1]?.createdAt.slice(0, 10);
        const showDate = calendarDate !== previousDate;
        return (
          <View key={message.id}>
            {showDate ? <Text style={styles.date}>{formatDate(message.createdAt)}</Text> : null}
            <MessageBubble
              bubbleRef={(node) => onMessageRef?.(message.id, node)}
              currentUserId={currentUserId}
              isRemembered={rememberedMessageIds.has(message.id)}
              message={message}
              onOpenActions={() => onOpenActions(message.id)}
              onRemove={() => onRemove(message.id)}
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
  historyButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  historyButtonText: { color: colors.rose, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  historyControl: { alignItems: 'center', marginBottom: spacing.sm, minHeight: 44 },
  historyText: { color: colors.mutedInk, fontSize: 13, paddingVertical: spacing.md },
  list: { flex: 1 },
});
