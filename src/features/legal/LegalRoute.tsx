import { type Href, useRouter } from 'expo-router';

import { readPublicSupportEmail } from '@/config/support';
import { LegalDocumentScreen } from './LegalDocumentScreen';
import { legalDocumentPaths, type LegalDocumentId } from './legalDocuments';

interface LegalRouteProps {
  documentId: LegalDocumentId;
}

export function LegalRoute({ documentId }: LegalRouteProps) {
  const router = useRouter();

  function closeDocument() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  return (
    <LegalDocumentScreen
      documentId={documentId}
      onBack={closeDocument}
      onOpenDocument={(nextDocumentId) => router.push(legalDocumentPaths[nextDocumentId] as Href)}
      supportEmail={readPublicSupportEmail()}
    />
  );
}
