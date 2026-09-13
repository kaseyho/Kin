create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  avatar_uri text not null default '',
  created_at timestamptz not null default now()
);

create table public.kin_spaces (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  relationship_start_date date,
  created_at timestamptz not null default now()
);

create table public.kin_space_members (
  space_id uuid not null references public.kin_spaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  archived boolean not null default false,
  primary key (space_id, user_id)
);

create table public.space_themes (
  space_id uuid not null references public.kin_spaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  nickname text not null default 'Your person' check (length(trim(nickname)) between 1 and 80),
  theme_id text not null default 'kin',
  wallpaper_id text not null default 'paper',
  primary key (space_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.kin_spaces(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('text', 'image', 'sticker')),
  body text not null default '',
  media_uri text,
  created_at timestamptz not null default now(),
  check (length(trim(body)) > 0 or media_uri is not null)
);

create table public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (length(emoji) between 1 and 32),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create table public.memory_items (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.kin_spaces(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('moment', 'important_date', 'plan')),
  visibility text not null default 'private' check (visibility in ('private', 'shared')),
  title text not null check (length(trim(title)) between 1 and 160),
  occurred_on date not null,
  note text not null default '',
  place text,
  media_uris text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memory_item_messages (
  memory_id uuid not null references public.memory_items(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  primary key (memory_id, message_id)
);

create table public.space_invites (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.kin_spaces(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{6,12}$'),
  expires_at timestamptz not null default (now() + interval '7 days'),
  max_uses integer not null default 1 check (max_uses between 1 and 20),
  use_count integer not null default 0 check (use_count between 0 and max_uses),
  created_at timestamptz not null default now()
);

create index kin_space_members_user_idx on public.kin_space_members (user_id, archived, joined_at desc);
create index messages_space_time_idx on public.messages (space_id, created_at);
create index memory_items_space_date_idx on public.memory_items (space_id, occurred_on desc);
create index memory_items_creator_idx on public.memory_items (created_by, updated_at desc);
create index space_invites_space_time_idx on public.space_invites (space_id, created_at desc);

create or replace function public.set_memory_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger memory_items_set_updated_at
before update on public.memory_items
for each row execute function public.set_memory_updated_at();

create or replace function public.is_space_member(target_space_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.kin_space_members
    where space_id = target_space_id and user_id = target_user_id
  );
$$;

create or replace function public.shares_space_with(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_user_id = auth.uid() or exists (
    select 1
    from public.kin_space_members mine
    join public.kin_space_members theirs on theirs.space_id = mine.space_id
    where mine.user_id = auth.uid() and theirs.user_id = target_user_id
  );
$$;

create or replace function public.is_space_creator(target_space_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.kin_spaces
    where id = target_space_id and created_by = target_user_id
  );
$$;

create or replace function public.safe_uuid(value text)
returns uuid
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  return value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

revoke all on function public.is_space_member(uuid, uuid) from public;
revoke all on function public.shares_space_with(uuid) from public;
revoke all on function public.is_space_creator(uuid, uuid) from public;
revoke all on function public.safe_uuid(text) from public;
grant execute on function public.is_space_member(uuid, uuid) to authenticated;
grant execute on function public.shares_space_with(uuid) to authenticated;
grant execute on function public.is_space_creator(uuid, uuid) to authenticated;
grant execute on function public.safe_uuid(text) to authenticated;

grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.profiles,
  public.kin_spaces,
  public.kin_space_members,
  public.space_themes,
  public.messages,
  public.message_reactions,
  public.memory_items,
  public.memory_item_messages,
  public.space_invites
to authenticated;
revoke update on public.kin_space_members from authenticated;
grant update (archived) on public.kin_space_members to authenticated;

alter table public.profiles enable row level security;
alter table public.kin_spaces enable row level security;
alter table public.kin_space_members enable row level security;
alter table public.space_themes enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.memory_items enable row level security;
alter table public.memory_item_messages enable row level security;
alter table public.space_invites enable row level security;

create policy profiles_select_relationships on public.profiles
for select to authenticated using (public.shares_space_with(id));
create policy profiles_insert_self on public.profiles
for insert to authenticated with check (id = auth.uid());
create policy profiles_update_self on public.profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_delete_self on public.profiles
for delete to authenticated using (id = auth.uid());

create policy spaces_select_members on public.kin_spaces
for select to authenticated using (public.is_space_member(id));
create policy spaces_insert_owner on public.kin_spaces
for insert to authenticated with check (created_by = auth.uid());
create policy spaces_update_owner on public.kin_spaces
for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy spaces_delete_owner on public.kin_spaces
for delete to authenticated using (created_by = auth.uid());

create policy members_select_space on public.kin_space_members
for select to authenticated using (public.is_space_member(space_id));
create policy members_insert_creator on public.kin_space_members
for insert to authenticated with check (
  user_id = auth.uid()
  and public.is_space_creator(space_id)
);
create policy members_update_self on public.kin_space_members
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy members_delete_self on public.kin_space_members
for delete to authenticated using (user_id = auth.uid());

create policy themes_select_members on public.space_themes
for select to authenticated using (public.is_space_member(space_id));
create policy themes_insert_self on public.space_themes
for insert to authenticated with check (user_id = auth.uid() and public.is_space_member(space_id));
create policy themes_update_self on public.space_themes
for update to authenticated using (user_id = auth.uid())
with check (user_id = auth.uid() and public.is_space_member(space_id));
create policy themes_delete_self on public.space_themes
for delete to authenticated using (user_id = auth.uid());

create policy messages_select_members on public.messages
for select to authenticated using (public.is_space_member(space_id));
create policy messages_insert_sender on public.messages
for insert to authenticated with check (sender_id = auth.uid() and public.is_space_member(space_id));
create policy messages_update_sender on public.messages
for update to authenticated using (sender_id = auth.uid())
with check (sender_id = auth.uid() and public.is_space_member(space_id));
create policy messages_delete_sender on public.messages
for delete to authenticated using (sender_id = auth.uid());

create policy reactions_select_members on public.message_reactions
for select to authenticated using (
  exists (
    select 1 from public.messages
    where messages.id = message_id and public.is_space_member(messages.space_id)
  )
);
create policy reactions_insert_self on public.message_reactions
for insert to authenticated with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.messages
    where messages.id = message_id and public.is_space_member(messages.space_id)
  )
);
create policy reactions_delete_self on public.message_reactions
for delete to authenticated using (user_id = auth.uid());

create policy memories_select_visible on public.memory_items
for select to authenticated using (
  public.is_space_member(space_id)
  and (visibility = 'shared' or created_by = auth.uid())
);
create policy memories_insert_creator on public.memory_items
for insert to authenticated with check (created_by = auth.uid() and public.is_space_member(space_id));
create policy memories_update_creator on public.memory_items
for update to authenticated using (created_by = auth.uid())
with check (created_by = auth.uid() and public.is_space_member(space_id));
create policy memories_delete_creator on public.memory_items
for delete to authenticated using (created_by = auth.uid());

create policy memory_messages_select_visible on public.memory_item_messages
for select to authenticated using (
  exists (
    select 1 from public.memory_items
    where memory_items.id = memory_id
  )
);
create policy memory_messages_insert_creator on public.memory_item_messages
for insert to authenticated with check (
  exists (
    select 1
    from public.memory_items
    join public.messages on messages.id = message_id
    where memory_items.id = memory_id
      and memory_items.created_by = auth.uid()
      and memory_items.space_id = messages.space_id
  )
);
create policy memory_messages_delete_creator on public.memory_item_messages
for delete to authenticated using (
  exists (
    select 1 from public.memory_items
    where memory_items.id = memory_id and memory_items.created_by = auth.uid()
  )
);

create policy invites_select_members on public.space_invites
for select to authenticated using (public.is_space_member(space_id));
create policy invites_insert_members on public.space_invites
for insert to authenticated with check (created_by = auth.uid() and public.is_space_member(space_id));
create policy invites_update_creator on public.space_invites
for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy invites_delete_creator on public.space_invites
for delete to authenticated using (created_by = auth.uid());

create or replace function public.redeem_space_invite(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_invite public.space_invites%rowtype;
  inserted_count integer;
  joining_user uuid := auth.uid();
begin
  if joining_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into selected_invite
  from public.space_invites
  where code = upper(trim(invite_code))
  for update;

  if not found or selected_invite.expires_at <= now() or selected_invite.use_count >= selected_invite.max_uses then
    raise exception 'Invite is invalid, expired, or fully redeemed' using errcode = 'P0001';
  end if;

  insert into public.kin_space_members (space_id, user_id, role)
  values (selected_invite.space_id, joining_user, 'member')
  on conflict (space_id, user_id) do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count = 1 then
    update public.space_invites
    set use_count = use_count + 1
    where id = selected_invite.id;
  end if;

  insert into public.space_themes (space_id, user_id)
  values (selected_invite.space_id, joining_user)
  on conflict (space_id, user_id) do nothing;

  return selected_invite.space_id;
end;
$$;

revoke all on function public.redeem_space_invite(text) from public;
grant execute on function public.redeem_space_invite(text) to authenticated;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false), ('chat-media', 'chat-media', false)
on conflict (id) do nothing;

create policy avatars_select_relationships on storage.objects
for select to authenticated using (
  bucket_id = 'avatars'
  and public.shares_space_with(public.safe_uuid((storage.foldername(name))[1]))
);
create policy avatars_insert_self on storage.objects
for insert to authenticated with check (
  bucket_id = 'avatars'
  and public.safe_uuid((storage.foldername(name))[1]) = auth.uid()
);
create policy avatars_update_self on storage.objects
for update to authenticated using (
  bucket_id = 'avatars'
  and public.safe_uuid((storage.foldername(name))[1]) = auth.uid()
);
create policy avatars_delete_self on storage.objects
for delete to authenticated using (
  bucket_id = 'avatars'
  and public.safe_uuid((storage.foldername(name))[1]) = auth.uid()
);

create policy chat_media_select_members on storage.objects
for select to authenticated using (
  bucket_id = 'chat-media'
  and public.is_space_member(public.safe_uuid((storage.foldername(name))[1]))
);
create policy chat_media_insert_self on storage.objects
for insert to authenticated with check (
  bucket_id = 'chat-media'
  and public.is_space_member(public.safe_uuid((storage.foldername(name))[1]))
  and public.safe_uuid((storage.foldername(name))[2]) = auth.uid()
);
create policy chat_media_delete_self on storage.objects
for delete to authenticated using (
  bucket_id = 'chat-media'
  and public.safe_uuid((storage.foldername(name))[2]) = auth.uid()
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'memory_items'
  ) then
    alter publication supabase_realtime add table public.memory_items;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'memory_item_messages'
  ) then
    alter publication supabase_realtime add table public.memory_item_messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'space_themes'
  ) then
    alter publication supabase_realtime add table public.space_themes;
  end if;
end;
$$;
