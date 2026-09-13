import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { createRepository } from '@/data/createRepository';
import { colors } from '@/design/tokens';
import { KinProvider } from '@/state/KinProvider';
import { PremiumProvider } from '@/features/premium/PremiumProvider';
import { createPremiumService } from '@/services/billing';

const repository = createRepository(AsyncStorage);
const premiumService = createPremiumService(AsyncStorage);

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PremiumProvider service={premiumService}>
        <KinProvider repository={repository}>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              animation: 'fade',
              contentStyle: { backgroundColor: colors.parchment },
              headerShown: false,
            }}
          />
        </KinProvider>
      </PremiumProvider>
    </GestureHandlerRootView>
  );
}
