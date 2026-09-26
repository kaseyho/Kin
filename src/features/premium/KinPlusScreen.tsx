import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenState } from '@/components/ScreenState';
import { colors, radii, spacing, typography } from '@/design/tokens';
import { usePremiumGate } from './usePremiumGate';

export function KinPlusScreen({ onClose }: { onClose: () => void }) {
  const premium = usePremiumGate();
  if (premium.sessionStatus === 'waiting' || premium.sessionStatus === 'activating') {
    return <ScreenState message="Connecting Kin+ to your account…" title="Kin+" />;
  }

  if (premium.sessionStatus === 'error') {
    return (
      <SafeAreaView style={styles.screen}>
        <TopBar onClose={onClose} />
        <View style={styles.centeredState}>
          <Text accessibilityRole="header" style={styles.stateTitle}>Kin+ needs another try</Text>
          <Text accessibilityRole="alert" style={styles.stateCopy}>{premium.identityError}</Text>
          <Pressable
            accessibilityLabel="Retry Kin+ connection"
            accessibilityRole="button"
            onPress={() => void premium.retryActivation()}
            style={styles.primaryAction}
          >
            <Text style={styles.primaryActionText}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (premium.sessionStatus === 'inactive') {
    return <ScreenState message="Sign in to see Kin+ options." title="Kin+" />;
  }

  const transactionBusy = premium.transaction !== 'idle';

  return (
    <SafeAreaView style={styles.screen}>
      <TopBar onClose={onClose} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>DEEPER EXPRESSION. MORE ROOM TO KEEP.</Text>
        <Text accessibilityRole="header" style={styles.title}>
          {premium.entitlement.isKinPlus
            ? 'Kin+ is active'
            : 'Make each relationship feel more like yours.'}
        </Text>
        <Text style={styles.intro}>
          Messaging stays free. Every Moment you have already saved remains readable and editable.
        </Text>

        {premium.entitlement.isKinPlus ? (
          <>
            <View style={styles.activeCard}>
              <Text style={styles.activeMark}>✓</Text>
              <View style={styles.featureCopy}>
                <Text style={styles.activeTitle}>Kin+ is active</Text>
                <Text style={styles.activeCopy}>
                  {premium.entitlement.source === 'demo' ? 'Demo entitlement' : 'Purchase entitlement'}
                  {' · Premium themes and unlimited new Moments are unlocked.'}
                </Text>
                {premium.entitlement.expiresAt ? (
                  <Text style={styles.expiration}>{formatExpiration(premium.entitlement.expiresAt)}</Text>
                ) : null}
              </View>
            </View>
            {premium.entitlement.source === 'revenuecat' ? (
              <Pressable
                accessibilityLabel="Manage subscription"
                accessibilityRole="button"
                accessibilityState={{
                  busy: premium.transaction === 'manage',
                  disabled: transactionBusy,
                }}
                disabled={transactionBusy}
                onPress={() => void premium.manage()}
                style={[styles.manage, transactionBusy && styles.disabled]}
              >
                <Text style={styles.manageText}>
                  {premium.transaction === 'manage' ? 'Opening subscription management…' : 'Manage subscription'}
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <>
            <Feature title="Relationship themes" copy="Moonlit, Marigold, Evergreen, and premium wallpapers for each Kin Space." />
            <Feature title="Unlimited Moments" copy="Keep every message that matters beyond the five free saved items in each Space." />
            <OfferingState />
            {premium.offering?.packages.map((item) => {
              const details = [item.priceLabel, item.billingPeriodLabel, item.trialLabel]
                .filter(Boolean)
                .join(', ');
              return (
                <Pressable
                  accessibilityLabel={item.id === 'demo-kin-plus'
                    ? 'Try Kin+ in demo'
                    : `Choose ${item.title}, ${details}`}
                  accessibilityRole="button"
                  accessibilityState={{
                    busy: premium.transaction === 'purchase',
                    disabled: transactionBusy,
                  }}
                  disabled={transactionBusy}
                  key={item.id}
                  onPress={() => void premium.purchase(item.id)}
                  style={[styles.package, transactionBusy && styles.disabled]}
                >
                  <View style={styles.featureCopy}>
                    <Text style={styles.packageTitle}>
                      {item.id === 'demo-kin-plus' ? 'Try Kin+ in demo' : item.title}
                    </Text>
                    <Text style={styles.packagePrice}>
                      {[item.priceLabel, item.billingPeriodLabel].filter(Boolean).join(' · ')}
                    </Text>
                    {item.trialLabel ? <Text style={styles.packageTrial}>{item.trialLabel}</Text> : null}
                  </View>
                  <Text style={styles.packageArrow}>›</Text>
                </Pressable>
              );
            })}
          </>
        )}

        {premium.purchaseError ? (
          <ErrorAction
            actionLabel="Retry purchase"
            message={premium.purchaseError}
            onRetry={premium.retryPurchase}
          />
        ) : null}
        {premium.restoreError ? (
          <ErrorAction
            actionLabel="Retry restore"
            message={premium.restoreError}
            onRetry={premium.restore}
          />
        ) : null}
        {premium.managementError ? (
          <ErrorAction
            actionLabel="Retry subscription management"
            message={premium.managementError}
            onRetry={premium.manage}
          />
        ) : null}
        {premium.restoreNotice ? (
          <Text accessibilityLiveRegion="polite" style={styles.restoreNotice}>{premium.restoreNotice}</Text>
        ) : null}
        <Pressable
          accessibilityLabel="Restore purchases"
          accessibilityRole="button"
          accessibilityState={{
            busy: premium.transaction === 'restore',
            disabled: transactionBusy,
          }}
          disabled={transactionBusy}
          onPress={() => void premium.restore()}
          style={[styles.restore, transactionBusy && styles.disabled]}
        >
          <Text style={styles.restoreText}>
            {premium.transaction === 'restore' ? 'Restoring purchases…' : 'Restore purchases'}
          </Text>
        </Pressable>
        <Text style={styles.finePrint}>
          Kin+ changes how a relationship can look and how many new Moments you can create. It never gates ordinary messages or takes away saved history.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function OfferingState() {
  const premium = usePremiumGate();
  if (premium.offeringLoading) {
    return <Text accessibilityLiveRegion="polite" style={styles.offeringStatus}>Loading purchase options…</Text>;
  }
  if (premium.offeringError) {
    return (
      <ErrorAction
        actionLabel="Retry purchase options"
        message={premium.offeringError}
        onRetry={premium.retryOffering}
      />
    );
  }
  if (premium.offering) return null;
  const operatorCopy = premium.deployment === 'development' || premium.deployment === 'preview';
  return (
    <View style={styles.unavailable}>
      <Text style={styles.unavailableTitle}>
        {operatorCopy ? 'No Kin+ offering is available for this build' : 'Kin+ options are temporarily unavailable'}
      </Text>
      <Text style={styles.featureText}>
        {operatorCopy
          ? 'Check the current RevenueCat offering and this platform’s public SDK key, then try again.'
          : 'Restore an existing purchase, or try loading purchase options again shortly.'}
      </Text>
    </View>
  );
}

function ErrorAction({
  actionLabel,
  message,
  onRetry,
}: {
  actionLabel: string;
  message: string;
  onRetry: () => Promise<void>;
}) {
  return (
    <View style={styles.errorBox}>
      <Text accessibilityRole="alert" style={styles.error}>{message}</Text>
      <Pressable
        accessibilityLabel={actionLabel}
        accessibilityRole="button"
        onPress={() => void onRetry()}
        style={styles.retry}
      >
        <Text style={styles.retryText}>Retry</Text>
      </Pressable>
    </View>
  );
}

function Feature({ copy, title }: { copy: string; title: string }) {
  return (
    <View style={styles.feature}>
      <Text style={styles.featureMark}>⌞</Text>
      <View style={styles.featureCopy}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureText}>{copy}</Text>
      </View>
    </View>
  );
}

function TopBar({ onClose }: { onClose: () => void }) {
  return (
    <View style={styles.topBar}>
      <Pressable accessibilityLabel="Close Kin+" accessibilityRole="button" onPress={onClose} style={styles.close}>
        <Text style={styles.closeText}>×</Text>
      </Pressable>
      <Text style={styles.wordmark}>kin+</Text>
      <View style={styles.close} />
    </View>
  );
}

function formatExpiration(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Your current Kin+ access is active.';
  const label = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(date);
  return `Access through ${label}.`;
}

const styles = StyleSheet.create({
  activeCard: { alignItems: 'center', backgroundColor: '#E4EFE9', borderColor: '#BCD3C6', borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', gap: spacing.md, marginTop: spacing.xxl, padding: spacing.xl },
  activeCopy: { color: colors.mutedInk, fontSize: 13, lineHeight: 19, marginTop: spacing.xs },
  activeMark: { color: colors.success, fontSize: 28, fontWeight: '900' },
  activeTitle: { color: colors.plumInk, fontFamily: typography.display, fontSize: 18, fontWeight: '800' },
  centeredState: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.xl },
  close: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  closeText: { color: colors.plumInk, fontSize: 30 },
  content: { alignSelf: 'center', maxWidth: 620, padding: spacing.xl, paddingBottom: 72, width: '100%' },
  disabled: { opacity: 0.55 },
  error: { color: colors.danger, flex: 1, fontSize: 13, lineHeight: 19 },
  errorBox: { alignItems: 'center', backgroundColor: '#FBE9E8', borderRadius: radii.md, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, padding: spacing.md },
  eyebrow: { color: colors.rose, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  expiration: { color: colors.success, fontSize: 12, fontWeight: '700', marginTop: spacing.sm },
  feature: { alignItems: 'flex-start', borderBottomColor: colors.keyline, borderBottomWidth: 1, flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.xl },
  featureCopy: { flex: 1 },
  featureMark: { color: colors.rose, fontSize: 23, fontWeight: '900' },
  featureText: { color: colors.mutedInk, fontSize: 13, lineHeight: 19, marginTop: spacing.xs },
  featureTitle: { color: colors.plumInk, fontFamily: typography.display, fontSize: 18, fontWeight: '800' },
  finePrint: { color: colors.mutedInk, fontSize: 11, lineHeight: 17, marginTop: spacing.xl, textAlign: 'center' },
  intro: { color: colors.mutedInk, fontFamily: typography.body, fontSize: 15, lineHeight: 23, marginTop: spacing.md },
  manage: { alignItems: 'center', borderColor: colors.plumInk, borderRadius: radii.md, borderWidth: 1, justifyContent: 'center', marginTop: spacing.md, minHeight: 50, paddingHorizontal: spacing.lg },
  manageText: { color: colors.plumInk, fontSize: 14, fontWeight: '800' },
  offeringStatus: { color: colors.mutedInk, fontSize: 13, marginTop: spacing.xl, textAlign: 'center' },
  package: { alignItems: 'center', backgroundColor: colors.plumInk, borderRadius: radii.lg, flexDirection: 'row', marginTop: spacing.md, minHeight: 72, padding: spacing.lg },
  packageArrow: { color: colors.paper, fontSize: 28 },
  packagePrice: { color: '#D9CDD3', fontSize: 12, marginTop: spacing.xs },
  packageTitle: { color: colors.paper, fontSize: 17, fontWeight: '800' },
  packageTrial: { color: '#F4C6D3', fontSize: 11, fontWeight: '700', marginTop: spacing.xs },
  primaryAction: { alignItems: 'center', backgroundColor: colors.plumInk, borderRadius: radii.md, justifyContent: 'center', marginTop: spacing.xl, minHeight: 50, paddingHorizontal: spacing.xl },
  primaryActionText: { color: colors.paper, fontSize: 14, fontWeight: '800' },
  restore: { alignItems: 'center', justifyContent: 'center', marginTop: spacing.xl, minHeight: 48 },
  restoreNotice: { color: colors.success, fontSize: 13, fontWeight: '700', marginTop: spacing.lg, textAlign: 'center' },
  restoreText: { color: colors.plumInk, fontSize: 14, fontWeight: '800', textDecorationLine: 'underline' },
  retry: { justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.sm },
  retryText: { color: colors.danger, fontSize: 13, fontWeight: '900' },
  screen: { backgroundColor: colors.parchment, flex: 1 },
  stateCopy: { color: colors.danger, fontSize: 14, lineHeight: 21, marginTop: spacing.md, textAlign: 'center' },
  stateTitle: { color: colors.plumInk, fontFamily: typography.display, fontSize: 28, fontWeight: '800', textAlign: 'center' },
  title: { color: colors.plumInk, fontFamily: typography.display, fontSize: 34, fontWeight: '800', letterSpacing: -1.1, lineHeight: 41, marginTop: spacing.md },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.md },
  unavailable: { backgroundColor: colors.paper, borderColor: colors.keyline, borderRadius: radii.md, borderWidth: 1, marginTop: spacing.xl, padding: spacing.lg },
  unavailableTitle: { color: colors.plumInk, fontSize: 15, fontWeight: '800' },
  wordmark: { color: colors.rose, fontFamily: typography.display, fontSize: 16, fontWeight: '900' },
});
