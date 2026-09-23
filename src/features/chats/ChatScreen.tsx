import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  AppState,
  findNodeHandle,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { InlineNotice } from '@/components/InlineNotice';
import { ScreenState } from '@/components/ScreenState';
import { kinWallpaperSource } from '@/design/assets';
import { colors, relationshipThemes, spacing, typography } from '@/design/tokens';
import type { MemoryKind } from '@/domain/models';
import { MemoryEditorScreen } from '@/features/moments/MemoryEditorScreen';
import { RememberSheet } from '@/features/moments/RememberSheet';
import { ReportSheet } from '@/features/safety/ReportSheet';
import type { MediaPicker } from '@/services/media/contracts';
import { MediaPermissionError } from '@/services/media/contracts';
import { useKin } from '@/state/useKin';
import { useConnectivity } from '@/state/useConnectivity';
import { Composer } from './Composer';
import { ConversationStatusBanner } from './ConversationStatusBanner';
import { MessageActionSheet } from './MessageActionSheet';
import { MessageList } from './MessageList';
import { StickerPicker } from './StickerPicker';
import { NotificationEnablePrompt } from '@/features/notifications/NotificationEnablePrompt';

interface ChatScreenProps {
  spaceId: string;
  mediaPicker: MediaPicker;
  onOpenRelationship: () => void;
  onRemember?: (messageId: string) => void;
  onOpenKinPlus?: () => void;
}

export function ChatScreen({
  mediaPicker,
  onOpenRelationship,
  onOpenKinPlus,
  onRemember,
  spaceId,
}: ChatScreenProps) {
  const kin = useKin();
  const { markSpaceRead } = kin;
  const connectivity = useConnectivity();
  const [text, setText] = useState('');
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [showStickers, setShowStickers] = useState(false);
  const [rememberMessageId, setRememberMessageId] = useState<string | null>(null);
  const [rememberKind, setRememberKind] = useState<MemoryKind | null>(null);
  const [reportMessageId, setReportMessageId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [noticeAction, setNoticeAction] = useState<null | { label: string; onPress: () => void }>(null);
  const [historyStatus, setHistoryStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const messageRefs = useRef(new Map<string, View>());
  const loadingHistory = useRef(false);

  const snapshot = kin.snapshot;
  const currentUserId = snapshot?.currentUserId;
  const space = snapshot?.spaces.find((item) => item.id === spaceId);
  const spaceAvailable = Boolean(space);
  const latestPartnerMessageId = snapshot?.messages
    .filter((message) => message.spaceId === spaceId && message.senderId !== currentUserId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]?.id;

  useEffect(() => {
    if (!currentUserId || !spaceAvailable) return;
    const markRead = () => {
      void markSpaceRead(spaceId).catch(() => undefined);
    };
    markRead();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') markRead();
    });
    return () => subscription.remove();
  }, [currentUserId, latestPartnerMessageId, markSpaceRead, spaceAvailable, spaceId]);

  if (kin.status === 'loading') return <ScreenState message="Opening your conversation…" title="Jamie" />;
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
  const selectedMessage = messages.find((message) => message.id === selectedMessageId);
  const wallpaperSource = kinWallpaperSource(space.preferencesByUser[currentUserId]?.wallpaperId);
  const messagePage = snapshot.messagePages[spaceId];

  async function loadEarlierMessages() {
    if (loadingHistory.current) return;
    loadingHistory.current = true;
    setHistoryStatus('loading');
    try {
      await kin.loadOlderMessages(spaceId);
      setHistoryStatus('idle');
    } catch {
      setHistoryStatus('error');
    } finally {
      loadingHistory.current = false;
    }
  }

  async function sendText() {
    const body = text.trim();
    if (!body) return;
    setText('');
    setNotice('');
    setNoticeAction(null);
    try {
      await kin.sendMessage({ spaceId, kind: 'text', body });
    } catch (reason) {
      setText(body);
      setNotice(reason instanceof Error ? reason.message : 'Kin could not send that message.');
    }
  }

  async function sendPhoto() {
    setNotice('');
    setNoticeAction(null);
    try {
      const image = await mediaPicker.pickImage();
      if (!image) return;
      await kin.sendMessage({
        spaceId,
        kind: 'image',
        body: 'Shared photo',
        mediaUri: image.uri,
        mediaByteSize: image.byteSize,
        mediaMimeType: image.mimeType,
      });
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Kin could not open that photo.');
      if (reason instanceof MediaPermissionError) {
        setNoticeAction({ label: 'Open settings', onPress: () => void Linking.openSettings() });
      }
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
    if (!messageId) return;
    if (onRemember) onRemember(messageId);
    else setRememberMessageId(messageId);
  }

  function reportSelectedMessage() {
    const messageId = selectedMessageId;
    setSelectedMessageId(null);
    if (messageId) setReportMessageId(messageId);
  }

  function closeMessageReport() {
    const target = reportMessageId ? messageRefs.current.get(reportMessageId) : undefined;
    setReportMessageId(null);
    requestAnimationFrame(() => {
      if (Platform.OS === 'web') {
        (target as unknown as HTMLElement | undefined)?.focus?.();
        return;
      }
      const handle = findNodeHandle(target ?? null);
      if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
    });
  }

  function closeRememberFlow() {
    setRememberKind(null);
    setRememberMessageId(null);
  }

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.screen, { backgroundColor: theme.wallpaper }]}
      testID="chat-wallpaper"
    >
      {wallpaperSource ? (
        <View pointerEvents="none" style={styles.wallpaperLayer}>
          <Image
            accessible={false}
            resizeMode="cover"
            source={wallpaperSource}
            style={styles.wallpaperImage}
          />
        </View>
      ) : null}
      <View style={styles.header}>
        <Avatar accent={theme.accent} name={partnerName} size={42} uri={partner?.avatarUri} />
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
      <ConversationStatusBanner phase={connectivity.phase} />
      {otherMember ? <NotificationEnablePrompt partnerName={partnerName} /> : null}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.body}>
        <MessageList
          currentUserId={currentUserId}
          hasOlderMessages={messagePage?.hasOlderMessages}
          historyStatus={historyStatus}
          messages={messages}
          onLoadOlder={() => void loadEarlierMessages()}
          onOpenActions={setSelectedMessageId}
          onMessageRef={(messageId, node) => {
            if (node) messageRefs.current.set(messageId, node);
            else messageRefs.current.delete(messageId);
          }}
          onRemove={(messageId) => void kin.removeFailedMessage(messageId)}
          onRetry={(messageId) => void kin.retryMessage(messageId)}
          partnerName={partnerName}
          rememberedMessageIds={new Set(snapshot.memories.flatMap((memory) => memory.sourceMessageIds))}
          showBeginning={!messagePage?.hasOlderMessages && (messagePage?.loadedCount ?? 0) > 50}
        />
        {notice ? (
          <View style={styles.noticeWrap}>
            <InlineNotice
              actionLabel={noticeAction?.label}
              message={notice}
              onAction={noticeAction?.onPress}
            />
          </View>
        ) : null}
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
        onReport={selectedMessage && selectedMessage.senderId !== currentUserId
          ? reportSelectedMessage
          : undefined}
        reportIsDemo={kin.mode === 'demo'}
        visible={selectedMessageId !== null}
      />
      {reportMessageId ? (
        <ReportSheet
          messageId={reportMessageId}
          onClose={closeMessageReport}
          spaceId={spaceId}
          visible
        />
      ) : null}
      <RememberSheet
        onClose={closeRememberFlow}
        onSelect={setRememberKind}
        visible={rememberMessageId !== null && rememberKind === null}
      />
      {rememberMessageId && rememberKind ? (
        <MemoryEditorScreen
          kind={rememberKind}
          onClose={closeRememberFlow}
          onRequestKinPlus={onOpenKinPlus ?? (() => setNotice('Kin+ unlocks unlimited new Moments.'))}
          onSaved={() => undefined}
          sourceMessageId={rememberMessageId}
          spaceId={spaceId}
        />
      ) : null}
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
  name: { color: colors.plumInk, fontFamily: typography.bodyStrong, fontSize: 17, fontWeight: '800' },
  noticeWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  relationshipButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  relationshipGlyph: { fontSize: 28, fontWeight: '800' },
  screen: { flex: 1 },
  status: { color: colors.mutedInk, fontSize: 11, marginTop: 2 },
  wallpaperImage: { height: '100%', opacity: 0.34, width: '100%' },
  wallpaperLayer: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
});
