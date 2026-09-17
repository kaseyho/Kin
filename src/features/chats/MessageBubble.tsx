import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { KeptCorner } from '@/components/KeptCorner';
import { kinImageSource } from '@/design/assets';
import { colors, radii, spacing, typography } from '@/design/tokens';
import type { Message } from '@/domain/models';

interface MessageBubbleProps {
  bubbleRef?: (node: View | null) => void;
  currentUserId: string;
  message: Message;
  senderName: string;
  isRemembered?: boolean;
  onOpenActions: () => void;
  onRetry: () => void;
  onRemove: () => void;
}

export function MessageBubble({
  bubbleRef,
  currentUserId,
  isRemembered = false,
  message,
  onOpenActions,
  onRemove,
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
  const webContextMenuProps = Platform.OS === 'web'
    ? ({
        onContextMenu: (event: { preventDefault: () => void }) => {
          event.preventDefault();
          onOpenActions();
        },
      } as object)
    : {};

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
        onPress={Platform.OS === 'web' ? onOpenActions : undefined}
        ref={bubbleRef}
        style={({ pressed }) => [
          styles.bubble,
          mine ? styles.mineBubble : styles.theirBubble,
          pressed && styles.pressed,
        ]}
        {...webContextMenuProps}
      >
        {isRemembered ? <KeptCorner /> : null}
        {message.kind === 'image' && message.mediaUri ? (
          <>
            <Image
              accessibilityLabel={`Image message: ${contentLabel}`}
              resizeMode="cover"
              source={kinImageSource(message.mediaUri)}
              style={styles.image}
            />
            <Text style={[styles.imageCaption, mine && styles.mineBody]}>{message.body}</Text>
          </>
        ) : message.kind === 'sticker' ? (
          <Image
            accessibilityLabel="Sticker message: Jamie cooking"
            source={kinImageSource(message.mediaUri ?? 'asset://kin/sticker-jamie-chef')}
            style={styles.stickerImage}
          />
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
        <View accessibilityLabel="Message not sent" style={styles.failedRow}>
          <Text style={styles.retryText}>Not sent</Text>
          <Pressable
            accessibilityLabel="Retry message"
            accessibilityRole="button"
            onPress={onRetry}
            style={styles.failedAction}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Remove failed message"
            accessibilityRole="button"
            onPress={onRemove}
            style={styles.failedAction}
          >
            <Text style={styles.removeText}>Remove</Text>
          </Pressable>
        </View>
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
  body: { color: colors.plumInk, fontFamily: typography.body, fontSize: 16, lineHeight: 22 },
  bubble: { maxWidth: '82%', overflow: 'hidden', padding: spacing.md },
  image: { backgroundColor: colors.keyline, borderRadius: radii.md, height: 190, width: 230 },
  imageCaption: { color: colors.plumInk, fontFamily: typography.body, fontSize: 13, lineHeight: 18, marginTop: spacing.sm },
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
  failedAction: { justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.sm },
  failedRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, minHeight: 44 },
  removeText: { color: colors.mutedInk, fontSize: 12, fontWeight: '700' },
  retryText: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  row: { marginVertical: 4, width: '100%' },
  stickerImage: { height: 156, width: 156 },
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
