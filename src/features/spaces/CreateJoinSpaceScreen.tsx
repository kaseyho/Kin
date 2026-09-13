import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radii, spacing } from '@/design/tokens';
import type { ISODate } from '@/domain/models';
import { useKin } from '@/state/useKin';

interface CreateJoinSpaceScreenProps {
  onSpaceReady: (spaceId: string) => void;
}

export function CreateJoinSpaceScreen({ onSpaceReady }: CreateJoinSpaceScreenProps) {
  const kin = useKin();
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    setError('');
    try {
      const space =
        mode === 'create'
          ? await kin.createSpace({
              otherDisplayName: name,
              relationshipStartDate: startDate.trim() ? (startDate.trim() as ISODate) : undefined,
            })
          : await kin.joinSpace({ inviteCode });
      onSpaceReady(space.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Kin could not open that Space.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.content}>
        <View>
          <Text style={styles.eyebrow}>A SPACE OF YOUR OWN</Text>
          <Text accessibilityRole="header" style={styles.title}>
            Start with one person who matters.
          </Text>
          <Text style={styles.copy}>No categories or scores. Just the two of you, from today onward.</Text>
        </View>

        <View accessibilityRole="tablist" style={styles.modeTabs}>
          <ModeTab active={mode === 'create'} label="Create a Space" onPress={() => setMode('create')} />
          <ModeTab active={mode === 'join'} label="Join a Space" onPress={() => setMode('join')} />
        </View>

        {mode === 'create' ? (
          <View style={styles.fields}>
            <Field
              label="Who is this Space with?"
              onChangeText={setName}
              placeholder="Jamie"
              value={name}
            />
            <Field
              autoCapitalize="none"
              label="Relationship start date, optional"
              onChangeText={setStartDate}
              placeholder="YYYY-MM-DD"
              value={startDate}
            />
          </View>
        ) : (
          <View style={styles.fields}>
            <Field
              autoCapitalize="characters"
              label="Invitation code"
              onChangeText={setInviteCode}
              placeholder="KIN123"
              value={inviteCode}
            />
            <Text style={styles.hint}>Invitation codes are case-insensitive and stay private to your Space.</Text>
          </View>
        )}

        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable
          accessibilityLabel={mode === 'create' ? 'Create our Kin Space' : 'Join this Kin Space'}
          accessibilityRole="button"
          disabled={saving}
          onPress={() => void submit()}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, saving && styles.disabled]}
        >
          <Text style={styles.primaryLabel}>
            {saving ? 'Opening…' : mode === 'create' ? 'Create our Kin Space' : 'Join this Kin Space'}
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ModeTab({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.modeTab, active && styles.modeTabActive]}
    >
      <Text style={[styles.modeTabLabel, active && styles.modeTabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function Field({
  autoCapitalize = 'words',
  label,
  onChangeText,
  placeholder,
  value,
}: {
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  label: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize={autoCapitalize}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedInk}
        style={styles.input}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, justifyContent: 'center' },
  copy: { color: colors.mutedInk, fontSize: 16, lineHeight: 24, marginTop: spacing.md },
  disabled: { opacity: 0.5 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20, marginBottom: spacing.md },
  eyebrow: { color: colors.rose, fontSize: 12, fontWeight: '800', letterSpacing: 1.3, marginBottom: spacing.md },
  fields: { gap: spacing.lg, marginBottom: spacing.lg },
  hint: { color: colors.mutedInk, fontSize: 13, lineHeight: 19 },
  input: {
    backgroundColor: colors.paper,
    borderColor: colors.keyline,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.plumInk,
    fontSize: 17,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  label: { color: colors.plumInk, fontSize: 14, fontWeight: '700', marginBottom: spacing.sm },
  modeTab: { alignItems: 'center', borderRadius: radii.round, flex: 1, minHeight: 44, paddingVertical: spacing.md },
  modeTabActive: { backgroundColor: colors.plumInk },
  modeTabLabel: { color: colors.mutedInk, fontSize: 14, fontWeight: '700' },
  modeTabLabelActive: { color: colors.paper },
  modeTabs: {
    backgroundColor: '#EEE6E1',
    borderRadius: radii.round,
    flexDirection: 'row',
    marginVertical: spacing.xxl,
    padding: spacing.xs,
  },
  pressed: { opacity: 0.72 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.plumInk,
    borderRadius: radii.round,
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryLabel: { color: colors.paper, fontSize: 16, fontWeight: '800' },
  screen: { backgroundColor: colors.parchment, flex: 1, paddingHorizontal: spacing.xl },
  title: { color: colors.plumInk, fontSize: 34, fontWeight: '700', letterSpacing: -1, lineHeight: 40 },
});
