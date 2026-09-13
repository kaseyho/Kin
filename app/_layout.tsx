import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { createDemoKinRepository } from '@/data/demo/DemoKinRepository';
import { colors } from '@/design/tokens';
import { KinProvider } from '@/state/KinProvider';

const repository = createDemoKinRepository(AsyncStorage);

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
    </GestureHandlerRootView>
  );
}
