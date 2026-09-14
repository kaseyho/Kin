import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { colors } from '@/design/tokens';
import { readDemoDate } from '@/config/demoDate';
import { ChatScreen } from '@/features/chats/ChatScreen';
import { RelationshipPanel } from '@/features/spaces/RelationshipPanel';
import { expoMediaPicker } from '@/services/media/expo';

export default function SpaceRoute() {
  const { demoDate: rawDemoDate, spaceId } = useLocalSearchParams<{ demoDate?: string; spaceId: string }>();
  const demoDate = readDemoDate(rawDemoDate);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const conversation = (
    <ChatScreen
      mediaPicker={expoMediaPicker}
      onOpenKinPlus={() => router.push('/kin-plus' as Href)}
      onOpenRelationship={() =>
        router.push({
          pathname: '/space/[spaceId]/relationship',
          params: { ...(demoDate ? { demoDate } : {}), spaceId },
        })
      }
      spaceId={spaceId}
    />
  );
  if (width < 960) return conversation;

  return (
    <View style={styles.workspace} testID="wide-space-workspace">
      <View style={styles.conversationPane}>{conversation}</View>
      <View style={styles.relationshipPane} testID="wide-relationship-panel">
        <RelationshipPanel
          onOpenKinPlus={() => router.push('/kin-plus' as Href)}
          onOpenMemory={(memoryId) => router.push(`/moment/${memoryId}` as Href)}
          onOpenTimeline={() => router.push(`/space/${spaceId}/timeline` as Href)}
          onSpaceUnavailable={() => router.replace('/(tabs)/chats')}
          spaceId={spaceId}
          today={demoDate}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  conversationPane: {
    borderColor: '#5B4451',
    borderRadius: 24,
    borderWidth: 1,
    flex: 1,
    maxWidth: 680,
    minWidth: 0,
    overflow: 'hidden',
  },
  relationshipPane: {
    borderColor: '#5B4451',
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    width: 430,
  },
  workspace: {
    backgroundColor: colors.plumInk,
    flex: 1,
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'center',
    padding: 16,
  },
});
