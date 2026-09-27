import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

import { executeSupabaseAccountDeletion } from '../supabase/functions/_shared/supabase-account-deletion.ts';

type InputErrorCode =
  | 'confirmation_mismatch'
  | 'invalid_request_reference'
  | 'invalid_user_id'
  | 'missing_argument';

export interface AccountDeletionRequestInput {
  requestReference: string;
  userId: string;
}

export class AccountDeletionRequestInputError extends Error {
  constructor(public readonly code: InputErrorCode) {
    super(code);
    this.name = 'AccountDeletionRequestInputError';
  }
}

export function parseAccountDeletionRequestInput(args: string[]): AccountDeletionRequestInput {
  const userId = readArgument(args, '--user-id');
  const confirmedUserId = readArgument(args, '--confirm-user-id');
  const requestReference = readArgument(args, '--request-reference');
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const safeReferencePattern = /^[a-z0-9][a-z0-9_-]{2,63}$/i;

  if (!uuidPattern.test(userId) || !uuidPattern.test(confirmedUserId)) {
    throw new AccountDeletionRequestInputError('invalid_user_id');
  }
  if (userId.toLowerCase() !== confirmedUserId.toLowerCase()) {
    throw new AccountDeletionRequestInputError('confirmation_mismatch');
  }
  if (!safeReferencePattern.test(requestReference)) {
    throw new AccountDeletionRequestInputError('invalid_request_reference');
  }

  return { requestReference, userId: userId.toLowerCase() };
}

function readArgument(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1]?.trim() : '';
  if (!value || value.startsWith('--')) throw new AccountDeletionRequestInputError('missing_argument');
  return value;
}

async function main(): Promise<void> {
  const input = parseAccountDeletionRequestInput(Deno.args);
  const supabaseUrl = requiredEnvironment('SUPABASE_URL');
  const serviceRoleKey = requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY');
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const target = await admin.auth.admin.getUserById(input.userId);
  if (target.error || !target.data.user) throw new Error('target_account_not_found');

  const operationId = crypto.randomUUID();
  const result = await executeSupabaseAccountDeletion(admin, operationId, input.userId);
  console.log(JSON.stringify({
    cleanupPending: result.cleanupPending,
    operationId,
    requestReference: input.requestReference,
    status: result.cleanupPending ? 'deleted_cleanup_pending' : 'deleted',
    userId: input.userId,
  }));
}

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    const code = error instanceof AccountDeletionRequestInputError ? error.code : 'request_failed';
    console.error(JSON.stringify({ status: code }));
    Deno.exit(1);
  }
}
