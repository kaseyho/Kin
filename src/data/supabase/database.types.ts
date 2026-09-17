import type {
  InviteRow,
  MemberRow,
  MemoryMessageRow,
  MemoryRow,
  MessageRow,
  ProfileRow,
  ReactionRow,
  SpaceRow,
  ThemeRow,
} from './mappers';

type Shape<Row extends object> = { [Key in keyof Row]: Row[Key] };

type Table<Row extends object, Insert extends object = Partial<Shape<Row>>, Update extends object = Partial<Shape<Row>>> = {
  Row: Shape<Row>;
  Insert: Shape<Insert>;
  Update: Shape<Update>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: Table<ProfileRow>;
      kin_spaces: Table<SpaceRow>;
      kin_space_members: Table<MemberRow>;
      space_themes: Table<ThemeRow>;
      messages: Table<MessageRow>;
      message_reactions: Table<ReactionRow>;
      memory_items: Table<MemoryRow>;
      memory_item_messages: Table<MemoryMessageRow>;
      space_invites: Table<InviteRow & { created_by: string }>;
      user_blocks: Table<{
        blocker_id: string;
        blocked_id: string;
        space_id: string | null;
        created_at: string;
      }>;
      content_reports: Table<{
        id: string;
        reporter_id: string | null;
        reported_user_id: string | null;
        space_id: string | null;
        message_id: string | null;
        category: string;
        explanation: string;
        status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
        status_updated_at: string;
        created_at: string;
        retention_expires_at: string;
      }>;
      account_storage_cleanup_jobs: Table<{
        id: string;
        operation_id: string;
        owner_id: string;
        bucket_id: 'avatars' | 'chat-media';
        target_kind: 'object' | 'prefix';
        target_path: string;
        status: 'prepared' | 'pending' | 'processing' | 'completed';
        attempts: number;
        last_error_code: string;
        created_at: string;
        updated_at: string;
        processing_started_at: string | null;
        processing_token: string | null;
        completed_at: string | null;
      }>;
      operator_maintenance_status: Table<{
        worker: 'storage-cleanup';
        last_started_at: string | null;
        last_succeeded_at: string | null;
        last_status: 'never' | 'running' | 'succeeded' | 'incomplete';
        last_claimed: number;
        last_failed: number;
        updated_at: string;
      }>;
    };
    Views: Record<string, never>;
    Functions: {
      prepare_account_deletion: {
        Args: { target_user_id: string };
        Returns: undefined;
      };
      prepare_account_storage_cleanup: {
        Args: { target_operation_id: string; target_user_id: string };
        Returns: number;
      };
      claim_account_storage_cleanup_jobs: {
        Args: {
          target_operation_id?: string | null;
          target_owner_id?: string | null;
          maximum_jobs?: number;
        };
        Returns: {
          id: string;
          operation_id: string;
          owner_id: string;
          bucket_id: 'avatars' | 'chat-media';
          target_kind: 'object' | 'prefix';
          target_path: string;
          attempts: number;
          processing_token: string;
        }[];
      };
      purge_finished_storage_cleanup_jobs: {
        Args: Record<string, never>;
        Returns: number;
      };
      purge_expired_content_reports: {
        Args: Record<string, never>;
        Returns: number;
      };
      update_content_report_status: {
        Args: { target_report_id: string; next_status: string };
        Returns: boolean;
      };
      redeem_space_invite: {
        Args: { invite_code: string };
        Returns: string;
      };
      create_kin_space: {
        Args: { other_display_name: string; relationship_start_date: string | null };
        Returns: string;
      };
      rotate_space_invite: {
        Args: { target_space_id: string };
        Returns: InviteRow;
      };
      revoke_space_invite: {
        Args: { target_space_id: string };
        Returns: InviteRow;
      };
      leave_kin_space: {
        Args: { target_space_id: string };
        Returns: undefined;
      };
      block_kin_space_member: {
        Args: { target_space_id: string };
        Returns: undefined;
      };
      submit_content_report: {
        Args: {
          target_space_id: string;
          target_message_id: string | null;
          report_category: string;
          report_explanation: string;
        };
        Returns: { id: string; created_at: string };
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
