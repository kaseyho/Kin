export type RepositoryErrorCode =
  | 'auth_required'
  | 'confirmation_required'
  | 'demo_snapshot_corrupt'
  | 'forbidden'
  | 'invite_invalid'
  | 'load_failed'
  | 'message_invalid'
  | 'not_found'
  | 'profile_required'
  | 'save_failed'
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
