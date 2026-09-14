import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenState } from '@/components/ScreenState';
import { colors, radii, spacing, typography } from '@/design/tokens';
import { usePremiumGate } from './usePremiumGate';

export function KinPlusScreen({ onClose }: { onClose: () => void }) {
  const premium = usePremiumGate();
  if (premium.loading) return <ScreenState message="Finding the right Kin+ options…" title="Kin+" />;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable accessibilityLabel="Close Kin+" accessibilityRole="button" onPress={onClose} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable>
        <Text style={styles.wordmark}>kin+</Text>
        <View style={styles.close} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>DEEPER EXPRESSION. MORE ROOM TO KEEP.</Text>
        <Text accessibilityRole="header" style={styles.title}>{premium.entitlement.isKinPlus ? 'Kin+ is active' : 'Make each relationship feel more like yours.'}</Text>
        <Text style={styles.intro}>Messaging stays free. Every Moment you have already saved remains readable and editable.</Text>

        {premium.entitlement.isKinPlus ? (
          <View style={styles.activeCard}>
            <Text style={styles.activeMark}>✓</Text>
            <View style={styles.featureCopy}>
              <Text style={styles.activeTitle}>Kin+ is active</Text>
              <Text style={styles.activeCopy}>{premium.entitlement.source === 'demo' ? 'Demo entitlement' : 'Purchase entitlement'} · Premium themes and unlimited new Moments are unlocked.</Text>
            </View>
          </View>
        ) : (
          <>
            <Feature title="Relationship themes" copy="Moonlit, Marigold, Evergreen, and premium wallpapers for each Kin Space." />
            <Feature title="Unlimited Moments" copy="Keep every message that matters beyond the five free saved items in each Space." />
            {premium.entitlement.source === 'unavailable' && !premium.offering ? (
              <View style={styles.unavailable}>
                <Text style={styles.unavailableTitle}>Purchases need a configured development build</Text>
                <Text style={styles.featureText}>Use the local demo entitlement for product testing, or add public RevenueCat platform keys to a native Expo development build.</Text>
              </View>
            ) : null}
            {premium.offering?.packages.map((item) => (
              <Pressable
                accessibilityLabel={item.id === 'demo-kin-plus' ? 'Try Kin+ in demo' : `Choose ${item.title}, ${item.priceLabel}`}
                accessibilityRole="button"
                key={item.id}
                onPress={() => premium.purchase(item.id)}
                style={styles.package}
              >
                <View style={styles.featureCopy}>
                  <Text style={styles.packageTitle}>{item.id === 'demo-kin-plus' ? 'Try Kin+ in demo' : item.title}</Text>
                  <Text style={styles.packagePrice}>{item.priceLabel}</Text>
                </View>
                <Text style={styles.packageArrow}>›</Text>
              </Pressable>
            ))}
          </>
        )}

        {premium.error ? (
          <View style={styles.errorBox}>
            <Text accessibilityRole="alert" style={styles.error}>{premium.error}</Text>
            <Pressable accessibilityLabel="Retry purchase" accessibilityRole="button" onPress={premium.retryPurchase} style={styles.retry}><Text style={styles.retryText}>Retry</Text></Pressable>
          </View>
        ) : null}
        {premium.restoreNotice ? <Text accessibilityLiveRegion="polite" style={styles.restoreNotice}>{premium.restoreNotice}</Text> : null}
        <Pressable accessibilityLabel="Restore purchases" accessibilityRole="button" onPress={premium.restore} style={styles.restore}><Text style={styles.restoreText}>Restore purchases</Text></Pressable>
        <Text style={styles.finePrint}>Kin+ changes how a relationship can look and how many new Moments you can create. It never gates ordinary messages or takes away saved history.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Feature({ copy, title }: { copy: string; title: string }) {
  return <View style={styles.feature}><Text style={styles.featureMark}>⌞</Text><View style={styles.featureCopy}><Text style={styles.featureTitle}>{title}</Text><Text style={styles.featureText}>{copy}</Text></View></View>;
}

const styles = StyleSheet.create({
  activeCard: { alignItems: 'center', backgroundColor: '#E4EFE9', borderColor: '#BCD3C6', borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', gap: spacing.md, marginTop: spacing.xxl, padding: spacing.xl },
  activeCopy: { color: colors.mutedInk, fontSize: 13, lineHeight: 19, marginTop: spacing.xs },
  activeMark: { color: colors.success, fontSize: 28, fontWeight: '900' },
  activeTitle: { color: colors.plumInk, fontFamily: typography.display, fontSize: 18, fontWeight: '800' },
  close: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  closeText: { color: colors.plumInk, fontSize: 30 },
  content: { alignSelf: 'center', maxWidth: 620, padding: spacing.xl, paddingBottom: 72, width: '100%' },
  error: { color: colors.danger, flex: 1, fontSize: 13, lineHeight: 19 },
  errorBox: { alignItems: 'center', backgroundColor: '#FBE9E8', borderRadius: radii.md, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, padding: spacing.md },
  eyebrow: { color: colors.rose, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  feature: { alignItems: 'flex-start', borderBottomColor: colors.keyline, borderBottomWidth: 1, flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.xl },
  featureCopy: { flex: 1 },
  featureMark: { color: colors.rose, fontSize: 23, fontWeight: '900' },
  featureText: { color: colors.mutedInk, fontSize: 13, lineHeight: 19, marginTop: spacing.xs },
  featureTitle: { color: colors.plumInk, fontFamily: typography.display, fontSize: 18, fontWeight: '800' },
  finePrint: { color: colors.mutedInk, fontSize: 11, lineHeight: 17, marginTop: spacing.xl, textAlign: 'center' },
  intro: { color: colors.mutedInk, fontFamily: typography.body, fontSize: 15, lineHeight: 23, marginTop: spacing.md },
  package: { alignItems: 'center', backgroundColor: colors.plumInk, borderRadius: radii.lg, flexDirection: 'row', marginTop: spacing.md, minHeight: 72, padding: spacing.lg },
  packageArrow: { color: colors.paper, fontSize: 28 },
  packagePrice: { color: '#D9CDD3', fontSize: 12, marginTop: spacing.xs },
  packageTitle: { color: colors.paper, fontSize: 17, fontWeight: '800' },
  restore: { alignItems: 'center', justifyContent: 'center', marginTop: spacing.xl, minHeight: 48 },
  restoreNotice: { color: colors.success, fontSize: 13, fontWeight: '700', marginTop: spacing.lg, textAlign: 'center' },
  restoreText: { color: colors.plumInk, fontSize: 14, fontWeight: '800', textDecorationLine: 'underline' },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  retryText: { color: colors.danger, fontSize: 13, fontWeight: '900' },
  screen: { backgroundColor: colors.parchment, flex: 1 },
  title: { color: colors.plumInk, fontFamily: typography.display, fontSize: 34, fontWeight: '800', letterSpacing: -1.1, lineHeight: 41, marginTop: spacing.md },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.md },
  unavailable: { backgroundColor: colors.paper, borderColor: colors.keyline, borderRadius: radii.md, borderWidth: 1, marginTop: spacing.xl, padding: spacing.lg },
  unavailableTitle: { color: colors.plumInk, fontSize: 15, fontWeight: '800' },
  wordmark: { color: colors.rose, fontFamily: typography.display, fontSize: 16, fontWeight: '900' },
});
