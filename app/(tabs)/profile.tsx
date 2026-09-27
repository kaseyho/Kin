import { type Href, useRouter } from 'expo-router';

import { ProfileScreen } from '@/features/profile/ProfileScreen';
import { legalDocumentPaths } from '@/features/legal/legalDocuments';

export default function ProfileRoute() {
  const router = useRouter();
  return (
    <ProfileScreen
      onOpenKinPlus={() => router.push('/kin-plus')}
      onOpenLegal={(documentId) => router.push(legalDocumentPaths[documentId] as Href)}
      onSignedOut={() => router.replace('/')}
    />
  );
}
