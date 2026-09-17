begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  ('13000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'deleting@cleanup.test', extensions.crypt('password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('13000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'remaining@cleanup.test', extensions.crypt('password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

insert into public.profiles (id, display_name)
values
  ('13000000-0000-0000-0000-000000000001', 'Deleting member'),
  ('13000000-0000-0000-0000-000000000002', 'Remaining member');

insert into public.kin_spaces (id, created_by)
values
  ('23000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001'),
  ('23000000-0000-0000-0000-000000000002', '13000000-0000-0000-0000-000000000001');

insert into public.kin_space_members (space_id, user_id, role)
values
  ('23000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001', 'owner'),
  ('23000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000002', 'member'),
  ('23000000-0000-0000-0000-000000000002', '13000000-0000-0000-0000-000000000001', 'owner');

insert into public.space_invites (space_id, created_by, code)
values
  ('23000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001', 'CLEAN001'),
  ('23000000-0000-0000-0000-000000000002', '13000000-0000-0000-0000-000000000001', 'CLEAN002');

insert into public.messages (id, space_id, sender_id, kind, body)
values
  ('33000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001', 'text', 'Deleting member content'),
  ('33000000-0000-0000-0000-000000000002', '23000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000002', 'text', 'Remaining member content');

insert into public.memory_items (
  id, space_id, created_by, kind, visibility, title, occurred_on
)
values
  ('43000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001', 'moment', 'shared', 'Deleting member memory', current_date),
  ('43000000-0000-0000-0000-000000000002', '23000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000002', 'moment', 'private', 'Remaining member memory', current_date);

insert into public.user_blocks (blocker_id, blocked_id, space_id)
values
  ('13000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000002', '23000000-0000-0000-0000-000000000001');

insert into public.content_reports (
  id, reporter_id, reported_user_id, space_id, message_id, category, explanation
)
values
  ('53000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000002', '23000000-0000-0000-0000-000000000001', '33000000-0000-0000-0000-000000000002', 'harassment', 'Report authored by deleting member'),
  ('53000000-0000-0000-0000-000000000002', '13000000-0000-0000-0000-000000000002', '13000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001', '33000000-0000-0000-0000-000000000001', 'threats', 'Report about deleting member');

insert into storage.objects (bucket_id, name, owner_id)
values (
  'chat-media',
  'orphaned-space/13000000-0000-0000-0000-000000000001/orphan.jpg',
  '13000000-0000-0000-0000-000000000001'
);

select ok(
  not has_table_privilege('authenticated', 'public.account_storage_cleanup_jobs', 'select')
  and not has_table_privilege('authenticated', 'public.account_storage_cleanup_jobs', 'insert')
  and has_table_privilege('service_role', 'public.account_storage_cleanup_jobs', 'select')
  and not has_table_privilege('authenticated', 'public.operator_maintenance_status', 'select')
  and has_table_privilege('service_role', 'public.operator_maintenance_status', 'select')
  and not has_function_privilege('authenticated', 'public.update_content_report_status(uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.purge_expired_content_reports()', 'execute')
  and not has_function_privilege('authenticated', 'public.prepare_account_storage_cleanup(uuid,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.claim_account_storage_cleanup_jobs(uuid,uuid,integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.purge_finished_storage_cleanup_jobs()', 'execute')
  and has_function_privilege('service_role', 'public.update_content_report_status(uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.purge_expired_content_reports()', 'execute')
  and has_function_privilege('service_role', 'public.prepare_account_storage_cleanup(uuid,uuid)', 'execute')
  and has_function_privilege('service_role', 'public.claim_account_storage_cleanup_jobs(uuid,uuid,integer)', 'execute')
  and has_function_privilege('service_role', 'public.purge_finished_storage_cleanup_jobs()', 'execute'),
  'cleanup jobs and moderation operations are service-role only'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000001', true);
select throws_ok(
  'delete from public.profiles where id = auth.uid()',
  '42501',
  null,
  'an authenticated token cannot bypass fresh verification by deleting its profile directly'
);
reset role;

set local role service_role;
select public.prepare_account_storage_cleanup(
  '63000000-0000-0000-0000-000000000001',
  '13000000-0000-0000-0000-000000000001'
);

select ok(
  exists (
    select 1 from public.account_storage_cleanup_jobs
    where operation_id = '63000000-0000-0000-0000-000000000001'
      and target_kind = 'object'
      and target_path = 'orphaned-space/13000000-0000-0000-0000-000000000001/orphan.jpg'
  ),
  'cleanup discovery includes owned media outside current Space memberships'
);

select is(
  (
    select count(*)
    from public.claim_account_storage_cleanup_jobs(
      '63000000-0000-0000-0000-000000000001',
      '13000000-0000-0000-0000-000000000001',
      500
    )
  ),
  0::bigint,
  'prepared cleanup cannot activate while the owner profile still exists'
);
reset role;

delete from auth.users where id = '13000000-0000-0000-0000-000000000001';

select ok(
  exists (
    select 1 from public.kin_spaces
    where id = '23000000-0000-0000-0000-000000000001'
      and created_by = '13000000-0000-0000-0000-000000000002'
  )
  and exists (
    select 1 from public.kin_space_members
    where space_id = '23000000-0000-0000-0000-000000000001'
      and user_id = '13000000-0000-0000-0000-000000000002'
      and role = 'owner'
      and left_at is null
  )
  and not exists (
    select 1 from public.kin_spaces where id = '23000000-0000-0000-0000-000000000002'
  ),
  'account deletion transfers a shared Space and removes an empty Space'
);

select is(
  (select count(*) from public.space_invites where created_by = '13000000-0000-0000-0000-000000000001'),
  0::bigint,
  'account deletion removes invitations authored by the deleted account'
);

select is(
  (select count(*) from public.user_blocks where blocker_id = '13000000-0000-0000-0000-000000000001' or blocked_id = '13000000-0000-0000-0000-000000000001'),
  0::bigint,
  'account deletion removes block rows involving the deleted account'
);

select ok(
  (select count(*) from public.content_reports where id in ('53000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000002')) = 2
  and (select reporter_id from public.content_reports where id = '53000000-0000-0000-0000-000000000001') is null
  and (select reported_user_id from public.content_reports where id = '53000000-0000-0000-0000-000000000002') is null
  and (select min(retention_expires_at) > now() + interval '179 days' from public.content_reports where id in ('53000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000002')),
  'reports survive account deletion with identities pseudonymized for the retention period'
);

select ok(
  exists (select 1 from public.messages where id = '33000000-0000-0000-0000-000000000002')
  and not exists (select 1 from public.messages where id = '33000000-0000-0000-0000-000000000001')
  and exists (select 1 from public.memory_items where id = '43000000-0000-0000-0000-000000000002')
  and not exists (select 1 from public.memory_items where id = '43000000-0000-0000-0000-000000000001'),
  'account deletion removes only the deleted account authored content'
);

select is(
  (select count(*) from public.account_storage_cleanup_jobs where operation_id = '63000000-0000-0000-0000-000000000001'),
  4::bigint,
  'durable Storage cleanup jobs survive account deletion for retry'
);

set local role service_role;
select is(
  (
    select count(*)
    from public.claim_account_storage_cleanup_jobs(
      '63000000-0000-0000-0000-000000000001',
      '13000000-0000-0000-0000-000000000001',
      500
    )
  ),
  4::bigint,
  'profile deletion atomically makes every prepared cleanup job claimable'
);
select is(
  (
    select count(*)
    from public.claim_account_storage_cleanup_jobs(
      '63000000-0000-0000-0000-000000000001',
      '13000000-0000-0000-0000-000000000001',
      500
    )
  ),
  0::bigint,
  'claimed cleanup jobs cannot be concurrently claimed again'
);
reset role;

set local role service_role;
do $$
begin
  if not public.update_content_report_status(
    '53000000-0000-0000-0000-000000000001',
    'reviewing'
  ) then
    raise exception 'Expected the report status transition to update one row';
  end if;
end;
$$;
select is(
  (
    select status::text
    from public.content_reports
    where id = '53000000-0000-0000-0000-000000000001'
  ),
  'reviewing',
  'the service role can move a report through a constrained moderation status'
);
reset role;

update public.content_reports
set retention_expires_at = now() - interval '1 minute'
where id in ('53000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000002');
set local role service_role;
select is(
  public.purge_expired_content_reports(),
  2,
  'the service role can purge report evidence after the retention period'
);

reset role;

update public.account_storage_cleanup_jobs
set status = 'completed',
    completed_at = now() - interval '31 days',
    processing_started_at = null,
    processing_token = null
where id = (
  select id from public.account_storage_cleanup_jobs
  where operation_id = '63000000-0000-0000-0000-000000000001'
  limit 1
);

insert into public.account_storage_cleanup_jobs (
  operation_id, owner_id, bucket_id, target_kind, target_path, status, created_at
) values (
  '63000000-0000-0000-0000-000000000002',
  '13000000-0000-0000-0000-000000000002',
  'avatars',
  'prefix',
  '13000000-0000-0000-0000-000000000002',
  'prepared',
  now() - interval '8 days'
);

set local role service_role;
select is(
  public.purge_finished_storage_cleanup_jobs(),
  2,
  'finished jobs and abandoned live-account preparations expire without deleting retryable work'
);
reset role;
select * from finish();
rollback;
