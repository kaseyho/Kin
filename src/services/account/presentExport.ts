import { Platform, Share } from 'react-native';

import type { AccountExport } from './contracts';

export async function presentAccountExport(data: AccountExport): Promise<void> {
  const serialized = JSON.stringify(data, null, 2);
  const date = data.exportedAt.slice(0, 10);
  const filename = `kin-account-export-${date}.json`;

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const url = URL.createObjectURL(new Blob([serialized], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return;
  }

  await Share.share({ message: serialized, title: filename });
}
