import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { ScreenState } from '@/components/ScreenState';
import { colors, relationshipThemes, spacing } from '@/design/tokens';
import type { MediaPicker } from '@/services/media/contracts';
import { useKin } from '@/state/useKin';
import { Composer } from './Composer';
import { MessageActionSheet } from './MessageActionSheet';
import { MessageList } from './MessageList';
import { StickerPicker } from './StickerPicker';

interface ChatScreenProps {
  spaceId: string;
  mediaPicker: MediaPicker;
  onOpenRelationship: () => void;
  onRemember?: (messageId: string) => void;
}

export function ChatScreen({
  mediaPicker,
  onOpenRelationship,
  onRemember,
  spaceId,
}: ChatScreenProps) {
  const kin = useKin();
  const [text, setText] = useState('');
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [showStickers, setShowStickers] = useState(false);
  const [notice, setNotice] = useState('');

  if (kin.status === 'loading') return <ScreenState message="Opening your conversation…" title="Jamie" />;
  const snapshot = kin.snapshot;
  const currentUserId = snapshot?.currentUserId;
  const space = snapshot?.spaces.find((item) => item.id === spaceId);
  if (!snapshot || !currentUserId || !space) {
    return <ScreenState message="This relationship may have been archived or removed." title="Kin Space not found" />;
  }

  const otherMember = snapshot.members.find(
    (member) => member.spaceId === spaceId && member.userId !== currentUserId,
  );
  const partner = snapshot.profiles.find((profile) => profile.id === otherMember?.userId);
  const partnerName = space.preferencesByUser[currentUserId]?.nickname || partner?.displayName || 'Your person';
  const theme =
    relationshipThemes.find((item) => item.id === space.preferencesByUser[currentUserId]?.themeId) ??
    relationshipThemes[0];
  const messages = snapshot.messages.filter((message) => message.spaceId === spaceId);

  async function sendText() {
    const body = text.trim();
    if (!body) return;
    setText('');
    setNotice('');
    try {
      await kin.sendMessage({ spaceId, kind: 'text', body });
    } catch (reason) {
      setText(body);
      setNotice(reason instanceof Error ? reason.message : 'Kin could not send that message.');
    }
  }

  async function sendPhoto() {
    setNotice('');
    try {
      const image = await mediaPicker.pickImage();
      if (!image) return;
      await kin.sendMessage({
        spaceId,
        kind: 'image',
        body: 'Shared photo',
        mediaUri: image.uri,
      });
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Kin could not open that photo.');
    }
  }

  async function sendSticker(stickerId: string) {
    setShowStickers(false);
    await kin.sendMessage({
      spaceId,
      kind: 'sticker',
      body: stickerId === 'sticker-jamie-chef' ? 'Jamie cooking' : 'Relationship sticker',
      mediaUri: `asset://kin/${stickerId}`,
    });
  }

  async function react(emoji: string) {
    const messageId = selectedMessageId;
    setSelectedMessageId(null);
    if (messageId) await kin.addReaction({ messageId, emoji });
  }

  function remember() {
    const messageId = selectedMessageId;
    setSelectedMessageId(null);
    if (messageId) onRemember?.(messageId);
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: theme.wallpaper }]}>
      <View style={styles.header}>
        <Avatar accent={theme.accent} name={partnerName} size={42} />
        <View style={styles.identity}>
          <Text style={styles.name}>{partnerName}</Text>
          <Text style={styles.status}>your Kin Space</Text>
        </View>
        <Pressable
          accessibilityLabel={`Relationship with ${partnerName}`}
          accessibilityRole="button"
          onPress={onOpenRelationship}
          style={styles.relationshipButton}
        >
          <Text style={[styles.relationshipGlyph, { color: theme.accent }]}>⌁</Text>
        </Pressable>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.body}>
        <MessageList
          currentUserId={currentUserId}
          messages={messages}
          onOpenActions={setSelectedMessageId}
          onRetry={(messageId) => void kin.retryMessage(messageId)}
          partnerName={partnerName}
        />
        {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
        <Composer
          onChangeText={setText}
          onPhoto={() => void sendPhoto()}
          onSend={() => void sendText()}
          onSticker={() => setShowStickers(true)}
          partnerName={partnerName}
          text={text}
        />
      </KeyboardAvoidingView>
      <StickerPicker
        onClose={() => setShowStickers(false)}
        onSend={(stickerId) => void sendSticker(stickerId)}
        visible={showStickers}
      />
      <MessageActionSheet
        onClose={() => setSelectedMessageId(null)}
        onReact={(emoji) => void react(emoji)}
        onRemember={remember}
        visible={selectedMessageId !== null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  header: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,253,249,0.94)',
    borderBottomColor: colors.keyline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  identity: { flex: 1, marginLeft: spacing.md },
  name: { color: colors.plumInk, fontSize: 17, fontWeight: '800' },
  notice: {
    backgroundColor: '#FBE9E8',
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  relationshipButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  relationshipGlyph: { fontSize: 28, fontWeight: '800' },
  screen: { flex: 1 },
  status: { color: colors.mutedInk, fontSize: 11, marginTop: 2 },
});
