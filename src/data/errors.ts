export type RepositoryErrorCode =
  | 'auth_required'
  | 'confirmation_required'
  | 'demo_snapshot_corrupt'
  | 'forbidden'
  | 'blocked'
  | 'already_member'
  | 'invite_expired'
  | 'invite_invalid'
  | 'invite_revoked'
  | 'invite_self'
  | 'invite_used'
  | 'load_failed'
  | 'memory_limit'
  | 'message_invalid'
  | 'not_found'
  | 'profile_required'
  | 'report_invalid'
  | 'save_failed'
  | 'space_full'
  | 'unavailable';

export class RepositoryError extends Error {
  constructor(
    readonly code: RepositoryErrorCode,
    message: string,
    readonly recovery?: 'retry' | 'reset' | 'reenter' | 'onboard' | 'reconnect',
  ) {
    super(message);
    this.name = 'RepositoryError';
  }
}
