alter table public.profiles
add column notification_previews_enabled boolean not null default true;

alter table public.kin_space_members
add column last_read_at timestamptz;

update public.kin_space_members
set last_read_at = joined_at;

alter table public.kin_space_members
alter column last_read_at set default now(),
alter column last_read_at set not null;

create index messages_space_cursor_idx
on public.messages (space_id, created_at desc, id desc);

create table public.push_installations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  installation_id text not null unique
    check (length(installation_id) between 8 and 200),
  expo_push_token text not null unique
    check (length(expo_push_token) between 20 and 300),
  platform text not null check (platform in ('ios', 'android')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index push_installations_active_user_idx
on public.push_installations (user_id, active, last_seen_at desc);

create table public.message_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.messages(id) on delete cascade,
  space_id uuid not null references public.kin_spaces(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'ticketed', 'delivered', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  processing_started_at timestamptz,
  processing_token uuid,
  expo_ticket_id text,
  last_error_code text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index message_notification_outbox_pending_idx
on public.message_notification_outbox (status, next_attempt_at, created_at)
where status in ('pending', 'processing', 'ticketed');

revoke all on public.push_installations from public, anon, authenticated;
revoke all on public.message_notification_outbox from public, anon, authenticated;
grant select, insert, update, delete on public.push_installations to service_role;
grant select, insert, update, delete on public.message_notification_outbox to service_role;
alter table public.push_installations enable row level security;
alter table public.message_notification_outbox enable row level security;

revoke insert on public.messages from authenticated;

create or replace function public.send_kin_message(
  client_message_id uuid,
  target_space_id uuid,
  message_kind text,
  message_body text,
  message_media_uri text default null
)
returns public.messages
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  normalized_body text := trim(coalesce(message_body, ''));
  normalized_media_uri text := nullif(trim(coalesce(message_media_uri, '')), '');
  existing_message public.messages%rowtype;
  inserted_message public.messages%rowtype;
  recipient uuid;
begin
  if actor_id is null then
    raise exception 'KIN_AUTH_REQUIRED' using errcode = '28000';
  end if;
  if client_message_id is null or target_space_id is null then
    raise exception 'KIN_MESSAGE_INVALID' using errcode = '22023';
  end if;
  if message_kind not in ('text', 'image', 'sticker')
    or (normalized_body = '' and normalized_media_uri is null)
    or length(normalized_body) > 10000
    or (normalized_media_uri is not null and length(normalized_media_uri) > 1000) then
    raise exception 'KIN_MESSAGE_INVALID' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.kin_space_members
    where space_id = target_space_id
      and user_id = actor_id
      and left_at is null
  ) then
    raise exception 'KIN_SPACE_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select * into existing_message
  from public.messages
  where id = client_message_id;
  if found then
    if existing_message.sender_id <> actor_id
      or existing_message.space_id <> target_space_id
      or existing_message.kind <> message_kind
      or existing_message.body <> normalized_body
      or existing_message.media_uri is distinct from normalized_media_uri then
      raise exception 'KIN_MESSAGE_ID_CONFLICT' using errcode = '23505';
    end if;
    return existing_message;
  end if;

  insert into public.messages (id, space_id, sender_id, kind, body, media_uri)
  values (
    client_message_id,
    target_space_id,
    actor_id,
    message_kind,
    normalized_body,
    normalized_media_uri
  )
  on conflict (id) do nothing
  returning * into inserted_message;

  if inserted_message.id is null then
    select * into existing_message
    from public.messages
    where id = client_message_id;
    if not found
      or existing_message.sender_id <> actor_id
      or existing_message.space_id <> target_space_id
      or existing_message.kind <> message_kind
      or existing_message.body <> normalized_body
      or existing_message.media_uri is distinct from normalized_media_uri then
      raise exception 'KIN_MESSAGE_ID_CONFLICT' using errcode = '23505';
    end if;
    return existing_message;
  end if;

  select members.user_id into recipient
  from public.kin_space_members members
  where members.space_id = target_space_id
    and members.user_id <> actor_id
    and members.left_at is null
    and not exists (
      select 1
      from public.user_blocks blocks
      where (blocks.blocker_id = actor_id and blocks.blocked_id = members.user_id)
         or (blocks.blocker_id = members.user_id and blocks.blocked_id = actor_id)
    )
  order by members.joined_at
  limit 1;

  if recipient is not null and exists (
    select 1 from public.push_installations installations
    where installations.user_id = recipient and installations.active
  ) then
    insert into public.message_notification_outbox (message_id, space_id, recipient_id)
    values (inserted_message.id, target_space_id, recipient)
    on conflict (message_id) do nothing;
  end if;

  return inserted_message;
end;
$$;

revoke all on function public.send_kin_message(uuid, uuid, text, text, text)
from public, anon, authenticated, service_role;
grant execute on function public.send_kin_message(uuid, uuid, text, text, text)
to authenticated;

create or replace function public.list_space_messages(
  target_space_id uuid,
  before_created_at timestamptz default null,
  before_message_id uuid default null,
  page_size integer default 50
)
returns setof public.messages
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'KIN_AUTH_REQUIRED' using errcode = '28000';
  end if;
  if page_size < 1 or page_size > 100 then
    raise exception 'KIN_PAGE_SIZE_INVALID' using errcode = '22023';
  end if;
  if (before_created_at is null) <> (before_message_id is null) then
    raise exception 'KIN_CURSOR_INVALID' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.kin_space_members
    where space_id = target_space_id
      and user_id = auth.uid()
      and left_at is null
  ) then
    raise exception 'KIN_SPACE_UNAVAILABLE' using errcode = 'P0001';
  end if;

  return query
  select messages.*
  from public.messages
  where messages.space_id = target_space_id
    and (
      before_created_at is null
      or (messages.created_at, messages.id) < (before_created_at, before_message_id)
    )
  order by messages.created_at desc, messages.id desc
  limit page_size;
end;
$$;

revoke all on function public.list_space_messages(uuid, timestamptz, uuid, integer)
from public, anon, authenticated, service_role;
grant execute on function public.list_space_messages(uuid, timestamptz, uuid, integer)
to authenticated;

create or replace function public.mark_space_read(target_space_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  marked_at timestamptz := now();
  updated_count integer;
begin
  if auth.uid() is null then
    raise exception 'KIN_AUTH_REQUIRED' using errcode = '28000';
  end if;
  update public.kin_space_members
  set last_read_at = marked_at
  where space_id = target_space_id
    and user_id = auth.uid()
    and left_at is null;
  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'KIN_SPACE_UNAVAILABLE' using errcode = 'P0001';
  end if;
  return marked_at;
end;
$$;

revoke all on function public.mark_space_read(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.mark_space_read(uuid) to authenticated;

create or replace function public.get_my_unread_counts()
returns table (space_id uuid, unread_count bigint)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select
    memberships.space_id,
    count(messages.id)::bigint as unread_count
  from public.kin_space_members memberships
  left join public.messages messages
    on messages.space_id = memberships.space_id
    and messages.sender_id <> memberships.user_id
    and messages.created_at > memberships.last_read_at
  where memberships.user_id = auth.uid()
    and memberships.left_at is null
  group by memberships.space_id;
$$;

revoke all on function public.get_my_unread_counts()
from public, anon, authenticated, service_role;
grant execute on function public.get_my_unread_counts() to authenticated;

create or replace function public.register_push_installation(
  target_installation_id text,
  target_expo_push_token text,
  target_platform text,
  previous_installation_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  existing_owner uuid;
  installation_uuid uuid;
  token_installation_id text;
  token_owner uuid;
begin
  if actor_id is null then
    raise exception 'KIN_AUTH_REQUIRED' using errcode = '28000';
  end if;
  if length(trim(target_installation_id)) not between 8 and 200
    or length(trim(target_expo_push_token)) not between 20 and 300
    or target_platform not in ('ios', 'android')
    or (
      previous_installation_id is not null
      and (
        length(trim(previous_installation_id)) not between 8 and 200
        or trim(previous_installation_id) = trim(target_installation_id)
      )
    ) then
    raise exception 'KIN_PUSH_INSTALLATION_INVALID' using errcode = '22023';
  end if;

  select user_id, installation_id into token_owner, token_installation_id
  from public.push_installations
  where expo_push_token = trim(target_expo_push_token)
  for update;
  if token_installation_id is not null
    and token_installation_id <> trim(target_installation_id) then
    if token_owner = actor_id
      or token_installation_id = trim(coalesce(previous_installation_id, '')) then
      delete from public.push_installations
      where installation_id = token_installation_id;
    else
      raise exception 'KIN_PUSH_INSTALLATION_OWNED' using errcode = '23505';
    end if;
  end if;

  select user_id into existing_owner
  from public.push_installations
  where installation_id = trim(target_installation_id)
  for update;
  if existing_owner is not null and existing_owner <> actor_id then
    raise exception 'KIN_PUSH_INSTALLATION_OWNED' using errcode = '23505';
  end if;

  insert into public.push_installations (
    user_id,
    installation_id,
    expo_push_token,
    platform,
    active,
    last_seen_at,
    updated_at
  ) values (
    actor_id,
    trim(target_installation_id),
    trim(target_expo_push_token),
    target_platform,
    true,
    now(),
    now()
  )
  on conflict (installation_id) do update
  set expo_push_token = excluded.expo_push_token,
      platform = excluded.platform,
      active = true,
      last_seen_at = now(),
      updated_at = now()
  where public.push_installations.user_id = actor_id
  returning id into installation_uuid;

  if installation_uuid is null then
    raise exception 'KIN_PUSH_INSTALLATION_OWNED' using errcode = '23505';
  end if;
  return installation_uuid;
end;
$$;

revoke all on function public.register_push_installation(text, text, text, text)
from public, anon, authenticated, service_role;
grant execute on function public.register_push_installation(text, text, text, text)
to authenticated;

create or replace function public.deactivate_push_installation(target_installation_id text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_count integer;
begin
  if auth.uid() is null then
    raise exception 'KIN_AUTH_REQUIRED' using errcode = '28000';
  end if;
  delete from public.push_installations
  where user_id = auth.uid()
    and installation_id = trim(target_installation_id);
  get diagnostics deleted_count = row_count;
  return deleted_count = 1;
end;
$$;

revoke all on function public.deactivate_push_installation(text)
from public, anon, authenticated, service_role;
grant execute on function public.deactivate_push_installation(text) to authenticated;

create or replace function public.claim_message_notification_jobs(maximum_jobs integer default 100)
returns table (
  id uuid,
  message_id uuid,
  space_id uuid,
  recipient_id uuid,
  attempts integer,
  processing_token uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if maximum_jobs < 1 or maximum_jobs > 500 then
    raise exception 'Maximum jobs must be between 1 and 500' using errcode = '22023';
  end if;

  update public.message_notification_outbox jobs
  set status = 'pending',
      processing_started_at = null,
      processing_token = null,
      next_attempt_at = now(),
      last_error_code = 'notification_lease_expired',
      updated_at = now()
  where jobs.status = 'processing'
    and jobs.processing_started_at < now() - interval '5 minutes';

  return query
  with candidates as (
    select jobs.id
    from public.message_notification_outbox jobs
    where jobs.status = 'pending'
      and jobs.next_attempt_at <= now()
    order by jobs.created_at, jobs.id
    for update of jobs skip locked
    limit maximum_jobs
  ), claimed as (
    update public.message_notification_outbox jobs
    set status = 'processing',
        attempts = jobs.attempts + 1,
        processing_started_at = now(),
        processing_token = gen_random_uuid(),
        updated_at = now()
    from candidates
    where jobs.id = candidates.id
    returning
      jobs.id,
      jobs.message_id,
      jobs.space_id,
      jobs.recipient_id,
      jobs.attempts,
      jobs.processing_token
  )
  select * from claimed;
end;
$$;

revoke all on function public.claim_message_notification_jobs(integer)
from public, anon, authenticated;
grant execute on function public.claim_message_notification_jobs(integer) to service_role;

create or replace function public.complete_message_notification_job(
  target_job_id uuid,
  target_processing_token uuid,
  target_expo_ticket_id text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  updated_count integer;
begin
  if length(trim(coalesce(target_expo_ticket_id, ''))) not between 1 and 300 then
    raise exception 'KIN_NOTIFICATION_TICKET_INVALID' using errcode = '22023';
  end if;
  update public.message_notification_outbox
  set status = 'ticketed',
      expo_ticket_id = trim(target_expo_ticket_id),
      processing_started_at = null,
      processing_token = null,
      last_error_code = '',
      updated_at = now()
  where id = target_job_id
    and status = 'processing'
    and processing_token = target_processing_token;
  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

revoke all on function public.complete_message_notification_job(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.complete_message_notification_job(uuid, uuid, text)
to service_role;

create or replace function public.fail_message_notification_job(
  target_job_id uuid,
  target_processing_token uuid,
  target_error_code text,
  target_next_attempt_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  updated_count integer;
begin
  if length(trim(coalesce(target_error_code, ''))) not between 1 and 120 then
    raise exception 'KIN_NOTIFICATION_ERROR_INVALID' using errcode = '22023';
  end if;
  update public.message_notification_outbox
  set status = case when target_next_attempt_at is null then 'failed' else 'pending' end,
      next_attempt_at = coalesce(target_next_attempt_at, next_attempt_at),
      processing_started_at = null,
      processing_token = null,
      last_error_code = trim(target_error_code),
      updated_at = now(),
      completed_at = case when target_next_attempt_at is null then now() else null end
  where id = target_job_id
    and status = 'processing'
    and processing_token = target_processing_token;
  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

revoke all on function public.fail_message_notification_job(uuid, uuid, text, timestamptz)
from public, anon, authenticated;
grant execute on function public.fail_message_notification_job(uuid, uuid, text, timestamptz)
to service_role;

create or replace function public.complete_message_notification_receipt(
  target_job_id uuid,
  target_expo_ticket_id text,
  target_delivered boolean,
  target_error_code text default ''
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  updated_count integer;
begin
  if target_delivered is false
    and length(trim(coalesce(target_error_code, ''))) not between 1 and 120 then
    raise exception 'KIN_NOTIFICATION_ERROR_INVALID' using errcode = '22023';
  end if;
  update public.message_notification_outbox
  set status = case when target_delivered then 'delivered' else 'failed' end,
      last_error_code = case when target_delivered then '' else trim(target_error_code) end,
      updated_at = now(),
      completed_at = now()
  where id = target_job_id
    and status = 'ticketed'
    and expo_ticket_id = trim(target_expo_ticket_id);
  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

revoke all on function public.complete_message_notification_receipt(uuid, text, boolean, text)
from public, anon, authenticated;
grant execute on function public.complete_message_notification_receipt(uuid, text, boolean, text)
to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'kin_space_members'
  ) then
    alter publication supabase_realtime add table public.kin_space_members;
  end if;
end;
$$;
