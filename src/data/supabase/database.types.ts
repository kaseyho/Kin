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
      space_invites: Table<InviteRow & { id: string; created_by: string; created_at: string; expires_at: string; max_uses: number; use_count: number }>;
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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
