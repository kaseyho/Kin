import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ScreenState } from '@/components/ScreenState';
import {
  colors,
  radii,
  relationshipThemes,
  relationshipWallpapers,
  spacing,
} from '@/design/tokens';
import type { RelationshipPreferences } from '@/domain/models';
import { useKin } from '@/state/useKin';
import { usePremiumGate } from '@/features/premium/usePremiumGate';
import { ThemePreview } from './ThemePreview';

interface PersonalizeSpaceSheetProps {
  spaceId: string;
  isKinPlus?: boolean;
  onClose: () => void;
  onRequestKinPlus: () => void;
}

export function PersonalizeSpaceSheet(props: PersonalizeSpaceSheetProps) {
  const kin = useKin();
  const premium = usePremiumGate();
  const userId = kin.snapshot?.currentUserId;
  const space = kin.snapshot?.spaces.find((item) => item.id === props.spaceId);
  const preference = userId ? space?.preferencesByUser[userId] : undefined;

  if (kin.status === 'loading') {
    return <ScreenState message="Opening your relationship palette…" title="Make it yours" />;
  }
  if (!userId || !space || !preference) {
    return <ScreenState message="This Kin Space is not available." title="Make it yours" />;
  }

  return (
    <PersonalizeContent
      {...props}
      isKinPlus={props.isKinPlus ?? premium.entitlement.isKinPlus}
      initialPreference={preference}
      save={(next) => kin.updateSpacePreferences({ ...next, spaceId: space.id, userId })}
    />
  );
}

function PersonalizeContent({
  initialPreference,
  isKinPlus = false,
  onClose,
  onRequestKinPlus,
  save,
}: PersonalizeSpaceSheetProps & {
  initialPreference: RelationshipPreferences;
  save: (preference: RelationshipPreferences) => Promise<unknown>;
}) {
  const [nickname, setNickname] = useState(initialPreference.nickname);
  const [themeId, setThemeId] = useState(initialPreference.themeId);
  const [wallpaperId, setWallpaperId] = useState(initialPreference.wallpaperId);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const theme = relationshipThemes.find((item) => item.id === themeId) ?? relationshipThemes[0];
  const wallpaper =
    relationshipWallpapers.find((item) => item.id === wallpaperId) ?? relationshipWallpapers[0];

  async function handleSave() {
    if (!nickname.trim()) {
      setError('Give this person a nickname before saving.');
      return;
    }
    if (!isKinPlus && (theme.isPremium || wallpaper.isPremium)) {
      onRequestKinPlus();
      return;
    }
    setSaving(true);
    setError('');
    try {
      await save({ nickname: nickname.trim(), themeId: theme.id, wallpaperId: wallpaper.id });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Kin could not save those changes.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.overlay}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headingRow}>
          <View style={styles.headingCopy}>
            <Text style={styles.eyebrow}>THIS KIN SPACE</Text>
            <Text accessibilityRole="header" style={styles.title}>Make it feel like yours.</Text>
          </View>
          <Pressable accessibilityLabel="Close personalization" accessibilityRole="button" onPress={onClose} style={styles.close}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>

        <Text style={styles.label}>NICKNAME</Text>
        <TextInput
          accessibilityLabel="Nickname"
          autoCapitalize="words"
          maxLength={28}
          onChangeText={setNickname}
          style={styles.input}
          value={nickname}
        />

        <Text style={styles.label}>ACCENT</Text>
        <View style={styles.choiceWrap}>
          {relationshipThemes.map((item) => (
            <Pressable
              accessibilityLabel={`${item.name} theme`}
              accessibilityRole="button"
              accessibilityState={{ selected: item.id === theme.id }}
              key={item.id}
              onPress={() => setThemeId(item.id)}
              style={[
                styles.choice,
                item.id === theme.id && { borderColor: item.accent, borderWidth: 2 },
              ]}
            >
              <View style={[styles.swatch, { backgroundColor: item.accent }]} />
              <Text style={styles.choiceName}>{item.name}</Text>
              {item.isPremium ? <Text style={styles.plus}>KIN+</Text> : null}
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>WALLPAPER</Text>
        <View style={styles.choiceWrap}>
          {relationshipWallpapers.map((item) => (
            <Pressable
              accessibilityLabel={`${item.name} wallpaper`}
              accessibilityRole="button"
              accessibilityState={{ selected: item.id === wallpaper.id }}
              key={item.id}
              onPress={() => setWallpaperId(item.id)}
              style={[styles.wallpaperChoice, item.id === wallpaper.id && styles.selectedChoice]}
            >
              <Text style={styles.choiceName}>{item.name}</Text>
              {item.isPremium ? <Text style={styles.plus}>KIN+</Text> : null}
            </Pressable>
          ))}
        </View>

        <Text style={styles.previewLabel}>Previewing {theme.name}</Text>
        <ThemePreview
          accent={theme.accent}
          ink={theme.ink}
          name={theme.name}
          wallpaper={theme.wallpaper}
          wallpaperPattern={wallpaper.pattern}
        />
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {!isKinPlus && (theme.isPremium || wallpaper.isPremium) ? (
          <Text style={styles.premiumNote}>You can preview this Kin+ look here. Saving opens Kin+.</Text>
        ) : null}
        <Pressable
          accessibilityLabel="Save changes"
          accessibilityRole="button"
          accessibilityState={{ disabled: saving }}
          disabled={saving}
          onPress={handleSave}
          style={({ pressed }) => [styles.save, pressed && styles.pressed]}
        >
          <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save changes'}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  choice: {
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderColor: colors.keyline,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 50,
    paddingHorizontal: spacing.md,
  },
  choiceName: { color: colors.plumInk, flex: 1, fontSize: 14, fontWeight: '700' },
  choiceWrap: { gap: spacing.sm },
  close: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  closeText: { color: colors.plumInk, fontSize: 30 },
  content: { padding: spacing.xl, paddingBottom: 56 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19, marginTop: spacing.md },
  eyebrow: { color: colors.rose, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  headingCopy: { flex: 1 },
  headingRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md },
  input: {
    backgroundColor: colors.paper,
    borderColor: colors.keyline,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.plumInk,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  label: { color: colors.mutedInk, fontSize: 11, fontWeight: '900', letterSpacing: 1.1, marginBottom: spacing.sm, marginTop: spacing.xl },
  overlay: { backgroundColor: colors.parchment, flex: 1 },
  plus: { color: colors.rose, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  premiumNote: { color: colors.mutedInk, fontSize: 12, lineHeight: 18, marginTop: spacing.md },
  pressed: { opacity: 0.72 },
  previewLabel: { color: colors.plumInk, fontSize: 13, fontWeight: '800', marginBottom: spacing.sm, marginTop: spacing.xl },
  save: { alignItems: 'center', backgroundColor: colors.plumInk, borderRadius: radii.md, marginTop: spacing.xl, minHeight: 54, justifyContent: 'center' },
  saveText: { color: colors.paper, fontSize: 15, fontWeight: '800' },
  selectedChoice: { borderColor: colors.rose, borderWidth: 2 },
  swatch: { borderRadius: 9, height: 18, width: 18 },
  title: { color: colors.plumInk, fontSize: 30, fontWeight: '800', letterSpacing: -0.8, marginTop: spacing.xs },
  wallpaperChoice: {
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderColor: colors.keyline,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
});
