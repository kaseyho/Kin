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
      push_installations: Table<{
        id: string;
        user_id: string;
        installation_id: string;
        expo_push_token: string;
        platform: 'ios' | 'android';
        active: boolean;
        created_at: string;
        updated_at: string;
        last_seen_at: string;
      }>;
      message_notification_outbox: Table<{
        id: string;
        message_id: string;
        space_id: string;
        recipient_id: string;
        status: 'pending' | 'processing' | 'ticketed' | 'delivered' | 'failed';
        attempts: number;
        next_attempt_at: string;
        processing_started_at: string | null;
        processing_token: string | null;
        expo_ticket_id: string | null;
        last_error_code: string;
        created_at: string;
        updated_at: string;
        completed_at: string | null;
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
      send_kin_message: {
        Args: {
          client_message_id: string;
          target_space_id: string;
          message_kind: MessageRow['kind'];
          message_body: string;
          message_media_uri?: string | null;
        };
        Returns: MessageRow;
      };
      list_space_messages: {
        Args: {
          target_space_id: string;
          before_created_at?: string | null;
          before_message_id?: string | null;
          page_size?: number;
        };
        Returns: MessageRow[];
      };
      mark_space_read: {
        Args: { target_space_id: string };
        Returns: string;
      };
      get_my_unread_counts: {
        Args: Record<string, never>;
        Returns: { space_id: string; unread_count: number }[];
      };
      register_push_installation: {
        Args: {
          target_installation_id: string;
          target_expo_push_token: string;
          target_platform: 'ios' | 'android';
        };
        Returns: string;
      };
      deactivate_push_installation: {
        Args: { target_installation_id: string };
        Returns: boolean;
      };
      claim_message_notification_jobs: {
        Args: { maximum_jobs?: number };
        Returns: {
          id: string;
          message_id: string;
          space_id: string;
          recipient_id: string;
          attempts: number;
          processing_token: string;
        }[];
      };
      complete_message_notification_job: {
        Args: {
          target_job_id: string;
          target_processing_token: string;
          target_expo_ticket_id: string;
        };
        Returns: boolean;
      };
      fail_message_notification_job: {
        Args: {
          target_job_id: string;
          target_processing_token: string;
          target_error_code: string;
          target_next_attempt_at?: string | null;
        };
        Returns: boolean;
      };
      complete_message_notification_receipt: {
        Args: {
          target_job_id: string;
          target_expo_ticket_id: string;
          target_delivered: boolean;
          target_error_code?: string;
        };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
