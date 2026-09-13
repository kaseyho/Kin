import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { KeptCorner } from '@/components/KeptCorner';
import { colors, radii, spacing } from '@/design/tokens';
import type { Message } from '@/domain/models';

interface MessageBubbleProps {
  currentUserId: string;
  message: Message;
  senderName: string;
  isRemembered?: boolean;
  onOpenActions: () => void;
  onRetry: () => void;
}

export function MessageBubble({
  currentUserId,
  isRemembered = false,
  message,
  onOpenActions,
  onRetry,
  senderName,
}: MessageBubbleProps) {
  const mine = message.senderId === currentUserId;
  const contentLabel =
    message.kind === 'image'
      ? message.body || 'Shared photo'
      : message.kind === 'sticker'
        ? 'Jamie cooking'
        : message.body;
  const labelSeparator = /[.!?]$/.test(contentLabel) ? ' ' : '. ';
  const accessibleMessage = `${mine ? 'Your message' : `Message from ${senderName}`}: ${contentLabel}${labelSeparator}Actions available`;

  return (
    <View style={[styles.row, mine ? styles.mineRow : styles.theirRow]}>
      <Pressable
        accessibilityActions={[{ name: 'activate', label: 'Open message actions' }]}
        accessibilityLabel={accessibleMessage}
        accessibilityRole="button"
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'activate') onOpenActions();
        }}
        onLongPress={onOpenActions}
        style={({ pressed }) => [
          styles.bubble,
          mine ? styles.mineBubble : styles.theirBubble,
          pressed && styles.pressed,
        ]}
      >
        {isRemembered ? <KeptCorner /> : null}
        {message.kind === 'image' && message.mediaUri ? (
          <Image
            accessibilityLabel={`Image message: ${contentLabel}`}
            resizeMode="cover"
            source={{ uri: message.mediaUri }}
            style={styles.image}
          />
        ) : message.kind === 'sticker' ? (
          <View
            accessibilityLabel="Sticker message: Jamie cooking"
            accessible
            style={styles.sticker}
          >
            <Text style={styles.stickerEmoji}>🍳</Text>
            <Text style={styles.stickerWord}>chef jamie</Text>
          </View>
        ) : (
          <Text style={[styles.body, mine && styles.mineBody]}>{message.body}</Text>
        )}
        <View style={styles.metaRow}>
          <Text style={[styles.time, mine && styles.mineTime]}>{formatTime(message.createdAt)}</Text>
          {mine && message.deliveryState === 'sending' ? (
            <Text accessibilityLabel="Sending" style={[styles.time, styles.mineTime]}>Sending</Text>
          ) : null}
          {mine && message.deliveryState === 'sent' ? (
            <Text accessibilityLabel="Sent" style={[styles.time, styles.mineTime]}>Sent</Text>
          ) : null}
        </View>
      </Pressable>
      {message.reactions.length > 0 ? (
        <View style={[styles.reactions, mine ? styles.reactionsMine : styles.reactionsTheirs]}>
          {groupReactions(message).map((reaction) => (
            <Text key={reaction.emoji} style={styles.reactionText}>
              {reaction.emoji} {reaction.count}
            </Text>
          ))}
        </View>
      ) : null}
      {mine && message.deliveryState === 'failed' ? (
        <Pressable
          accessibilityLabel="Not sent. Tap to retry"
          accessibilityRole="button"
          onPress={onRetry}
          style={styles.retry}
        >
          <Text style={styles.retryText}>Not sent. Tap to retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function groupReactions(message: Message): { emoji: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const reaction of message.reactions) {
    counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1);
  }
  return [...counts].map(([emoji, count]) => ({ emoji, count }));
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(
    new Date(value),
  );
}

const styles = StyleSheet.create({
  body: { color: colors.plumInk, fontSize: 16, lineHeight: 22 },
  bubble: { maxWidth: '82%', overflow: 'hidden', padding: spacing.md },
  image: { backgroundColor: colors.keyline, borderRadius: radii.md, height: 190, width: 230 },
  metaRow: { alignItems: 'center', flexDirection: 'row', gap: 6, justifyContent: 'flex-end', marginTop: 5 },
  mineBody: { color: colors.paper },
  mineBubble: { backgroundColor: colors.plumInk, borderBottomRightRadius: 6, borderRadius: radii.lg },
  mineRow: { alignItems: 'flex-end' },
  mineTime: { color: '#D9CDD3' },
  pressed: { opacity: 0.72 },
  reactionText: { color: colors.plumInk, fontSize: 12, fontWeight: '700' },
  reactions: {
    backgroundColor: colors.paper,
    borderColor: colors.keyline,
    borderRadius: radii.round,
    borderWidth: 1,
    marginTop: -6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  reactionsMine: { marginRight: spacing.sm },
  reactionsTheirs: { marginLeft: spacing.sm },
  retry: { minHeight: 34, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  retryText: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  row: { marginVertical: 4, width: '100%' },
  sticker: { alignItems: 'center', minWidth: 120, padding: spacing.sm },
  stickerEmoji: { fontSize: 52 },
  stickerWord: { color: colors.paper, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  theirBubble: {
    backgroundColor: colors.paper,
    borderBottomLeftRadius: 6,
    borderColor: colors.keyline,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  theirRow: { alignItems: 'flex-start' },
  time: { color: colors.mutedInk, fontSize: 10 },
});
