import { PropsWithChildren, useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

import { colors, radii, spacing } from '@/design/tokens';

interface AccessibleSheetProps extends PropsWithChildren {
  closeDisabled?: boolean;
  closeLabel: string;
  label: string;
  onClose: () => void;
  sheetStyle?: StyleProp<ViewStyle>;
  testID?: string;
  visible: boolean;
}

export function AccessibleSheet({
  children,
  closeDisabled = false,
  closeLabel,
  label,
  onClose,
  sheetStyle,
  testID,
  visible,
}: AccessibleSheetProps) {
  const sheetRef = useRef<View>(null);
  const closeDisabledRef = useRef(closeDisabled);
  const onCloseRef = useRef(onClose);
  const returnFocusRef = useRef<View | HTMLElement | null>(null);

  closeDisabledRef.current = closeDisabled;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!visible) return;
    returnFocusRef.current = null;
    if (Platform.OS !== 'web') {
      const handle = findNodeHandle(sheetRef.current);
      if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
      return;
    }
    if (typeof document === 'undefined') return;

    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const sheetElement = sheetRef.current as unknown as HTMLElement | null;
    requestAnimationFrame(() => sheetElement?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        requestClose();
        return;
      }
      if (event.key !== 'Tab' || !sheetElement) return;
      const focusable = [...sheetElement.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )].filter((element) => element.getAttribute('aria-disabled') !== 'true');
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === sheetElement)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || active === sheetElement)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [visible]);

  function requestClose() {
    if (closeDisabledRef.current) return;
    onCloseRef.current();
    requestAnimationFrame(() => {
      if (Platform.OS === 'web') {
        (returnFocusRef.current as HTMLElement | null)?.focus?.();
        return;
      }
      const handle = findNodeHandle(returnFocusRef.current as View | null);
      if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
    });
  }

  if (!visible) return null;
  const webDialogProps = Platform.OS === 'web'
    ? ({ 'aria-label': label, role: 'dialog', tabIndex: -1 } as object)
    : {};

  return (
    <View accessibilityViewIsModal style={styles.overlay} testID={testID}>
      <Pressable
        accessibilityLabel={closeLabel}
        accessibilityRole="button"
        disabled={closeDisabled}
        onPress={requestClose}
        style={styles.scrim}
      />
      <View ref={sheetRef} style={[styles.sheet, sheetStyle]} {...webDialogProps}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    bottom: 0,
    justifyContent: 'flex-end',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 30,
  },
  scrim: {
    backgroundColor: 'rgba(47,35,43,0.34)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    maxHeight: '88%',
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
});
