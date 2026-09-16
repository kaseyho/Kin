import { useEffect, useState } from 'react';
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

import { colors, radii, spacing, typography } from '@/design/tokens';
import { AuthError } from '@/services/auth/contracts';
import { useAuth } from '@/state/useAuth';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_PATTERN = /^\d{6}$/;
const RESEND_WAIT_SECONDS = 30;

interface AuthScreenProps {
  onSignedIn?: () => void;
}

export function AuthScreen({ onSignedIn }: AuthScreenProps) {
  const auth = useAuth();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);

  useEffect(() => {
    if (step !== 'code' || resendSeconds <= 0) return;
    const timer = setInterval(() => {
      setResendSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendSeconds, step]);

  async function requestCode() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setError('Enter a valid email address.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await auth.requestOtp(normalizedEmail);
      setEmail(normalizedEmail);
      setCode('');
      setStep('code');
      setResendSeconds(RESEND_WAIT_SECONDS);
    } catch (reason) {
      setError(authErrorMessage(reason, 'Kin could not send a sign-in code. Try again.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyCode() {
    if (!OTP_PATTERN.test(code)) {
      setError('Enter the six-digit code.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await auth.verifyOtp(email, code);
      onSignedIn?.();
    } catch (reason) {
      setError(authErrorMessage(reason, 'Kin could not verify that code. Try again.'));
    } finally {
      setSubmitting(false);
    }
  }

  function editEmail() {
    setStep('email');
    setCode('');
    setError('');
    setResendSeconds(0);
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          <View style={styles.brandRow}>
            <Text style={styles.wordmark}>kin</Text>
            <Text style={styles.tagline}>A messenger that remembers.</Text>
          </View>

          {step === 'email' ? (
            <View style={styles.card}>
              <Text style={styles.eyebrow}>YOUR PEOPLE, KEPT CLOSE</Text>
              <Text accessibilityRole="header" style={styles.title}>
                Welcome to Kin
              </Text>
              <Text style={styles.copy}>
                Enter your email and we’ll send a private sign-in code. No password to remember.
              </Text>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Email address</Text>
                <TextInput
                  accessibilityLabel="Email address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                  keyboardType="email-address"
                  onChangeText={setEmail}
                  onSubmitEditing={() => void requestCode()}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.mutedInk}
                  returnKeyType="send"
                  style={styles.input}
                  textContentType="emailAddress"
                  value={email}
                />
              </View>
              {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
              <PrimaryButton
                disabled={submitting}
                label={submitting ? 'Sending…' : 'Email me a code'}
                onPress={() => void requestCode()}
              />
              <Text style={styles.privacyNote}>
                Kin uses your email only to secure and recover your account.
              </Text>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.eyebrow}>ONE QUIET STEP</Text>
              <Text accessibilityRole="header" style={styles.title}>
                Check your email
              </Text>
              <Text style={styles.copy}>We sent a six-digit code to</Text>
              <Text style={styles.email}>{email}</Text>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Sign-in code</Text>
                <TextInput
                  accessibilityLabel="Six-digit code"
                  autoFocus
                  keyboardType="number-pad"
                  maxLength={6}
                  onChangeText={(value) => setCode(value.replace(/\D/g, ''))}
                  onSubmitEditing={() => void verifyCode()}
                  placeholder="000000"
                  placeholderTextColor={colors.mutedInk}
                  returnKeyType="done"
                  style={[styles.input, styles.codeInput]}
                  textContentType="oneTimeCode"
                  value={code}
                />
              </View>
              {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
              <PrimaryButton
                disabled={submitting}
                label={submitting ? 'Checking…' : 'Continue to Kin'}
                onPress={() => void verifyCode()}
              />
              <Pressable
                accessibilityLabel={resendSeconds > 0 ? `Resend in ${resendSeconds}s` : 'Resend code'}
                accessibilityRole="button"
                disabled={submitting || resendSeconds > 0}
                onPress={() => void requestCode()}
                style={({ pressed }) => [
                  styles.textButton,
                  pressed && styles.pressed,
                  (submitting || resendSeconds > 0) && styles.disabledTextButton,
                ]}
              >
                <Text style={styles.textButtonLabel}>
                  {resendSeconds > 0 ? `Resend in ${resendSeconds}s` : 'Resend code'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Use a different email"
                accessibilityRole="button"
                disabled={submitting}
                onPress={editEmail}
                style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
              >
                <Text style={styles.secondaryTextButtonLabel}>Use a different email</Text>
              </Pressable>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function authErrorMessage(reason: unknown, fallback: string): string {
  return reason instanceof AuthError ? reason.message : fallback;
}

function PrimaryButton({
  disabled,
  label,
  onPress,
}: {
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        pressed && styles.pressed,
        disabled && styles.disabledButton,
      ]}
    >
      <Text style={styles.primaryButtonLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  brandRow: { alignItems: 'baseline', flexDirection: 'row', marginBottom: spacing.xxl },
  card: {
    backgroundColor: colors.paper,
    borderColor: colors.keyline,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.xl,
    shadowColor: colors.plumInk,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
  },
  codeInput: { fontSize: 24, fontWeight: '700', letterSpacing: 8, textAlign: 'center' },
  content: { alignSelf: 'center', maxWidth: 520, width: '100%' },
  copy: {
    color: colors.mutedInk,
    fontFamily: typography.body,
    fontSize: 16,
    lineHeight: 24,
    marginTop: spacing.md,
  },
  disabledButton: { opacity: 0.5 },
  disabledTextButton: { opacity: 0.45 },
  email: { color: colors.rose, fontFamily: typography.bodyStrong, fontSize: 16, marginTop: spacing.xs },
  error: { color: colors.danger, fontSize: 13, lineHeight: 20, marginBottom: spacing.md },
  eyebrow: { color: colors.rose, fontFamily: typography.label, fontSize: 11, letterSpacing: 1.4 },
  fieldGroup: { marginBottom: spacing.md, marginTop: spacing.xl },
  input: {
    backgroundColor: colors.parchment,
    borderColor: colors.keyline,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.plumInk,
    fontFamily: typography.body,
    fontSize: 17,
    minHeight: 54,
    paddingHorizontal: spacing.lg,
  },
  keyboardView: { flex: 1, justifyContent: 'center' },
  label: { color: colors.plumInk, fontFamily: typography.bodyStrong, fontSize: 14, marginBottom: spacing.sm },
  pressed: { opacity: 0.72 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.plumInk,
    borderRadius: radii.round,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.xl,
  },
  primaryButtonLabel: { color: colors.paper, fontFamily: typography.label, fontSize: 15 },
  privacyNote: { color: colors.mutedInk, fontSize: 12, lineHeight: 18, marginTop: spacing.md, textAlign: 'center' },
  screen: { backgroundColor: colors.parchment, flex: 1, paddingHorizontal: spacing.xl },
  secondaryTextButtonLabel: { color: colors.mutedInk, fontFamily: typography.bodyStrong, fontSize: 14 },
  tagline: { color: colors.mutedInk, fontSize: 13, marginLeft: spacing.sm },
  textButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, marginTop: spacing.xs },
  textButtonLabel: { color: colors.rose, fontFamily: typography.bodyStrong, fontSize: 14 },
  title: {
    color: colors.plumInk,
    fontFamily: typography.display,
    fontSize: 36,
    letterSpacing: -1,
    lineHeight: 42,
    marginTop: spacing.sm,
  },
  wordmark: { color: colors.plumInk, fontFamily: typography.display, fontSize: 30, letterSpacing: -1.4 },
});
