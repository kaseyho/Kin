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
        reporter_id: string;
        reported_user_id: string | null;
        space_id: string | null;
        message_id: string | null;
        category: string;
        explanation: string;
        status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
        created_at: string;
      }>;
    };
    Views: Record<string, never>;
    Functions: {
      prepare_account_deletion: {
        Args: { target_user_id: string };
        Returns: undefined;
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
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
