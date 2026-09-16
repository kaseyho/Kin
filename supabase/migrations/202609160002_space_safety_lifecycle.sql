alter table public.kin_space_members
add column left_at timestamptz;

alter table public.space_invites
add column revoked_at timestamptz,
add column redeemed_by uuid references public.profiles(id) on delete set null;

update public.space_invites
set max_uses = 1,
    use_count = least(use_count, 1);

alter table public.space_invites
drop constraint space_invites_max_uses_check,
add constraint space_invites_max_uses_check check (max_uses = 1);

create table public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  space_id uuid references public.kin_spaces(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid references public.profiles(id) on delete set null,
  space_id uuid references public.kin_spaces(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  category text not null check (category in ('harassment', 'threats', 'hate', 'sexual_content', 'spam', 'other')),
  explanation text not null default '' check (length(explanation) <= 2000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);

create index kin_space_members_active_space_idx
on public.kin_space_members (space_id, joined_at)
where left_at is null;

create index space_invites_active_space_idx
on public.space_invites (space_id, created_at desc)
where revoked_at is null and use_count = 0;

create index user_blocks_blocked_idx
on public.user_blocks (blocked_id, blocker_id);

create index content_reports_review_idx
on public.content_reports (status, created_at);

do $$
begin
  if exists (
    select 1
    from public.kin_space_members
    where left_at is null
    group by space_id
    having count(*) > 2
  ) then
    raise exception 'Existing data contains a Kin Space with more than two active members';
  end if;
end;
$$;

create or replace function public.enforce_two_active_space_members()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  active_member_count integer;
begin
  if new.left_at is not null then
    return new;
  end if;

  perform 1
  from public.kin_spaces
  where id = new.space_id
  for update;

  select count(*) into active_member_count
  from public.kin_space_members
  where space_id = new.space_id
    and user_id <> new.user_id
    and left_at is null;

  if active_member_count >= 2 then
    raise exception 'KIN_SPACE_FULL' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger kin_space_members_enforce_two_active
before insert or update of left_at on public.kin_space_members
for each row execute function public.enforce_two_active_space_members();

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
    where space_id = target_space_id
      and user_id = target_user_id
      and left_at is null
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
    where mine.user_id = auth.uid()
      and mine.left_at is null
      and theirs.user_id = target_user_id
      and theirs.left_at is null
  );
$$;

create or replace function public.new_space_invite_code()
returns text
language sql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
  select upper(encode(extensions.gen_random_bytes(6), 'hex'));
$$;

revoke all on function public.new_space_invite_code() from public;
revoke all on function public.new_space_invite_code() from anon;
revoke all on function public.new_space_invite_code() from authenticated;
revoke all on function public.new_space_invite_code() from service_role;

create or replace function public.create_kin_space(
  other_display_name text,
  relationship_start_date date
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  created_space_id uuid;
  requested_nickname text := trim(other_display_name);
  requested_start_date date := relationship_start_date;
  invitation_created boolean := false;
  attempt integer;
begin
  if actor_id is null then
    raise exception 'KIN_AUTH_REQUIRED' using errcode = '28000';
  end if;
  if length(requested_nickname) not between 1 and 80 then
    raise exception 'KIN_PROFILE_REQUIRED' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = actor_id) then
    raise exception 'KIN_PROFILE_REQUIRED' using errcode = 'P0001';
  end if;

  insert into public.kin_spaces (created_by, relationship_start_date)
  values (actor_id, requested_start_date)
  returning id into created_space_id;

  insert into public.kin_space_members (space_id, user_id, role)
  values (created_space_id, actor_id, 'owner');

  insert into public.space_themes (space_id, user_id, nickname)
  values (created_space_id, actor_id, requested_nickname);

  for attempt in 1..5 loop
    begin
      insert into public.space_invites (space_id, created_by, code)
      values (created_space_id, actor_id, public.new_space_invite_code());
      invitation_created := true;
      exit;
    exception when unique_violation then
      if attempt = 5 then
        raise;
      end if;
    end;
  end loop;

  if not invitation_created then
    raise exception 'KIN_INVITE_GENERATION_FAILED' using errcode = 'P0001';
  end if;

  return created_space_id;
end;
$$;

create or replace function public.redeem_space_invite(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_invite public.space_invites%rowtype;
  joining_user uuid := auth.uid();
  active_member_count integer;
begin
  if joining_user is null then
    raise exception 'KIN_AUTH_REQUIRED' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = joining_user) then
    raise exception 'KIN_PROFILE_REQUIRED' using errcode = 'P0001';
  end if;

  select * into selected_invite
  from public.space_invites
  where code = upper(trim(invite_code))
  for update;

  if not found then
    raise exception 'KIN_INVITE_INVALID' using errcode = 'P0001';
  end if;
  if selected_invite.revoked_at is not null then
    raise exception 'KIN_INVITE_REVOKED' using errcode = 'P0001';
  end if;
  if selected_invite.expires_at <= now() then
    raise exception 'KIN_INVITE_EXPIRED' using errcode = 'P0001';
  end if;
  if selected_invite.use_count >= selected_invite.max_uses or selected_invite.redeemed_by is not null then
    raise exception 'KIN_INVITE_USED' using errcode = 'P0001';
  end if;
  if selected_invite.created_by = joining_user then
    raise exception 'KIN_INVITE_SELF' using errcode = 'P0001';
  end if;

  perform 1 from public.kin_spaces where id = selected_invite.space_id for update;
  if not found then
    raise exception 'KIN_INVITE_INVALID' using errcode = 'P0001';
  end if;

  if public.is_space_member(selected_invite.space_id, joining_user) then
    raise exception 'KIN_ALREADY_MEMBER' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.kin_space_members member
    join public.user_blocks block
      on (block.blocker_id = joining_user and block.blocked_id = member.user_id)
      or (block.blocked_id = joining_user and block.blocker_id = member.user_id)
    where member.space_id = selected_invite.space_id
      and member.left_at is null
  ) then
    raise exception 'KIN_INVITE_BLOCKED' using errcode = 'P0001';
  end if;

  select count(*) into active_member_count
  from public.kin_space_members
  where space_id = selected_invite.space_id and left_at is null;

  if active_member_count >= 2 then
    raise exception 'KIN_SPACE_FULL' using errcode = 'P0001';
  end if;

  insert into public.kin_space_members (space_id, user_id, role, joined_at, archived, left_at)
  values (selected_invite.space_id, joining_user, 'member', now(), false, null)
  on conflict (space_id, user_id) do update
  set role = 'member', joined_at = now(), archived = false, left_at = null;

  insert into public.space_themes (space_id, user_id)
  values (selected_invite.space_id, joining_user)
  on conflict (space_id, user_id) do nothing;

  update public.space_invites
  set use_count = use_count + 1,
      redeemed_by = joining_user
  where id = selected_invite.id;

  return selected_invite.space_id;
end;
$$;

create or replace function public.rotate_space_invite(target_space_id uuid)
returns public.space_invites
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  active_member_count integer;
  selected_invite public.space_invites%rowtype;
  attempt integer;
begin
  if actor_id is null then
    raise exception 'KIN_AUTH_REQUIRED' using errcode = '28000';
  end if;

  perform 1 from public.kin_spaces where id = target_space_id for update;
  if not found or not public.is_space_member(target_space_id, actor_id) then
    raise exception 'KIN_SPACE_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select count(*) into active_member_count
  from public.kin_space_members
  where space_id = target_space_id and left_at is null;
  if active_member_count >= 2 then
    raise exception 'KIN_SPACE_FULL' using errcode = 'P0001';
  end if;

  update public.space_invites
  set revoked_at = now()
  where space_id = target_space_id
    and revoked_at is null
    and use_count < max_uses;

  for attempt in 1..5 loop
    begin
      insert into public.space_invites (space_id, created_by, code)
      values (target_space_id, actor_id, public.new_space_invite_code())
      returning * into selected_invite;
      return selected_invite;
    exception when unique_violation then
      if attempt = 5 then
        raise;
      end if;
    end;
  end loop;

  raise exception 'KIN_INVITE_GENERATION_FAILED' using errcode = 'P0001';
end;
$$;

create or replace function public.revoke_space_invite(target_space_id uuid)
returns public.space_invites
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  selected_invite public.space_invites%rowtype;
begin
  if actor_id is null then
    raise exception 'KIN_AUTH_REQUIRED' using errcode = '28000';
  end if;
  if not public.is_space_member(target_space_id, actor_id) then
    raise exception 'KIN_SPACE_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select * into selected_invite
  from public.space_invites
  where space_id = target_space_id
    and revoked_at is null
    and use_count < max_uses
  order by created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'KIN_INVITE_UNAVAILABLE' using errcode = 'P0001';
  end if;

  update public.space_invites
  set revoked_at = now()
  where id = selected_invite.id
  returning * into selected_invite;

  return selected_invite;
end;
$$;

create or replace function public.leave_kin_space(target_space_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  remaining_user_id uuid;
begin
  if actor_id is null then
    raise exception 'KIN_AUTH_REQUIRED' using errcode = '28000';
  end if;

  perform 1 from public.kin_spaces where id = target_space_id for update;
  if not found or not public.is_space_member(target_space_id, actor_id) then
    raise exception 'KIN_SPACE_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select user_id into remaining_user_id
  from public.kin_space_members
  where space_id = target_space_id
    and user_id <> actor_id
    and left_at is null
  order by joined_at
  limit 1;

  update public.kin_space_members
  set left_at = now(), archived = false
  where space_id = target_space_id and user_id = actor_id;

  update public.space_invites
  set revoked_at = coalesce(revoked_at, now())
  where space_id = target_space_id and use_count < max_uses;

  if remaining_user_id is null then
    delete from public.kin_spaces where id = target_space_id;
    return;
  end if;

  if exists (
    select 1 from public.kin_spaces
    where id = target_space_id and created_by = actor_id
  ) then
    update public.kin_spaces
    set created_by = remaining_user_id
    where id = target_space_id;

    update public.kin_space_members
    set role = 'owner'
    where space_id = target_space_id and user_id = remaining_user_id;
  end if;
end;
$$;

create or replace function public.block_kin_space_member(target_space_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_user_id uuid;
  shared_space_id uuid;
begin
  if actor_id is null then
    raise exception 'KIN_AUTH_REQUIRED' using errcode = '28000';
  end if;
  if not public.is_space_member(target_space_id, actor_id) then
    raise exception 'KIN_SPACE_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select user_id into target_user_id
  from public.kin_space_members
  where space_id = target_space_id
    and user_id <> actor_id
    and left_at is null
  order by joined_at
  limit 1;

  if target_user_id is null then
    raise exception 'KIN_BLOCK_TARGET_UNAVAILABLE' using errcode = 'P0001';
  end if;

  insert into public.user_blocks (blocker_id, blocked_id, space_id)
  values (actor_id, target_user_id, target_space_id)
  on conflict (blocker_id, blocked_id) do update
  set space_id = excluded.space_id, created_at = now();

  for shared_space_id in
    select mine.space_id
    from public.kin_space_members mine
    join public.kin_space_members theirs on theirs.space_id = mine.space_id
    where mine.user_id = actor_id
      and mine.left_at is null
      and theirs.user_id = target_user_id
      and theirs.left_at is null
    order by mine.space_id
  loop
    perform public.leave_kin_space(shared_space_id);
  end loop;
end;
$$;

create or replace function public.submit_content_report(
  target_space_id uuid,
  target_message_id uuid,
  report_category text,
  report_explanation text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_user_id uuid;
  report_id uuid;
  normalized_explanation text := trim(coalesce(report_explanation, ''));
begin
  if actor_id is null then
    raise exception 'KIN_AUTH_REQUIRED' using errcode = '28000';
  end if;
  if not public.is_space_member(target_space_id, actor_id) then
    raise exception 'KIN_SPACE_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if report_category not in ('harassment', 'threats', 'hate', 'sexual_content', 'spam', 'other') then
    raise exception 'KIN_REPORT_CATEGORY_INVALID' using errcode = '22023';
  end if;
  if length(normalized_explanation) > 2000 then
    raise exception 'KIN_REPORT_EXPLANATION_TOO_LONG' using errcode = '22001';
  end if;

  if target_message_id is not null then
    select sender_id into target_user_id
    from public.messages
    where id = target_message_id and space_id = target_space_id;
  else
    select user_id into target_user_id
    from public.kin_space_members
    where space_id = target_space_id
      and user_id <> actor_id
      and left_at is null
    order by joined_at
    limit 1;
  end if;

  if target_user_id is null or target_user_id = actor_id then
    raise exception 'KIN_REPORT_TARGET_INVALID' using errcode = '22023';
  end if;

  insert into public.content_reports (
    reporter_id,
    reported_user_id,
    space_id,
    message_id,
    category,
    explanation
  ) values (
    actor_id,
    target_user_id,
    target_space_id,
    target_message_id,
    report_category,
    normalized_explanation
  ) returning id into report_id;

  return report_id;
end;
$$;

revoke all on function public.enforce_two_active_space_members() from public, anon, authenticated, service_role;
revoke all on function public.is_space_member(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.shares_space_with(uuid) from public, anon, authenticated, service_role;
revoke all on function public.is_space_creator(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.safe_uuid(text) from public, anon, authenticated, service_role;
revoke all on function public.create_kin_space(text, date) from public, anon, authenticated, service_role;
revoke all on function public.redeem_space_invite(text) from public, anon, authenticated, service_role;
revoke all on function public.rotate_space_invite(uuid) from public, anon, authenticated, service_role;
revoke all on function public.revoke_space_invite(uuid) from public, anon, authenticated, service_role;
revoke all on function public.leave_kin_space(uuid) from public, anon, authenticated, service_role;
revoke all on function public.block_kin_space_member(uuid) from public, anon, authenticated, service_role;
revoke all on function public.submit_content_report(uuid, uuid, text, text) from public, anon, authenticated, service_role;

grant execute on function public.is_space_member(uuid, uuid) to authenticated;
grant execute on function public.shares_space_with(uuid) to authenticated;
grant execute on function public.is_space_creator(uuid, uuid) to authenticated;
grant execute on function public.safe_uuid(text) to authenticated;
grant execute on function public.create_kin_space(text, date) to authenticated;
grant execute on function public.redeem_space_invite(text) to authenticated;
grant execute on function public.rotate_space_invite(uuid) to authenticated;
grant execute on function public.revoke_space_invite(uuid) to authenticated;
grant execute on function public.leave_kin_space(uuid) to authenticated;
grant execute on function public.block_kin_space_member(uuid) to authenticated;
grant execute on function public.submit_content_report(uuid, uuid, text, text) to authenticated;

revoke all on
  public.profiles,
  public.kin_spaces,
  public.kin_space_members,
  public.space_themes,
  public.messages,
  public.message_reactions,
  public.memory_items,
  public.memory_item_messages,
  public.space_invites,
  public.user_blocks,
  public.content_reports
from anon, authenticated;
revoke update (archived) on public.kin_space_members from authenticated;

grant select, insert, update, delete on public.profiles to authenticated;
grant select on public.kin_spaces to authenticated;
grant select on public.kin_space_members to authenticated;
grant update (archived) on public.kin_space_members to authenticated;
grant select, insert, update, delete on public.space_themes to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, delete on public.message_reactions to authenticated;
grant select, insert, update, delete on public.memory_items to authenticated;
grant select, insert, delete on public.memory_item_messages to authenticated;
grant select on public.space_invites to authenticated;
grant select on public.content_reports to authenticated;
grant all on public.user_blocks, public.content_reports to service_role;

alter table public.user_blocks enable row level security;
alter table public.content_reports enable row level security;

create policy reports_select_own_receipts on public.content_reports
for select to authenticated using (reporter_id = auth.uid());

drop policy members_update_self on public.kin_space_members;
create policy members_update_self on public.kin_space_members
for update to authenticated
using (user_id = auth.uid() and left_at is null)
with check (user_id = auth.uid() and left_at is null);

drop policy themes_delete_self on public.space_themes;
create policy themes_delete_self on public.space_themes
for delete to authenticated
using (user_id = auth.uid() and public.is_space_member(space_id));

drop policy messages_update_sender on public.messages;
create policy messages_update_sender on public.messages
for update to authenticated
using (sender_id = auth.uid() and public.is_space_member(space_id))
with check (sender_id = auth.uid() and public.is_space_member(space_id));

drop policy messages_delete_sender on public.messages;
create policy messages_delete_sender on public.messages
for delete to authenticated
using (sender_id = auth.uid() and public.is_space_member(space_id));

drop policy reactions_delete_self on public.message_reactions;
create policy reactions_delete_self on public.message_reactions
for delete to authenticated using (
  user_id = auth.uid()
  and exists (
    select 1 from public.messages
    where messages.id = message_id
      and public.is_space_member(messages.space_id)
  )
);

drop policy memories_update_creator on public.memory_items;
create policy memories_update_creator on public.memory_items
for update to authenticated
using (created_by = auth.uid() and public.is_space_member(space_id))
with check (created_by = auth.uid() and public.is_space_member(space_id));

drop policy memories_delete_creator on public.memory_items;
create policy memories_delete_creator on public.memory_items
for delete to authenticated
using (created_by = auth.uid() and public.is_space_member(space_id));

drop policy memory_messages_delete_creator on public.memory_item_messages;
create policy memory_messages_delete_creator on public.memory_item_messages
for delete to authenticated using (
  exists (
    select 1 from public.memory_items
    where memory_items.id = memory_id
      and memory_items.created_by = auth.uid()
      and public.is_space_member(memory_items.space_id)
  )
);

drop policy chat_media_delete_self on storage.objects;
create policy chat_media_delete_self on storage.objects
for delete to authenticated using (
  bucket_id = 'chat-media'
  and public.is_space_member(public.safe_uuid((storage.foldername(name))[1]))
  and public.safe_uuid((storage.foldername(name))[2]) = auth.uid()
);
