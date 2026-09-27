import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SupportLink } from '@/components/SupportLink';
import { colors, radii, spacing, typography } from '@/design/tokens';
import { legalDocuments, type LegalDocumentId } from './legalDocuments';

interface LegalDocumentScreenProps {
  documentId: LegalDocumentId;
  onBack: () => void;
  onOpenDocument?: (documentId: LegalDocumentId) => void;
  supportEmail: string;
}

const footerLinks: { id: LegalDocumentId; label: string }[] = [
  { id: 'privacy', label: 'Privacy Policy' },
  { id: 'terms', label: 'Terms of Use' },
  { id: 'community-standards', label: 'Community Standards' },
  { id: 'support', label: 'Support' },
  { id: 'account-deletion', label: 'Account deletion' },
];

export function LegalDocumentScreen({
  documentId,
  onBack,
  onOpenDocument,
  supportEmail,
}: LegalDocumentScreenProps) {
  const document = legalDocuments[documentId];
  const supportSubject = documentId === 'account-deletion' ? 'Delete my Kin account' : 'Kin support';
  const supportLabel = documentId === 'account-deletion'
    ? 'Request account deletion by email'
    : documentId === 'privacy'
      ? 'Email Kin about privacy'
      : 'Email Kin support';

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <Text style={styles.wordmark}>kin</Text>
          <Pressable
            accessibilityLabel="Close document"
            accessibilityRole="button"
            onPress={onBack}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.closeText}>×</Text>
          </Pressable>
        </View>

        <Text style={styles.eyebrow}>{document.eyebrow}</Text>
        <Text accessibilityRole="header" style={styles.title}>{document.title}</Text>
        <Text style={styles.summary}>{document.summary}</Text>
        {document.effectiveDate ? (
          <Text style={styles.effective}>Effective {document.effectiveDate}</Text>
        ) : null}

        <View style={styles.documentCard}>
          {document.sections.map((section, sectionIndex) => (
            <View
              key={section.heading}
              style={[styles.section, sectionIndex > 0 && styles.sectionDivider]}
            >
              <Text accessibilityRole="header" style={styles.sectionTitle}>{section.heading}</Text>
              {section.paragraphs.map((paragraph) => (
                <Text key={paragraph} style={styles.paragraph}>{paragraph}</Text>
              ))}
              {section.bullets?.map((bullet) => (
                <View key={bullet} style={styles.bulletRow}>
                  <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.bullet}>•</Text>
                  <Text style={styles.bulletText}>{bullet}</Text>
                </View>
              ))}
              {section.heading === 'Contact' || section.heading === 'Contact Kin' || section.heading === 'Get help' ? (
                <SupportLink label={supportLabel} subject={supportSubject} supportEmail={supportEmail} />
              ) : null}
              {documentId === 'account-deletion' && section.heading === 'Request deletion without the app' ? (
                <SupportLink label={supportLabel} subject={supportSubject} supportEmail={supportEmail} />
              ) : null}
            </View>
          ))}
        </View>

        {onOpenDocument ? (
          <View style={styles.related}>
            <Text style={styles.relatedTitle}>KIN POLICIES</Text>
            {footerLinks.filter((link) => link.id !== documentId).map((link) => (
              <Pressable
                accessibilityLabel={`Read the ${link.label}`}
                accessibilityRole="link"
                key={link.id}
                onPress={() => onOpenDocument(link.id)}
                style={({ pressed }) => [styles.relatedLink, pressed && styles.pressed]}
              >
                <Text style={styles.relatedLinkText}>{link.label}</Text>
                <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bullet: { color: colors.rose, fontFamily: typography.bodyStrong, fontSize: 16, lineHeight: 22, width: 18 },
  bulletRow: { alignItems: 'flex-start', flexDirection: 'row', marginTop: spacing.sm },
  bulletText: { color: colors.mutedInk, flex: 1, fontFamily: typography.body, fontSize: 14, lineHeight: 22 },
  chevron: { color: colors.rose, fontSize: 22 },
  closeButton: { alignItems: 'center', borderColor: colors.keyline, borderRadius: radii.round, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  closeText: { color: colors.plumInk, fontFamily: typography.body, fontSize: 28, lineHeight: 30 },
  content: { padding: spacing.xl, paddingBottom: 80 },
  documentCard: { backgroundColor: colors.paper, borderColor: colors.keyline, borderRadius: radii.lg, borderWidth: 1, marginTop: spacing.xl, padding: spacing.xl },
  effective: { color: colors.mutedInk, fontFamily: typography.bodyStrong, fontSize: 12, marginTop: spacing.md },
  eyebrow: { color: colors.rose, fontFamily: typography.label, fontSize: 11, letterSpacing: 1.2, marginTop: spacing.xl },
  paragraph: { color: colors.mutedInk, fontFamily: typography.body, fontSize: 14, lineHeight: 22, marginTop: spacing.sm },
  pressed: { opacity: 0.62 },
  related: { marginTop: spacing.xxl },
  relatedLink: { alignItems: 'center', borderBottomColor: colors.keyline, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 52 },
  relatedLinkText: { color: colors.plumInk, fontFamily: typography.bodyStrong, fontSize: 14 },
  relatedTitle: { color: colors.rose, fontFamily: typography.label, fontSize: 11, letterSpacing: 1.2 },
  screen: { backgroundColor: colors.parchment, flex: 1 },
  section: { paddingVertical: spacing.xs },
  sectionDivider: { borderTopColor: colors.keyline, borderTopWidth: 1, marginTop: spacing.xl, paddingTop: spacing.xl },
  sectionTitle: { color: colors.plumInk, fontFamily: typography.display, fontSize: 20, lineHeight: 25 },
  summary: { color: colors.mutedInk, fontFamily: typography.body, fontSize: 16, lineHeight: 24, marginTop: spacing.md, maxWidth: 620 },
  title: { color: colors.plumInk, fontFamily: typography.display, fontSize: 38, letterSpacing: -1.1, lineHeight: 44, marginTop: spacing.sm },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  wordmark: { color: colors.rose, fontFamily: typography.display, fontSize: 20 },
});
