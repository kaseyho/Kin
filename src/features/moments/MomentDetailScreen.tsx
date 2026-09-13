import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenState } from '@/components/ScreenState';
import { colors, radii, spacing } from '@/design/tokens';
import type { MemoryItem, MemoryVisibility } from '@/domain/models';
import { useKin } from '@/state/useKin';
import { formatDate, kindLabel } from './MomentCard';

interface MomentDetailScreenProps {
  memoryId: string;
  onBack: () => void;
  onDeleted: () => void;
}

export function MomentDetailScreen({ memoryId, onBack, onDeleted }: MomentDetailScreenProps) {
  const kin = useKin();
  const memory = kin.snapshot?.memories.find((item) => item.id === memoryId);
  if (kin.status === 'loading') return <ScreenState message="Opening what you kept…" title="Moment" />;
  if (!memory || !kin.snapshot) return <ScreenState actionLabel="Go back" message="This saved item may have been deleted." onAction={onBack} title="Memory not found" />;
  const sourceMessages = kin.snapshot.messages.filter((message) => memory.sourceMessageIds.includes(message.id));
  const space = kin.snapshot.spaces.find((item) => item.id === memory.spaceId);
  const currentUserId = kin.snapshot.currentUserId;
  const otherMember = kin.snapshot.members.find((member) => member.spaceId === memory.spaceId && member.userId !== currentUserId);
  const other = kin.snapshot.profiles.find((profile) => profile.id === otherMember?.userId);
  const partnerName = currentUserId ? space?.preferencesByUser[currentUserId]?.nickname || other?.displayName || 'your person' : 'your person';

  return (
    <MomentDetailContent
      deleteMemory={kin.deleteMemory}
      memory={memory}
      onBack={onBack}
      onDeleted={onDeleted}
      partnerName={partnerName}
      sourceMessages={sourceMessages}
      updateMemory={kin.updateMemory}
    />
  );
}

function MomentDetailContent({
  deleteMemory,
  memory,
  onBack,
  onDeleted,
  partnerName,
  sourceMessages,
  updateMemory,
}: {
  deleteMemory: ReturnType<typeof useKin>['deleteMemory'];
  memory: MemoryItem;
  onBack: () => void;
  onDeleted: () => void;
  partnerName: string;
  sourceMessages: NonNullable<ReturnType<typeof useKin>['snapshot']>['messages'];
  updateMemory: ReturnType<typeof useKin>['updateMemory'];
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(memory.title);
  const [date, setDate] = useState<string>(memory.occurredOn);
  const [note, setNote] = useState(memory.note);
  const [place, setPlace] = useState(memory.place ?? '');
  const [visibility, setVisibility] = useState<MemoryVisibility>(memory.visibility);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');

  async function saveChanges() {
    setError('');
    try {
      await updateMemory({ memoryId: memory.id, note, occurredOn: date, place, title, visibility });
      setEditing(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Kin could not save those changes.');
    }
  }

  async function confirmDelete() {
    if (confirmation !== 'DELETE') {
      setError('Type DELETE exactly to delete this saved item.');
      return;
    }
    await deleteMemory(memory.id);
    onDeleted();
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={onBack} style={styles.iconButton}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.wordmark}>kin</Text>
        <View style={styles.iconButton} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.kind}>{kindLabel(memory.kind)}</Text>
        {editing ? (
          <>
            <EditorField label="Title" onChangeText={setTitle} value={title} />
            <EditorField label="Date" onChangeText={setDate} value={date} />
            <EditorField label="Note" multiline onChangeText={setNote} value={note} />
            <EditorField label="Place" onChangeText={setPlace} value={place} />
            <View style={styles.visibilityRow}>
              <Pressable accessibilityLabel="Make private" accessibilityRole="button" onPress={() => setVisibility('private')} style={[styles.visibility, visibility === 'private' && styles.selected]}><Text style={styles.visibilityText}>Private</Text></Pressable>
              <Pressable accessibilityLabel="Share in Kin Space" accessibilityRole="button" onPress={() => setVisibility('shared')} style={[styles.visibility, visibility === 'shared' && styles.selected]}><Text style={styles.visibilityText}>Shared</Text></Pressable>
            </View>
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <Pressable accessibilityLabel="Save Moment changes" accessibilityRole="button" onPress={saveChanges} style={styles.primary}><Text style={styles.primaryText}>Save changes</Text></Pressable>
          </>
        ) : (
          <>
            {memory.mediaUris.map((uri) => <Image accessibilityLabel={`Memory image: ${memory.title}`} key={uri} source={{ uri }} style={styles.image} />)}
            <Text accessibilityRole="header" style={styles.title}>{memory.title}</Text>
            <Text style={styles.date}>{formatDate(memory.occurredOn)}{memory.place ? ` · ${memory.place}` : ''}</Text>
            {memory.note ? <Text style={styles.note}>{memory.note}</Text> : null}
            <Text style={styles.visibilityStatus}>{memory.visibility === 'private' ? 'Private to you' : `Shared with ${partnerName}`}</Text>
            {sourceMessages.map((message) => (
              <View key={message.id} style={styles.source}>
                <Text style={styles.sourceLabel}>FROM YOUR MESSAGE ON {formatDate(message.createdAt.slice(0, 10))}</Text>
                <Text style={styles.sourceBody}>{message.body}</Text>
              </View>
            ))}
            <Pressable accessibilityLabel="Edit this Moment" accessibilityRole="button" onPress={() => setEditing(true)} style={styles.secondary}><Text style={styles.secondaryText}>Edit this {memory.kind === 'moment' ? 'Moment' : 'item'}</Text></Pressable>
            <Pressable accessibilityLabel="Delete this Moment" accessibilityRole="button" onPress={() => setConfirmingDelete(true)} style={styles.deleteLink}><Text style={styles.deleteText}>Delete this {memory.kind === 'moment' ? 'Moment' : 'item'}</Text></Pressable>
            {confirmingDelete ? (
              <View style={styles.deleteBox}>
                <Text style={styles.deleteWarning}>This permanently removes the saved item. The original chat message stays in the conversation.</Text>
                <TextInput accessibilityLabel="Type DELETE to confirm" autoCapitalize="characters" onChangeText={setConfirmation} placeholder="Type DELETE" style={styles.input} value={confirmation} />
                {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
                <Pressable accessibilityLabel="Delete Moment permanently" accessibilityRole="button" onPress={confirmDelete} style={styles.danger}><Text style={styles.primaryText}>Delete permanently</Text></Pressable>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function EditorField({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label.toUpperCase()}</Text><TextInput accessibilityLabel={label} style={[styles.input, props.multiline && styles.multiline]} {...props} /></View>;
}

const styles = StyleSheet.create({
  back: { color: colors.plumInk, fontSize: 36, lineHeight: 38 },
  content: { alignSelf: 'center', maxWidth: 620, padding: spacing.xl, paddingBottom: 72, width: '100%' },
  danger: { alignItems: 'center', backgroundColor: colors.danger, borderRadius: radii.md, justifyContent: 'center', minHeight: 50 },
  date: { color: colors.mutedInk, fontSize: 13, marginTop: spacing.sm },
  deleteBox: { borderColor: '#E7BFC4', borderRadius: radii.md, borderWidth: 1, gap: spacing.md, marginTop: spacing.md, padding: spacing.lg },
  deleteLink: { alignItems: 'center', minHeight: 48, justifyContent: 'center', marginTop: spacing.sm },
  deleteText: { color: colors.danger, fontSize: 13, fontWeight: '800' },
  deleteWarning: { color: colors.plumInk, fontSize: 13, lineHeight: 19 },
  error: { color: colors.danger, fontSize: 13 },
  field: { marginTop: spacing.lg },
  fieldLabel: { color: colors.mutedInk, fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: spacing.sm },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.md },
  iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  image: { borderRadius: radii.lg, height: 260, marginBottom: spacing.lg, width: '100%' },
  input: { backgroundColor: colors.paper, borderColor: colors.keyline, borderRadius: radii.md, borderWidth: 1, color: colors.plumInk, minHeight: 50, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  kind: { color: colors.rose, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  note: { color: colors.plumInk, fontSize: 16, lineHeight: 25, marginTop: spacing.xl },
  primary: { alignItems: 'center', backgroundColor: colors.plumInk, borderRadius: radii.md, justifyContent: 'center', marginTop: spacing.xl, minHeight: 52 },
  primaryText: { color: colors.paper, fontSize: 14, fontWeight: '800' },
  screen: { backgroundColor: colors.parchment, flex: 1 },
  secondary: { alignItems: 'center', borderColor: colors.keyline, borderRadius: radii.md, borderWidth: 1, justifyContent: 'center', marginTop: spacing.xxl, minHeight: 50 },
  secondaryText: { color: colors.plumInk, fontSize: 14, fontWeight: '800' },
  selected: { borderColor: colors.rose, borderWidth: 2 },
  source: { backgroundColor: colors.paper, borderColor: colors.keyline, borderRadius: radii.md, borderWidth: 1, marginTop: spacing.xl, padding: spacing.lg },
  sourceBody: { color: colors.plumInk, fontSize: 15, lineHeight: 22, marginTop: spacing.sm },
  sourceLabel: { color: colors.rose, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  title: { color: colors.plumInk, fontSize: 34, fontWeight: '800', letterSpacing: -1, marginTop: spacing.sm },
  visibility: { alignItems: 'center', backgroundColor: colors.paper, borderColor: colors.keyline, borderRadius: radii.md, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 48 },
  visibilityRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  visibilityStatus: { color: colors.rose, fontSize: 12, fontWeight: '800', marginTop: spacing.lg },
  visibilityText: { color: colors.plumInk, fontSize: 13, fontWeight: '800' },
  wordmark: { color: colors.rose, fontSize: 15, fontWeight: '900' },
});
