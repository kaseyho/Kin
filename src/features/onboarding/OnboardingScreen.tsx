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
import { useKin } from '@/state/useKin';

type OnboardingStep = 'promise' | 'meaning' | 'profile';

interface OnboardingScreenProps {
  onComplete: () => void;
  onTryDemo?: () => void;
}

export function OnboardingScreen({ onComplete, onTryDemo }: OnboardingScreenProps) {
  const kin = useKin();
  const [step, setStep] = useState<OnboardingStep>('promise');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submitProfile() {
    if (!name.trim()) {
      setError('Tell Kin what to call you.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await kin.saveProfile({ displayName: name, avatarUri: 'asset://kin/maya' });
      onComplete();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Kin could not save your profile.');
    } finally {
      setSaving(false);
    }
  }

  async function tryDemo() {
    setSaving(true);
    try {
      await kin.resetDemo();
      onTryDemo?.();
    } finally {
      setSaving(false);
    }
  }

  if (step === 'promise') {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.wordmarkWrap}>
          <Text style={styles.wordmark}>kin</Text>
          <Text style={styles.tagline}>A messenger that remembers.</Text>
        </View>
        <View style={styles.introBody}>
          <Text accessibilityRole="header" style={styles.heroTitle}>
            Your chats contain more than messages.
          </Text>
          <Text style={styles.heroCopy}>They hold firsts, promises, tiny jokes, and all the ways you know each other.</Text>
        </View>
        <View style={styles.actions}>
          <PrimaryButton label="See how Kin remembers" onPress={() => setStep('meaning')} />
          <Pressable
            accessibilityLabel="Try Maya and Jamie’s demo"
            accessibilityRole="button"
            disabled={saving}
            onPress={() => void tryDemo()}
            style={styles.textButton}
          >
            <Text style={styles.textButtonLabel}>Try Maya and Jamie’s demo</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'meaning') {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.memoryPreview}>
          <Text style={styles.memoryDate}>DECEMBER 5 · ONE YEAR AGO</Text>
          <Text style={styles.memoryTitle}>The night it all started.</Text>
          <Text style={styles.memoryQuote}>“Want to go out with me this Friday?”</Text>
          <View style={styles.keptCorner} />
        </View>
        <View style={styles.introBody}>
          <Text accessibilityRole="header" style={styles.heroTitle}>
            The good parts deserve somewhere to live.
          </Text>
          <Text style={styles.heroCopy}>Keep a message as a Moment, then find it in the story of your relationship.</Text>
        </View>
        <View style={styles.actions}>
          <PrimaryButton label="Create my profile" onPress={() => setStep('profile')} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.profileWrap}
      >
        <View>
          <Text style={styles.stepLabel}>YOUR KIN PROFILE</Text>
          <Text accessibilityRole="header" style={styles.heroTitle}>
            What should your people call you?
          </Text>
          <Text style={styles.heroCopy}>You can change this any time. Relationship labels stay optional.</Text>
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Your name</Text>
          <TextInput
            accessibilityLabel="Your name"
            autoCapitalize="words"
            autoFocus
            onChangeText={setName}
            placeholder="Maya"
            placeholderTextColor={colors.mutedInk}
            style={styles.input}
            value={name}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
        <PrimaryButton disabled={saving} label={saving ? 'Saving…' : 'Continue'} onPress={() => void submitProfile()} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PrimaryButton({
  disabled = false,
  label,
  onPress,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={styles.primaryButtonLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.sm, paddingBottom: spacing.xl },
  disabled: { opacity: 0.5 },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
  fieldGroup: { marginVertical: spacing.xxl },
  heroCopy: { color: colors.mutedInk, fontSize: 17, lineHeight: 26, marginTop: spacing.md },
  heroTitle: { color: colors.plumInk, fontSize: 37, fontWeight: '700', letterSpacing: -1.2, lineHeight: 43 },
  input: {
    backgroundColor: colors.paper,
    borderColor: colors.keyline,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.plumInk,
    fontSize: 18,
    minHeight: 54,
    paddingHorizontal: spacing.lg,
  },
  introBody: { marginTop: 'auto', paddingBottom: spacing.xxl },
  keptCorner: {
    borderBottomColor: '#D7C5B8',
    borderBottomWidth: 18,
    borderLeftColor: 'transparent',
    borderLeftWidth: 18,
    height: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    width: 0,
  },
  label: { color: colors.plumInk, fontSize: 14, fontWeight: '700', marginBottom: spacing.sm },
  memoryDate: { color: colors.rose, fontSize: 11, fontWeight: '800', letterSpacing: 1.3 },
  memoryPreview: {
    backgroundColor: colors.paper,
    borderColor: colors.keyline,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginTop: 68,
    overflow: 'hidden',
    padding: spacing.xl,
    transform: [{ rotate: '-1.5deg' }],
  },
  memoryQuote: { color: colors.mutedInk, fontSize: 15, fontStyle: 'italic', lineHeight: 22, marginTop: spacing.lg },
  memoryTitle: { color: colors.plumInk, fontSize: 25, fontWeight: '700', marginTop: spacing.sm },
  pressed: { opacity: 0.72 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.plumInk,
    borderRadius: radii.round,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.xl,
  },
  primaryButtonLabel: { color: colors.paper, fontSize: 16, fontWeight: '800' },
  profileWrap: { flex: 1, justifyContent: 'center' },
  screen: { backgroundColor: colors.parchment, flex: 1, paddingHorizontal: spacing.xl },
  stepLabel: { color: colors.rose, fontSize: 12, fontWeight: '800', letterSpacing: 1.4, marginBottom: spacing.lg },
  tagline: { color: colors.mutedInk, fontSize: 14, marginLeft: spacing.sm },
  textButton: { alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  textButtonLabel: { color: colors.plumInk, fontSize: 14, fontWeight: '700' },
  wordmark: { color: colors.plumInk, fontSize: 30, fontWeight: '900', letterSpacing: -1.5 },
  wordmarkWrap: { alignItems: 'baseline', flexDirection: 'row', marginTop: spacing.xl },
});
