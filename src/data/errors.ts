export type RepositoryErrorCode =
  | 'confirmation_required'
  | 'demo_snapshot_corrupt'
  | 'forbidden'
  | 'invite_invalid'
  | 'message_invalid'
  | 'not_found'
  | 'profile_required';

export class RepositoryError extends Error {
  constructor(
    readonly code: RepositoryErrorCode,
    message: string,
    readonly recovery?: 'retry' | 'reset' | 'reenter' | 'onboard',
  ) {
    super(message);
    this.name = 'RepositoryError';
  }
}
