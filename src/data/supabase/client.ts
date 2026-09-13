import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { StorageAdapter } from '@/data/contracts';
import type { Database } from './database.types';

export function createSupabaseClient({
  publishableKey,
  storage,
  url,
}: {
  publishableKey: string;
  storage: StorageAdapter;
  url: string;
}): SupabaseClient<Database> {
  return createClient<Database>(url, publishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      persistSession: true,
      storage,
    },
  });
}
