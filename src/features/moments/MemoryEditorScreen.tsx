import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenState } from '@/components/ScreenState';
import { kinImageSource } from '@/design/assets';
import { colors, radii, spacing, typography } from '@/design/tokens';
import { canCreateMemory } from '@/domain/limits';
import type { MemoryItem, MemoryKind, MemoryVisibility, Message } from '@/domain/models';
import { useKin } from '@/state/useKin';
import { usePremiumGate } from '@/features/premium/usePremiumGate';

interface MemoryEditorScreenProps {
  spaceId: string;
  sourceMessageId: string;
  kind: MemoryKind;
  isKinPlus?: boolean;
  onClose: () => void;
  onSaved: (memory: MemoryItem) => void;
  onRequestKinPlus: () => void;
}

export function MemoryEditorScreen(props: MemoryEditorScreenProps) {
  const kin = useKin();
  const premium = usePremiumGate();
  const source = kin.snapshot?.messages.find((message) => message.id === props.sourceMessageId);
  const spaceExists = kin.snapshot?.spaces.some((space) => space.id === props.spaceId);
  if (kin.status === 'loading') return <ScreenState message="Opening the source message…" title="Remember this" />;
  if (!source || !spaceExists) return <ScreenState message="The source message is not available." title="Cannot remember this" />;
  return <MemoryEditorContent {...props} isKinPlus={props.isKinPlus ?? premium.entitlement.isKinPlus} source={source} save={kin.saveMemory} existingCount={kin.snapshot?.memories.filter((memory) => memory.spaceId === props.spaceId).length ?? 0} />;
}

function MemoryEditorContent({
  existingCount,
  isKinPlus = false,
  kind,
  onClose,
  onRequestKinPlus,
  onSaved,
  save,
  source,
  sourceMessageId,
  spaceId,
}: MemoryEditorScreenProps & {
  existingCount: number;
  source: Message;
  save: ReturnType<typeof useKin>['saveMemory'];
}) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(source.createdAt.slice(0, 10));
  const [note, setNote] = useState('');
  const [place, setPlace] = useState('');
  const [visibility, setVisibility] = useState<MemoryVisibility>('private');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<MemoryItem | null>(null);

  async function submit() {
    if (!canCreateMemory({ isKinPlus }, existingCount)) {
      onRequestKinPlus();
      return;
    }
    setSaving(true);
    setError('');
    try {
      const memory = await save({
        kind,
        mediaUris: source.mediaUri ? [source.mediaUri] : [],
        note,
        occurredOn: date,
        place,
        sourceMessageIds: [sourceMessageId],
        spaceId,
        title,
        visibility,
      });
      setSaved(memory);
      onSaved(memory);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Kin could not keep this yet.');
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.savedWrap}>
          <Text style={styles.savedMark}>⌞</Text>
          <Text accessibilityRole="header" style={styles.title}>Saved to your timeline</Text>
          <Text style={styles.intro}>{saved.title} is still linked to the message it came from.</Text>
          <Pressable accessibilityLabel="Back to conversation" accessibilityRole="button" onPress={onClose} style={styles.primary}>
            <Text style={styles.primaryText}>Back to conversation</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.topRow}>
          <Pressable accessibilityLabel="Cancel remembering" accessibilityRole="button" onPress={onClose} style={styles.close}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>
          <Text style={styles.eyebrow}>NEW {kindLabel(kind).toUpperCase()}</Text>
          <View style={styles.close} />
        </View>
        <Text accessibilityRole="header" style={styles.title}>{editorTitle(kind)}</Text>
        <Text style={styles.intro}>Keep the meaning you choose, with the original message attached.</Text>

        <View style={styles.sourceCard}>
          <Text style={styles.sourceLabel}>FROM YOUR MESSAGE ON {formatShortDate(source.createdAt)}</Text>
          {source.kind === 'image' && source.mediaUri ? <Image accessibilityLabel={`Source image: ${source.body}`} source={kinImageSource(source.mediaUri)} style={styles.sourceImage} /> : null}
          <Text style={styles.sourceBody}>{source.body}</Text>
        </View>

        <Field label="Title" onChangeText={setTitle} value={title} />
        <Field label="Date" onChangeText={setDate} placeholder="YYYY-MM-DD" value={date} />
        <Field label="Note" multiline onChangeText={setNote} placeholder="What do you want to remember?" value={note} />
        <Field label="Place" onChangeText={setPlace} placeholder="Optional" value={place} />

        <Text style={styles.fieldLabel}>WHO CAN SEE THIS</Text>
        <View style={styles.visibilityRow}>
          <Pressable accessibilityLabel="Keep private" accessibilityRole="button" accessibilityState={{ selected: visibility === 'private' }} onPress={() => setVisibility('private')} style={[styles.visibility, visibility === 'private' && styles.visibilitySelected]}>
            <Text style={styles.visibilityTitle}>Private to you</Text>
            <Text style={styles.visibilityCopy}>Only you can open it.</Text>
          </Pressable>
          <Pressable accessibilityLabel="Share this memory" accessibilityRole="button" accessibilityState={{ selected: visibility === 'shared' }} onPress={() => setVisibility('shared')} style={[styles.visibility, visibility === 'shared' && styles.visibilitySelected]}>
            <Text style={styles.visibilityTitle}>Shared</Text>
            <Text style={styles.visibilityCopy}>Visible in this Kin Space.</Text>
          </Pressable>
        </View>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityLabel={saveLabel(kind)} accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} onPress={submit} style={styles.primary}>
          <Text style={styles.primaryText}>{saving ? 'Keeping…' : saveLabel(kind)}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={colors.mutedInk} style={[styles.input, props.multiline && styles.multiline]} {...props} />
    </View>
  );
}

function kindLabel(kind: MemoryKind) { return kind === 'important_date' ? 'Important date' : kind === 'plan' ? 'Plan' : 'Moment'; }
function editorTitle(kind: MemoryKind) { return kind === 'plan' ? 'Keep a plan close.' : kind === 'important_date' ? 'Give the date a place.' : 'Name what mattered.'; }
function saveLabel(kind: MemoryKind) { return kind === 'plan' ? 'Save plan' : kind === 'important_date' ? 'Save important date' : 'Keep this Moment'; }
function formatShortDate(value: string) { return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)); }

const styles = StyleSheet.create({
  close: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  closeText: { color: colors.plumInk, fontSize: 30 },
  content: { alignSelf: 'center', maxWidth: 620, padding: spacing.xl, paddingBottom: 64, width: '100%' },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19, marginTop: spacing.md },
  eyebrow: { color: colors.rose, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  field: { marginTop: spacing.xl },
  fieldLabel: { color: colors.mutedInk, fontSize: 10, fontWeight: '900', letterSpacing: 1.1, marginBottom: spacing.sm },
  input: { backgroundColor: colors.paper, borderColor: colors.keyline, borderRadius: radii.md, borderWidth: 1, color: colors.plumInk, fontSize: 15, minHeight: 50, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  intro: { color: colors.mutedInk, fontFamily: typography.body, fontSize: 14, lineHeight: 21, marginTop: spacing.sm },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  primary: { alignItems: 'center', backgroundColor: colors.plumInk, borderRadius: radii.md, justifyContent: 'center', marginTop: spacing.xl, minHeight: 54, paddingHorizontal: spacing.lg },
  primaryText: { color: colors.paper, fontSize: 15, fontWeight: '800' },
  savedMark: { color: colors.rose, fontSize: 58, fontWeight: '900' },
  savedWrap: { alignSelf: 'center', justifyContent: 'center', maxWidth: 520, padding: spacing.xl, width: '100%', flex: 1 },
  screen: { backgroundColor: colors.parchment, bottom: 0, flex: 1, left: 0, position: 'absolute', right: 0, top: 0, zIndex: 40 },
  sourceBody: { color: colors.plumInk, fontSize: 16, lineHeight: 23, marginTop: spacing.sm },
  sourceCard: { backgroundColor: colors.paper, borderColor: colors.keyline, borderRadius: radii.lg, borderWidth: 1, marginTop: spacing.xl, overflow: 'hidden', padding: spacing.lg },
  sourceImage: { borderRadius: radii.md, height: 180, marginTop: spacing.sm, width: '100%' },
  sourceLabel: { color: colors.rose, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  title: { color: colors.plumInk, fontFamily: typography.display, fontSize: 32, fontWeight: '800', letterSpacing: -1, marginTop: spacing.md },
  topRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  visibility: { backgroundColor: colors.paper, borderColor: colors.keyline, borderRadius: radii.md, borderWidth: 1, flex: 1, minHeight: 78, padding: spacing.md },
  visibilityCopy: { color: colors.mutedInk, fontSize: 11, lineHeight: 16, marginTop: 3 },
  visibilityRow: { flexDirection: 'row', gap: spacing.sm },
  visibilitySelected: { borderColor: colors.rose, borderWidth: 2 },
  visibilityTitle: { color: colors.plumInk, fontSize: 13, fontWeight: '800' },
});
