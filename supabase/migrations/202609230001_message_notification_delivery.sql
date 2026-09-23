-- Upgrade the recipient-level notification queue to independently leased per-installation delivery.
-- This migration intentionally follows 202609170002 so already-applied environments upgrade safely.

alter table public.message_notification_outbox
add column installation_id uuid,
add column ticketed_at timestamptz,
add column receipt_attempts integer not null default 0 check (receipt_attempts >= 0),
add column receipt_next_attempt_at timestamptz,
add column receipt_processing_started_at timestamptz,
add column receipt_processing_token uuid;

-- Registration now retains at most five installations per account. Apply the same cap to legacy
-- rows before adding the per-installation foreign key and fan-out.
delete from public.push_installations installations
using (
  select id
  from (
    select
      id,
      row_number() over (
        partition by user_id
        order by active desc, last_seen_at desc, updated_at desc, id
      ) as position
    from public.push_installations
  ) ranked
  where ranked.position > 5
) excess
where installations.id = excess.id;

-- No Task 6 worker existed before this migration, so recover any abandoned processing lease and
-- attach each legacy row to the recipient's most recent installation.
update public.message_notification_outbox
set status = 'failed',
    processing_started_at = null,
    processing_token = null,
    last_error_code = 'notification_upgrade_stale',
    completed_at = now(),
    updated_at = now()
where status in ('pending', 'processing')
  and created_at < now() - interval '24 hours';

update public.message_notification_outbox
set status = 'pending',
    processing_started_at = null,
    processing_token = null,
    next_attempt_at = now(),
    last_error_code = 'notification_delivery_upgrade',
    updated_at = now()
where status = 'processing';

update public.message_notification_outbox jobs
set installation_id = (
  select installations.id
  from public.push_installations installations
  where installations.user_id = jobs.recipient_id
  order by installations.active desc, installations.last_seen_at desc, installations.id
  limit 1
);

delete from public.message_notification_outbox
where installation_id is null;

alter table public.message_notification_outbox
drop constraint message_notification_outbox_message_id_key;

insert into public.message_notification_outbox (
  message_id,
  space_id,
  recipient_id,
  installation_id,
  status,
  attempts,
  next_attempt_at,
  last_error_code,
  created_at,
  updated_at,
  completed_at
)
select
  jobs.message_id,
  jobs.space_id,
  jobs.recipient_id,
  installations.id,
  jobs.status,
  jobs.attempts,
  jobs.next_attempt_at,
  jobs.last_error_code,
  jobs.created_at,
  jobs.updated_at,
  jobs.completed_at
from public.message_notification_outbox jobs
join public.push_installations installations
  on installations.user_id = jobs.recipient_id
  and installations.active
  and installations.id <> jobs.installation_id
where jobs.status = 'pending';

update public.message_notification_outbox
set ticketed_at = updated_at,
    receipt_next_attempt_at = greatest(updated_at + interval '15 minutes', now())
where status = 'ticketed';

alter table public.message_notification_outbox
alter column installation_id set not null,
add constraint message_notification_outbox_installation_id_fkey
  foreign key (installation_id) references public.push_installations(id) on delete cascade,
add constraint message_notification_outbox_message_installation_key
  unique (message_id, installation_id);

drop index public.message_notification_outbox_pending_idx;

create index message_notification_outbox_pending_idx
on public.message_notification_outbox (next_attempt_at, created_at, id)
where status = 'pending';

create index message_notification_outbox_processing_lease_idx
on public.message_notification_outbox (processing_started_at, created_at, id)
where status = 'processing';

create index message_notification_receipts_idx
on public.message_notification_outbox (receipt_next_attempt_at, ticketed_at, id)
where status = 'ticketed';

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

  -- Serialize registration/pruning for one account so concurrent devices cannot exceed the cap.
  perform 1 from public.profiles where id = actor_id for update;

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

  delete from public.push_installations installations
  using (
    select id
    from public.push_installations
    where user_id = actor_id
      and id <> installation_uuid
    order by active desc, last_seen_at desc, updated_at desc, id
    offset 4
  ) excess
  where installations.id = excess.id;

  return installation_uuid;
end;
$$;

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

  if recipient is not null then
    insert into public.message_notification_outbox (
      message_id,
      space_id,
      recipient_id,
      installation_id
    )
    select inserted_message.id, target_space_id, recipient, installations.id
    from public.push_installations installations
    where installations.user_id = recipient
      and installations.active
    order by installations.last_seen_at desc, installations.id
    limit 5
    on conflict (message_id, installation_id) do nothing;
  end if;

  return inserted_message;
end;
$$;

drop function public.claim_message_notification_jobs(integer);

create function public.claim_message_notification_jobs(maximum_jobs integer default 100)
returns table (
  id uuid,
  message_id uuid,
  space_id uuid,
  recipient_id uuid,
  installation_id uuid,
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

  return query
  with candidates as (
    select jobs.id
    from public.message_notification_outbox jobs
    where (
      jobs.status = 'pending'
      and jobs.next_attempt_at <= now()
    ) or (
      jobs.status = 'processing'
      and jobs.processing_started_at < now() - interval '5 minutes'
    )
    order by jobs.created_at, jobs.id
    for update of jobs skip locked
    limit maximum_jobs
  ), claimed as (
    update public.message_notification_outbox jobs
    set status = 'processing',
        attempts = jobs.attempts + 1,
        processing_started_at = now(),
        processing_token = gen_random_uuid(),
        last_error_code = case
          when jobs.status = 'processing' then 'notification_lease_expired'
          else jobs.last_error_code
        end,
        updated_at = now()
    from candidates
    where jobs.id = candidates.id
    returning
      jobs.id,
      jobs.message_id,
      jobs.space_id,
      jobs.recipient_id,
      jobs.installation_id,
      jobs.attempts,
      jobs.processing_token
  )
  select * from claimed;
end;
$$;

revoke all on function public.claim_message_notification_jobs(integer)
from public, anon, authenticated;
grant execute on function public.claim_message_notification_jobs(integer) to service_role;

create or replace function public.get_message_notification_payload(
  target_job_id uuid,
  target_processing_token uuid
)
returns table (
  job_id uuid,
  expo_push_token text,
  installation_id uuid,
  space_id uuid,
  message_kind text,
  message_body text,
  sender_name text,
  previews_enabled boolean
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select
    jobs.id,
    installations.expo_push_token,
    installations.id,
    jobs.space_id,
    messages.kind,
    messages.body,
    senders.display_name,
    recipients.notification_previews_enabled
  from public.message_notification_outbox jobs
  join public.messages messages on messages.id = jobs.message_id
  join public.profiles senders on senders.id = messages.sender_id
  join public.profiles recipients on recipients.id = jobs.recipient_id
  join public.kin_space_members sender_membership
    on sender_membership.space_id = jobs.space_id
    and sender_membership.user_id = messages.sender_id
    and sender_membership.left_at is null
  join public.kin_space_members recipient_membership
    on recipient_membership.space_id = jobs.space_id
    and recipient_membership.user_id = jobs.recipient_id
    and recipient_membership.left_at is null
  join public.push_installations installations
    on installations.id = jobs.installation_id
    and installations.user_id = jobs.recipient_id
    and installations.active
  where jobs.id = target_job_id
    and jobs.status = 'processing'
    and jobs.processing_token = target_processing_token
    and not exists (
      select 1
      from public.user_blocks blocks
      where (blocks.blocker_id = messages.sender_id and blocks.blocked_id = jobs.recipient_id)
         or (blocks.blocker_id = jobs.recipient_id and blocks.blocked_id = messages.sender_id)
    );
$$;

revoke all on function public.get_message_notification_payload(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.get_message_notification_payload(uuid, uuid)
to service_role;

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
      ticketed_at = now(),
      receipt_attempts = 0,
      receipt_next_attempt_at = now() + interval '15 minutes',
      receipt_processing_started_at = null,
      receipt_processing_token = null,
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

create or replace function public.claim_message_notification_receipts(
  maximum_receipts integer default 300
)
returns table (
  id uuid,
  installation_id uuid,
  attempts integer,
  receipt_attempts integer,
  receipt_processing_token uuid,
  expo_ticket_id text,
  ticketed_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if maximum_receipts < 1 or maximum_receipts > 1000 then
    raise exception 'Maximum receipts must be between 1 and 1000' using errcode = '22023';
  end if;

  return query
  with candidates as (
    select jobs.id
    from public.message_notification_outbox jobs
    where jobs.status = 'ticketed'
      and jobs.expo_ticket_id is not null
      and jobs.ticketed_at is not null
      and jobs.receipt_next_attempt_at <= now()
      and (
        jobs.receipt_processing_started_at is null
        or jobs.receipt_processing_started_at < now() - interval '5 minutes'
      )
    order by jobs.receipt_next_attempt_at, jobs.ticketed_at, jobs.id
    for update of jobs skip locked
    limit maximum_receipts
  ), claimed as (
    update public.message_notification_outbox jobs
    set receipt_attempts = jobs.receipt_attempts + 1,
        receipt_processing_started_at = now(),
        receipt_processing_token = gen_random_uuid(),
        updated_at = now()
    from candidates
    where jobs.id = candidates.id
    returning
      jobs.id,
      jobs.installation_id,
      jobs.attempts,
      jobs.receipt_attempts,
      jobs.receipt_processing_token,
      jobs.expo_ticket_id,
      jobs.ticketed_at
  )
  select * from claimed;
end;
$$;

revoke all on function public.claim_message_notification_receipts(integer)
from public, anon, authenticated;
grant execute on function public.claim_message_notification_receipts(integer) to service_role;

drop function public.complete_message_notification_receipt(uuid, text, boolean, text);

create function public.complete_message_notification_receipt(
  target_job_id uuid,
  target_expo_ticket_id text,
  target_receipt_processing_token uuid,
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
      receipt_processing_started_at = null,
      receipt_processing_token = null,
      updated_at = now(),
      completed_at = now()
  where id = target_job_id
    and status = 'ticketed'
    and expo_ticket_id = trim(target_expo_ticket_id)
    and receipt_processing_token = target_receipt_processing_token;
  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

revoke all on function public.complete_message_notification_receipt(uuid, text, uuid, boolean, text)
from public, anon, authenticated;
grant execute on function public.complete_message_notification_receipt(uuid, text, uuid, boolean, text)
to service_role;

create or replace function public.defer_message_notification_receipt(
  target_job_id uuid,
  target_expo_ticket_id text,
  target_receipt_processing_token uuid,
  target_error_code text,
  target_next_attempt_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  updated_count integer;
begin
  if length(trim(coalesce(target_error_code, ''))) not between 1 and 120
    or target_next_attempt_at is null then
    raise exception 'KIN_NOTIFICATION_RECEIPT_DEFER_INVALID' using errcode = '22023';
  end if;
  update public.message_notification_outbox
  set receipt_next_attempt_at = target_next_attempt_at,
      receipt_processing_started_at = null,
      receipt_processing_token = null,
      last_error_code = trim(target_error_code),
      updated_at = now()
  where id = target_job_id
    and status = 'ticketed'
    and expo_ticket_id = trim(target_expo_ticket_id)
    and receipt_processing_token = target_receipt_processing_token;
  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

revoke all on function public.defer_message_notification_receipt(uuid, text, uuid, text, timestamptz)
from public, anon, authenticated;
grant execute on function public.defer_message_notification_receipt(uuid, text, uuid, text, timestamptz)
to service_role;

create or replace function public.retry_message_notification_receipt(
  target_job_id uuid,
  target_expo_ticket_id text,
  target_receipt_processing_token uuid,
  target_error_code text,
  target_next_attempt_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  updated_count integer;
begin
  if length(trim(coalesce(target_error_code, ''))) not between 1 and 120
    or target_next_attempt_at is null then
    raise exception 'KIN_NOTIFICATION_RETRY_INVALID' using errcode = '22023';
  end if;
  update public.message_notification_outbox
  set status = 'pending',
      next_attempt_at = target_next_attempt_at,
      expo_ticket_id = null,
      ticketed_at = null,
      receipt_next_attempt_at = null,
      receipt_processing_started_at = null,
      receipt_processing_token = null,
      last_error_code = trim(target_error_code),
      updated_at = now(),
      completed_at = null
  where id = target_job_id
    and status = 'ticketed'
    and expo_ticket_id = trim(target_expo_ticket_id)
    and receipt_processing_token = target_receipt_processing_token;
  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

revoke all on function public.retry_message_notification_receipt(uuid, text, uuid, text, timestamptz)
from public, anon, authenticated;
grant execute on function public.retry_message_notification_receipt(uuid, text, uuid, text, timestamptz)
to service_role;

alter table public.operator_maintenance_status
drop constraint operator_maintenance_status_worker_check;

alter table public.operator_maintenance_status
add constraint operator_maintenance_status_worker_check
check (worker in ('storage-cleanup', 'message-notifications'));

insert into public.operator_maintenance_status (worker)
values ('message-notifications')
on conflict (worker) do nothing;

create or replace function public.record_message_notification_heartbeat(
  target_status text,
  target_claimed integer,
  target_failed integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  updated_count integer;
  recorded_at timestamptz := now();
begin
  if target_status not in ('running', 'succeeded', 'incomplete')
    or target_claimed < 0
    or target_failed < 0 then
    raise exception 'KIN_NOTIFICATION_HEARTBEAT_INVALID' using errcode = '22023';
  end if;
  update public.operator_maintenance_status
  set last_claimed = target_claimed,
      last_failed = target_failed,
      last_started_at = case when target_status = 'running' then recorded_at else last_started_at end,
      last_succeeded_at = case when target_status = 'succeeded' then recorded_at else last_succeeded_at end,
      last_status = target_status,
      updated_at = recorded_at
  where worker = 'message-notifications';
  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

revoke all on function public.record_message_notification_heartbeat(text, integer, integer)
from public, anon, authenticated;
grant execute on function public.record_message_notification_heartbeat(text, integer, integer)
to service_role;

create or replace function public.cancel_departed_member_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.left_at is null and new.left_at is not null then
    update public.message_notification_outbox jobs
    set status = 'failed',
        processing_started_at = null,
        processing_token = null,
        last_error_code = 'notification_relationship_inactive',
        completed_at = now(),
        updated_at = now()
    from public.messages messages
    where messages.id = jobs.message_id
      and jobs.space_id = new.space_id
      and jobs.status in ('pending', 'processing')
      and (jobs.recipient_id = new.user_id or messages.sender_id = new.user_id);
  end if;
  return new;
end;
$$;

revoke all on function public.cancel_departed_member_notifications()
from public, anon, authenticated, service_role;

create trigger kin_space_members_cancel_message_notifications
after update of left_at on public.kin_space_members
for each row execute function public.cancel_departed_member_notifications();

create or replace function public.cancel_blocked_member_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.message_notification_outbox jobs
  set status = 'failed',
      processing_started_at = null,
      processing_token = null,
      last_error_code = 'notification_relationship_blocked',
      completed_at = now(),
      updated_at = now()
  from public.messages messages
  where messages.id = jobs.message_id
    and jobs.status in ('pending', 'processing')
    and (
      (messages.sender_id = new.blocker_id and jobs.recipient_id = new.blocked_id)
      or (messages.sender_id = new.blocked_id and jobs.recipient_id = new.blocker_id)
    );
  return new;
end;
$$;

revoke all on function public.cancel_blocked_member_notifications()
from public, anon, authenticated, service_role;

create trigger user_blocks_cancel_message_notifications
after insert or update on public.user_blocks
for each row execute function public.cancel_blocked_member_notifications();
