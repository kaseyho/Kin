import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AccessibleSheet } from '@/components/AccessibleSheet';
import { SupportLink } from '@/components/SupportLink';
import { readPublicSupportEmail } from '@/config/support';
import { colors, radii, spacing, typography } from '@/design/tokens';
import type { ContentReportCategory, ContentReportReceipt } from '@/domain/models';
import { useKin } from '@/state/useKin';

const MAX_EXPLANATION_LENGTH = 2_000;
const REPORT_CATEGORIES: readonly { id: ContentReportCategory; label: string }[] = [
  { id: 'harassment', label: 'Harassment or bullying' },
  { id: 'threats', label: 'Threats or violence' },
  { id: 'hate', label: 'Hate or abusive content' },
  { id: 'sexual_content', label: 'Sexual content' },
  { id: 'spam', label: 'Spam or scam' },
  { id: 'other', label: 'Something else' },
];

interface ReportSheetProps {
  messageId?: string;
  onClose: () => void;
  spaceId: string;
  supportEmail?: string;
  visible: boolean;
}

export function ReportSheet({
  messageId,
  onClose,
  spaceId,
  supportEmail = readPublicSupportEmail(),
  visible,
}: ReportSheetProps) {
  const kin = useKin();
  const isDemo = kin.mode === 'demo';
  const [category, setCategory] = useState<ContentReportCategory | null>(null);
  const [explanation, setExplanation] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<ContentReportReceipt | null>(null);

  async function submit() {
    if (!category) {
      setError('Choose a reason for this report.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const nextReceipt = await kin.submitContentReport({
        category,
        explanation: explanation.trim(),
        ...(messageId ? { messageId } : {}),
        spaceId,
      });
      setReceipt(nextReceipt);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Kin could not submit that report.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AccessibleSheet
      closeDisabled={submitting}
      closeLabel={receipt ? 'Close report receipt' : 'Cancel report'}
      label={messageId ? 'Report this message' : 'Report this Kin Space'}
      onClose={onClose}
      sheetStyle={styles.sheet}
      testID="report-sheet"
      visible={visible}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {receipt ? (
          <>
            <Text style={styles.eyebrow}>SAFETY REPORT</Text>
            <Text accessibilityRole="header" style={styles.title}>
              {isDemo ? 'Demo report saved' : 'Report received'}
            </Text>
            <Text style={styles.copy}>
              {isDemo
                ? 'This demo report stayed on this device. It was not sent to Kin or a moderator, and the other person cannot see it.'
                : 'Kin saved this for safety review. The other person cannot see your report details.'}
            </Text>
            <Text selectable style={styles.reference}>Reference {receipt.id}</Text>
            <SupportLink supportEmail={supportEmail} />
            <PrimaryButton label="Done" onPress={onClose} />
          </>
        ) : (
          <>
            <Text style={styles.eyebrow}>{isDemo ? 'DEMO SAFETY PREVIEW' : 'PRIVATE SAFETY REPORT'}</Text>
            <Text accessibilityRole="header" style={styles.title}>
              {messageId ? 'Report this message' : 'Report this Kin Space'}
            </Text>
            <Text style={styles.copy}>
              {isDemo
                ? 'Choose the closest reason. Demo reports are saved only on this device and are not sent to Kin or a moderator.'
                : 'Choose the closest reason. Kin sends this privately for review and does not show it in the conversation.'}
            </Text>
            <View accessibilityRole="radiogroup" style={styles.categories}>
              {REPORT_CATEGORIES.map((item) => {
                const selected = category === item.id;
                return (
                  <Pressable
                    accessibilityLabel={item.label}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    disabled={submitting}
                    key={item.id}
                    onPress={() => {
                      setCategory(item.id);
                      setError('');
                    }}
                    style={[styles.category, selected && styles.categorySelected]}
                  >
                    <View style={[styles.radio, selected && styles.radioSelected]} />
                    <Text style={styles.categoryLabel}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.fieldLabel}>DETAILS · OPTIONAL</Text>
            <TextInput
              accessibilityLabel="Optional report details"
              maxLength={MAX_EXPLANATION_LENGTH}
              multiline
              editable={!submitting}
              onChangeText={(value) => setExplanation(value.slice(0, MAX_EXPLANATION_LENGTH))}
              placeholder="Share context that will help with review."
              style={styles.input}
              textAlignVertical="top"
              value={explanation}
            />
            <Text accessibilityLiveRegion="polite" style={styles.count}>
              {explanation.length.toLocaleString()} / {MAX_EXPLANATION_LENGTH.toLocaleString()}
            </Text>
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <SupportLink supportEmail={supportEmail} />
            <PrimaryButton
              disabled={submitting}
              label={submitting
                ? isDemo ? 'Saving…' : 'Submitting…'
                : error ? isDemo ? 'Try saving again' : 'Try submitting again'
                  : isDemo ? 'Save demo report' : 'Submit report'}
              onPress={() => void submit()}
            />
            <SecondaryButton disabled={submitting} label="Cancel" onPress={onClose} />
          </>
        )}
      </ScrollView>
    </AccessibleSheet>
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
      style={[styles.primary, disabled && styles.disabled]}
    >
      <Text style={styles.primaryLabel}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({ disabled, label, onPress }: {
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
      style={[styles.secondary, disabled && styles.disabled]}
    >
      <Text style={styles.secondaryLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  categories: { gap: spacing.sm, marginBottom: spacing.lg },
  category: {
    alignItems: 'center',
    borderColor: colors.keyline,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  categoryLabel: { color: colors.plumInk, flex: 1, fontSize: 14, fontWeight: '700' },
  categorySelected: { backgroundColor: '#F7EBEF', borderColor: colors.rose },
  content: { paddingBottom: spacing.md },
  copy: { color: colors.mutedInk, fontSize: 14, lineHeight: 21, marginBottom: spacing.lg },
  count: { color: colors.mutedInk, fontSize: 11, marginTop: spacing.xs, textAlign: 'right' },
  disabled: { opacity: 0.5 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19, marginTop: spacing.md },
  eyebrow: { color: colors.rose, fontSize: 11, fontWeight: '900', letterSpacing: 1.15 },
  fieldLabel: { color: colors.mutedInk, fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  input: {
    backgroundColor: colors.parchment,
    borderColor: colors.keyline,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.plumInk,
    marginTop: spacing.sm,
    minHeight: 108,
    padding: spacing.md,
  },
  primary: {
    alignItems: 'center',
    backgroundColor: colors.plumInk,
    borderRadius: radii.round,
    justifyContent: 'center',
    marginTop: spacing.lg,
    minHeight: 50,
    paddingHorizontal: spacing.lg,
  },
  primaryLabel: { color: colors.paper, fontSize: 15, fontWeight: '800' },
  radio: { borderColor: colors.mutedInk, borderRadius: 8, borderWidth: 1, height: 16, width: 16 },
  radioSelected: { backgroundColor: colors.rose, borderColor: colors.rose, borderWidth: 4 },
  reference: { color: colors.plumInk, fontSize: 13, fontWeight: '800', marginTop: spacing.sm },
  secondary: { alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs, minHeight: 46 },
  secondaryLabel: { color: colors.mutedInk, fontSize: 14, fontWeight: '800' },
  sheet: { maxHeight: '94%' },
  title: {
    color: colors.plumInk,
    fontFamily: typography.display,
    fontSize: 28,
    fontWeight: '800',
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
});
