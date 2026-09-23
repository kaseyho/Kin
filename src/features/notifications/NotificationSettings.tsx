import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { InlineNotice } from '@/components/InlineNotice';
import { colors, radii, spacing, typography } from '@/design/tokens';
import { useNotifications } from '@/state/useNotifications';

export function NotificationSettings() {
  const notifications = useNotifications();
  const { state } = notifications;
  const grantedAndConnected = state.status === 'granted' && state.installationRegistered;

  return (
    <View style={styles.section}>
      <Text style={styles.label}>NOTIFICATIONS</Text>
      <Text style={styles.title}>{titleForState(state.status, state.installationRegistered)}</Text>
      <Text style={styles.copy}>{state.message ?? copyForState(state.status, state.installationRegistered)}</Text>

      {state.status === 'not-determined' ? (
        <ActionButton
          disabled={notifications.busy}
          label={notifications.busy ? 'Enabling…' : 'Enable message notifications'}
          onPress={() => void notifications.requestPermissionAndRegister()}
        />
      ) : null}

      {state.status === 'denied' ? (
        <ActionButton label="Open device settings" onPress={() => void notifications.openSettings()} />
      ) : null}

      {state.status === 'granted' && !state.installationRegistered ? (
        <ActionButton
          disabled={notifications.busy}
          label={notifications.busy ? 'Connecting…' : 'Reconnect this device'}
          onPress={() => void notifications.setCurrentDeviceEnabled(true)}
        />
      ) : null}

      {grantedAndConnected ? (
        <>
          <View style={styles.preferenceRow}>
            <View style={styles.preferenceCopy}>
              <Text style={styles.preferenceTitle}>Show message previews</Text>
              <Text style={styles.preferenceHint}>Include message text in notification banners.</Text>
            </View>
            <Switch
              accessibilityLabel="Show message previews"
              disabled={notifications.busy}
              onValueChange={(enabled) => void notifications.setPreviewsEnabled(enabled)}
              trackColor={{ false: colors.keyline, true: '#D9A7B7' }}
              thumbColor={state.previewsEnabled ? colors.rose : colors.paper}
              value={state.previewsEnabled}
            />
          </View>
          <Pressable
            accessibilityLabel="Turn off notifications on this device"
            accessibilityRole="button"
            disabled={notifications.busy}
            onPress={() => void notifications.setCurrentDeviceEnabled(false)}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryText}>Turn off on this device</Text>
          </Pressable>
        </>
      ) : null}

      {notifications.error ? <InlineNotice message={notifications.error} /> : null}
    </View>
  );
}

function ActionButton({
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
      style={({ pressed }) => [styles.primaryButton, disabled && styles.disabled, pressed && styles.pressed]}
    >
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

function titleForState(status: string, registered: boolean): string {
  if (status === 'loading') return 'Checking message notifications';
  if (status === 'configuration-required') return 'Build setup needed';
  if (status === 'unavailable') return 'Not available in this build';
  if (status === 'denied') return 'Notifications are off';
  if (status === 'granted' && registered) return 'Message notifications are on';
  if (status === 'granted') return 'Notifications are off on this device';
  return 'Stay close when you’re apart';
}

function copyForState(status: string, registered: boolean): string {
  if (status === 'loading') return 'Kin is checking this device.';
  if (status === 'denied') return 'Allow notifications in device settings to hear when your person writes.';
  if (status === 'granted' && registered) return 'This device can receive a private heads-up for new messages.';
  if (status === 'not-determined') return 'Kin asks only when you choose to enable them.';
  return 'Message notifications require the connected iOS or Android app.';
}

const styles = StyleSheet.create({
  copy: { color: colors.mutedInk, fontFamily: typography.body, fontSize: 14, lineHeight: 21, marginTop: spacing.sm },
  disabled: { opacity: 0.5 },
  label: { color: colors.rose, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  preferenceCopy: { flex: 1, paddingRight: spacing.md },
  preferenceHint: { color: colors.mutedInk, fontFamily: typography.body, fontSize: 12, lineHeight: 18, marginTop: 2 },
  preferenceRow: { alignItems: 'center', borderTopColor: colors.keyline, borderTopWidth: 1, flexDirection: 'row', marginTop: spacing.lg, minHeight: 64, paddingVertical: spacing.sm },
  preferenceTitle: { color: colors.plumInk, fontFamily: typography.bodyStrong, fontSize: 14 },
  pressed: { opacity: 0.68 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.rose, borderRadius: radii.round, justifyContent: 'center', marginTop: spacing.lg, minHeight: 48, paddingHorizontal: spacing.lg },
  primaryText: { color: colors.paper, fontFamily: typography.bodyStrong, fontSize: 14 },
  secondaryButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.md },
  secondaryText: { color: colors.rose, fontFamily: typography.bodyStrong, fontSize: 13 },
  section: { borderTopColor: colors.keyline, borderTopWidth: 1, gap: spacing.sm, marginTop: spacing.xxl, paddingTop: spacing.xl },
  title: { color: colors.plumInk, fontFamily: typography.display, fontSize: 19, fontWeight: '800', marginTop: spacing.sm },
});
