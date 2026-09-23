begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'message_notification_outbox'
      and column_name = 'installation_id'
      and is_nullable = 'NO'
  ),
  'the forward migration adds the required non-null installation reference'
);

select is(
  (select count(*) from public.message_notification_outbox),
  5::bigint,
  'fresh legacy jobs fan out while one stale legacy job remains a single terminal audit row'
);

select is(
  (select count(distinct installation_id) from public.message_notification_outbox),
  2::bigint,
  'upgraded jobs address both existing installations independently'
);

select is(
  (select count(*) from public.message_notification_outbox where status = 'pending'),
  4::bigint,
  'an abandoned legacy processing lease is safely recovered as pending work'
);

select ok(
  exists (
    select 1 from public.message_notification_outbox
    where message_id = '35000000-0000-0000-0000-000000000002'
      and last_error_code = 'notification_delivery_upgrade'
  ),
  'upgraded processing work keeps a coarse recovery reason'
);

select ok(
  exists (
    select 1 from public.message_notification_outbox
    where message_id = '35000000-0000-0000-0000-000000000003'
      and status = 'failed'
      and last_error_code = 'notification_upgrade_stale'
      and completed_at is not null
  ),
  'legacy notification work older than 24 hours is terminal and cannot create a stale push burst'
);

select ok(
  has_function_privilege('service_role', 'public.claim_message_notification_receipts(integer)', 'execute')
  and has_function_privilege('service_role', 'public.record_message_notification_heartbeat(text,integer,integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.get_message_notification_payload(uuid,uuid)', 'execute'),
  'the upgraded database exposes delivery and liveness contracts only to the service role'
);

set local role service_role;
select is(
  (select count(*) from public.claim_message_notification_jobs(100)),
  4::bigint,
  'the upgraded pending jobs are immediately claimable with installation leases'
);
reset role;

select * from finish();
rollback;
