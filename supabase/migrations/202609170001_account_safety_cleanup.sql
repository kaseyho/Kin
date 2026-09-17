alter table public.content_reports
alter column reporter_id drop not null;

alter table public.content_reports
drop constraint content_reports_reporter_id_fkey,
add constraint content_reports_reporter_id_fkey
  foreign key (reporter_id) references public.profiles(id) on delete set null;

alter table public.content_reports
add column retention_expires_at timestamptz,
add column status_updated_at timestamptz;

update public.content_reports
set retention_expires_at = created_at + interval '180 days',
    status_updated_at = created_at;

alter table public.content_reports
alter column retention_expires_at set default (now() + interval '180 days'),
alter column retention_expires_at set not null,
alter column status_updated_at set default now(),
alter column status_updated_at set not null;

create index content_reports_retention_idx
on public.content_reports (retention_expires_at);

create table public.account_storage_cleanup_jobs (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null,
  owner_id uuid not null,
  bucket_id text not null check (bucket_id in ('avatars', 'chat-media')),
  target_kind text not null check (target_kind in ('object', 'prefix')),
  target_path text not null check (length(target_path) between 1 and 500),
  status text not null default 'prepared'
    check (status in ('prepared', 'pending', 'processing', 'completed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error_code text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processing_started_at timestamptz,
  processing_token uuid,
  completed_at timestamptz,
  unique (operation_id, bucket_id, target_kind, target_path)
);

create index account_storage_cleanup_pending_idx
on public.account_storage_cleanup_jobs (status, created_at)
where status in ('prepared', 'pending');

create index account_storage_cleanup_completed_idx
on public.account_storage_cleanup_jobs (completed_at)
where status = 'completed';

revoke all on public.account_storage_cleanup_jobs from public, anon, authenticated;
grant select, insert, update, delete on public.account_storage_cleanup_jobs to service_role;
alter table public.account_storage_cleanup_jobs enable row level security;

create table public.operator_maintenance_status (
  worker text primary key check (worker = 'storage-cleanup'),
  last_started_at timestamptz,
  last_succeeded_at timestamptz,
  last_status text not null default 'never'
    check (last_status in ('never', 'running', 'succeeded', 'incomplete')),
  last_claimed integer not null default 0 check (last_claimed >= 0),
  last_failed integer not null default 0 check (last_failed >= 0),
  updated_at timestamptz not null default now()
);

insert into public.operator_maintenance_status (worker)
values ('storage-cleanup');

revoke all on public.operator_maintenance_status from public, anon, authenticated;
grant select, insert, update on public.operator_maintenance_status to service_role;
alter table public.operator_maintenance_status enable row level security;

create or replace function public.purge_expired_content_reports()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_count integer;
begin
  delete from public.content_reports
  where retention_expires_at <= now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.purge_expired_content_reports()
from public, anon, authenticated;
grant execute on function public.purge_expired_content_reports() to service_role;

create or replace function public.update_content_report_status(
  target_report_id uuid,
  next_status text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  updated_count integer;
begin
  if next_status not in ('open', 'reviewing', 'resolved', 'dismissed') then
    raise exception 'KIN_REPORT_STATUS_INVALID' using errcode = '22023';
  end if;

  update public.content_reports
  set status = next_status,
      status_updated_at = now()
  where id = target_report_id;
  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

revoke all on function public.update_content_report_status(uuid, text)
from public, anon, authenticated;
grant execute on function public.update_content_report_status(uuid, text) to service_role;

create or replace function public.queue_space_storage_cleanup(target_space_id uuid)
returns void
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  cleanup_operation_id uuid := gen_random_uuid();
  fallback_owner_id uuid;
begin
  select created_by into fallback_owner_id
  from public.kin_spaces
  where id = target_space_id;

  insert into public.account_storage_cleanup_jobs (
    operation_id,
    owner_id,
    bucket_id,
    target_kind,
    target_path,
    status
  )
  select
    cleanup_operation_id,
    coalesce(public.safe_uuid(objects.owner_id), objects.owner, fallback_owner_id),
    objects.bucket_id,
    'object',
    objects.name,
    'pending'
  from storage.objects objects
  where objects.bucket_id = 'chat-media'
    and (storage.foldername(objects.name))[1] = target_space_id::text
    and coalesce(public.safe_uuid(objects.owner_id), objects.owner, fallback_owner_id) is not null
  on conflict do nothing;

  insert into public.account_storage_cleanup_jobs (
    operation_id,
    owner_id,
    bucket_id,
    target_kind,
    target_path,
    status
  )
  select distinct
    cleanup_operation_id,
    members.user_id,
    'chat-media',
    'prefix',
    target_space_id::text || '/' || members.user_id::text,
    'pending'
  from public.kin_space_members members
  where members.space_id = target_space_id
  on conflict do nothing;
end;
$$;

revoke all on function public.queue_space_storage_cleanup(uuid)
from public, anon, authenticated, service_role;

create or replace function public.prepare_account_storage_cleanup(
  target_operation_id uuid,
  target_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  queued_count integer;
begin
  if target_operation_id is null or target_user_id is null then
    raise exception 'Cleanup operation and user are required' using errcode = '22004';
  end if;

  insert into public.account_storage_cleanup_jobs (
    operation_id,
    owner_id,
    bucket_id,
    target_kind,
    target_path,
    status
  )
  select
    target_operation_id,
    target_user_id,
    objects.bucket_id,
    'object',
    objects.name,
    'prepared'
  from storage.objects objects
  where objects.bucket_id in ('avatars', 'chat-media')
    and (objects.owner_id = target_user_id::text or objects.owner = target_user_id)
  on conflict do nothing;

  insert into public.account_storage_cleanup_jobs (
    operation_id,
    owner_id,
    bucket_id,
    target_kind,
    target_path,
    status
  ) values (
    target_operation_id,
    target_user_id,
    'avatars',
    'prefix',
    target_user_id::text,
    'prepared'
  ) on conflict do nothing;

  insert into public.account_storage_cleanup_jobs (
    operation_id,
    owner_id,
    bucket_id,
    target_kind,
    target_path,
    status
  )
  select distinct
    target_operation_id,
    target_user_id,
    'chat-media',
    'prefix',
    members.space_id::text || '/' || target_user_id::text,
    'prepared'
  from public.kin_space_members members
  where members.user_id = target_user_id
  on conflict do nothing;

  select count(*) into queued_count
  from public.account_storage_cleanup_jobs
  where operation_id = target_operation_id;
  return queued_count;
end;
$$;

revoke all on function public.prepare_account_storage_cleanup(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.prepare_account_storage_cleanup(uuid, uuid) to service_role;

create or replace function public.claim_account_storage_cleanup_jobs(
  target_operation_id uuid default null,
  target_owner_id uuid default null,
  maximum_jobs integer default 100
)
returns table (
  id uuid,
  operation_id uuid,
  owner_id uuid,
  bucket_id text,
  target_kind text,
  target_path text,
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

  update public.account_storage_cleanup_jobs jobs
  set status = 'pending',
      processing_started_at = null,
      processing_token = null,
      last_error_code = 'cleanup_lease_expired',
      updated_at = now()
  where jobs.status = 'processing'
    and jobs.processing_started_at < now() - interval '15 minutes';

  return query
  with candidates as (
    select jobs.id
    from public.account_storage_cleanup_jobs jobs
    where (target_operation_id is null or jobs.operation_id = target_operation_id)
      and (target_owner_id is null or jobs.owner_id = target_owner_id)
      and (
        jobs.status = 'pending'
        or (
          jobs.status = 'prepared'
          and not exists (
            select 1 from public.profiles where profiles.id = jobs.owner_id
          )
        )
      )
    order by jobs.created_at, jobs.id
    for update of jobs skip locked
    limit maximum_jobs
  ), claimed as (
    update public.account_storage_cleanup_jobs jobs
    set status = 'processing',
        attempts = jobs.attempts + 1,
        processing_started_at = now(),
        processing_token = gen_random_uuid(),
        updated_at = now()
    from candidates
    where jobs.id = candidates.id
    returning
      jobs.id,
      jobs.operation_id,
      jobs.owner_id,
      jobs.bucket_id,
      jobs.target_kind,
      jobs.target_path,
      jobs.attempts,
      jobs.processing_token
  )
  select * from claimed;
end;
$$;

revoke all on function public.claim_account_storage_cleanup_jobs(uuid, uuid, integer)
from public, anon, authenticated;
grant execute on function public.claim_account_storage_cleanup_jobs(uuid, uuid, integer)
to service_role;

create or replace function public.purge_finished_storage_cleanup_jobs()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_count integer;
begin
  delete from public.account_storage_cleanup_jobs jobs
  where (
    jobs.status = 'completed'
    and jobs.completed_at <= now() - interval '30 days'
  ) or (
    jobs.status = 'prepared'
    and jobs.created_at <= now() - interval '7 days'
    and exists (select 1 from public.profiles where profiles.id = jobs.owner_id)
  );
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.purge_finished_storage_cleanup_jobs()
from public, anon, authenticated;
grant execute on function public.purge_finished_storage_cleanup_jobs() to service_role;

drop policy if exists profiles_delete_self on public.profiles;
revoke delete on public.profiles from authenticated;

create or replace function public.finalize_profile_deletion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owned_space record;
  replacement_user_id uuid;
begin
  for owned_space in
    select id from public.kin_spaces where created_by = old.id for update
  loop
    update public.space_invites
    set revoked_at = coalesce(revoked_at, now())
    where space_id = owned_space.id
      and use_count < max_uses;

    select user_id into replacement_user_id
    from public.kin_space_members
    where space_id = owned_space.id
      and user_id <> old.id
      and left_at is null
    order by joined_at asc
    limit 1;

    if replacement_user_id is null then
      perform public.queue_space_storage_cleanup(owned_space.id);
      delete from public.kin_spaces where id = owned_space.id;
    else
      update public.kin_spaces
      set created_by = replacement_user_id
      where id = owned_space.id;

      update public.kin_space_members
      set role = 'owner'
      where space_id = owned_space.id and user_id = replacement_user_id;
    end if;
  end loop;

  return old;
end;
$$;

revoke all on function public.finalize_profile_deletion()
from public, anon, authenticated, service_role;

create trigger profiles_finalize_account_deletion
before delete on public.profiles
for each row execute function public.finalize_profile_deletion();

create or replace function public.prepare_account_deletion(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if target_user_id is null or not exists (
    select 1 from public.profiles where id = target_user_id
  ) then
    raise exception 'Target user is required' using errcode = '22004';
  end if;
end;
$$;

revoke all on function public.prepare_account_deletion(uuid)
from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;

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
    perform public.queue_space_storage_cleanup(target_space_id);
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

revoke all on function public.leave_kin_space(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.leave_kin_space(uuid) to authenticated;
