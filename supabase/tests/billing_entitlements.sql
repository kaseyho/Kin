begin;

create extension if not exists pgtap with schema extensions;
select plan(31);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  ('16000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@billing.test', extensions.crypt('password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('16000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'partner@billing.test', extensions.crypt('password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('16000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stranger@billing.test', extensions.crypt('password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

insert into public.profiles (id, display_name)
values
  ('16000000-0000-0000-0000-000000000001', 'Memory Owner'),
  ('16000000-0000-0000-0000-000000000002', 'Memory Partner'),
  ('16000000-0000-0000-0000-000000000003', 'Memory Stranger');

insert into public.kin_spaces (id, created_by)
values
  ('26000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000000001'),
  ('26000000-0000-0000-0000-000000000002', '16000000-0000-0000-0000-000000000001');

insert into public.kin_space_members (space_id, user_id, role)
values
  ('26000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000000001', 'owner'),
  ('26000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000000002', 'member'),
  ('26000000-0000-0000-0000-000000000002', '16000000-0000-0000-0000-000000000001', 'owner');

insert into public.messages (id, space_id, sender_id, kind, body)
values
  ('36000000-0000-0000-0000-000000000001', '26000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000000001', 'text', 'Source in the shared Space'),
  ('36000000-0000-0000-0000-000000000002', '26000000-0000-0000-0000-000000000002', '16000000-0000-0000-0000-000000000001', 'text', 'Source in a different Space');

select ok(
  not has_table_privilege('anon', 'public.billing_entitlements', 'select')
  and not has_table_privilege('authenticated', 'public.billing_entitlements', 'select')
  and not has_table_privilege('authenticated', 'public.billing_entitlements', 'insert')
  and not has_table_privilege('authenticated', 'public.revenuecat_webhook_events', 'select')
  and has_table_privilege('service_role', 'public.billing_entitlements', 'select')
  and has_table_privilege('service_role', 'public.revenuecat_webhook_events', 'insert')
  and has_function_privilege(
    'service_role',
    'public.sync_revenuecat_entitlement(text,text,uuid,text,boolean,timestamp with time zone,text,text,text,timestamp with time zone)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.sync_revenuecat_entitlement(text,text,uuid,text,boolean,timestamp with time zone,text,text,text,timestamp with time zone)',
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.create_memory_item(uuid,uuid,text,text,text,date,text,text,uuid[],text[])',
    'execute'
  )
  and not has_function_privilege('authenticated', 'public.has_active_kin_plus(uuid)', 'execute'),
  'billing tables stay private and only the narrow service/authenticated functions are exposed'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.sync_revenuecat_entitlement(
    'evt_denied', 'INITIAL_PURCHASE', auth.uid(), 'kin_plus', true, null, 'kin_plus_monthly',
    'app_store', 'sandbox', now()
  )$$,
  '42501',
  null,
  'authenticated clients cannot write the entitlement projection through its service function'
);
reset role;

set local role service_role;
select throws_ok(
  $$select public.sync_revenuecat_entitlement(
    '', 'INITIAL_PURCHASE', '16000000-0000-0000-0000-000000000001', 'kin_plus', true, null,
    'kin_plus_monthly', 'app_store', 'sandbox', now()
  )$$,
  '22023',
  'KIN_REVENUECAT_EVENT_INVALID',
  'empty RevenueCat event IDs are rejected'
);
select throws_ok(
  $$select public.sync_revenuecat_entitlement(
    'evt_bad_type', 'bad event type', '16000000-0000-0000-0000-000000000001', 'kin_plus', true,
    null, 'kin_plus_monthly', 'app_store', 'sandbox', now()
  )$$,
  '22023',
  'KIN_REVENUECAT_EVENT_INVALID',
  'malformed RevenueCat event types are rejected'
);
select throws_ok(
  $$select public.sync_revenuecat_entitlement(
    'evt_bad_entitlement', 'INITIAL_PURCHASE', '16000000-0000-0000-0000-000000000001', 'other', true,
    null, 'kin_plus_monthly', 'app_store', 'sandbox', now()
  )$$,
  '22023',
  'KIN_REVENUECAT_EVENT_INVALID',
  'unexpected entitlement identifiers are rejected'
);
select throws_ok(
  $$select public.sync_revenuecat_entitlement(
    'evt_bad_time', 'INITIAL_PURCHASE', '16000000-0000-0000-0000-000000000001', 'kin_plus', true,
    null, 'kin_plus_monthly', 'app_store', 'sandbox', null
  )$$,
  '22023',
  'KIN_REVENUECAT_EVENT_INVALID',
  'missing provider event timestamps are rejected'
);
select throws_ok(
  $$select public.sync_revenuecat_entitlement(
    'evt_bad_store', 'INITIAL_PURCHASE', '16000000-0000-0000-0000-000000000001', 'kin_plus', true,
    null, 'kin_plus_monthly', 'not-a-store', 'sandbox', now()
  )$$,
  '22023',
  'KIN_REVENUECAT_EVENT_INVALID',
  'unknown RevenueCat stores are rejected'
);
select throws_ok(
  $$select public.sync_revenuecat_entitlement(
    'evt_bad_environment', 'INITIAL_PURCHASE', '16000000-0000-0000-0000-000000000001', 'kin_plus', true,
    null, 'kin_plus_monthly', 'app_store', 'neither', now()
  )$$,
  '22023',
  'KIN_REVENUECAT_EVENT_INVALID',
  'unknown RevenueCat environments are rejected'
);
select ok(
  public.sync_revenuecat_entitlement(
    'evt_active', 'INITIAL_PURCHASE', '16000000-0000-0000-0000-000000000001', 'kin_plus', true,
    now() + interval '1 month', 'kin_plus_monthly', 'app_store', 'sandbox', now()
  ),
  'the service role can project a current RevenueCat entitlement'
);
select is(
  public.sync_revenuecat_entitlement(
    'evt_active', 'INITIAL_PURCHASE', '16000000-0000-0000-0000-000000000001', 'kin_plus', true,
    now() + interval '1 month', 'kin_plus_monthly', 'app_store', 'sandbox', now()
  ),
  false,
  'a repeated RevenueCat event ID is idempotent'
);
reset role;

select ok(
  (select count(*) from public.revenuecat_webhook_events where event_id = 'evt_active') = 1
  and (select count(*) from public.billing_entitlements where user_id = '16000000-0000-0000-0000-000000000001') = 1,
  'one event receipt and one entitlement projection are stored'
);
select ok(
  public.has_active_kin_plus('16000000-0000-0000-0000-000000000001'),
  'an active unexpired kin_plus projection is recognized'
);

set local role service_role;
select ok(
  public.sync_revenuecat_entitlement(
    'evt_expired', 'EXPIRATION', '16000000-0000-0000-0000-000000000001', 'kin_plus', true,
    now() - interval '1 minute', 'kin_plus_monthly', 'app_store', 'sandbox', now()
  ),
  'a later projection can record an expired entitlement'
);
reset role;
select is(
  public.has_active_kin_plus('16000000-0000-0000-0000-000000000001'),
  false,
  'an expired projected entitlement is not active'
);

select ok(
  not has_table_privilege('authenticated', 'public.memory_items', 'insert')
  and not has_table_privilege('authenticated', 'public.memory_item_messages', 'insert')
  and has_table_privilege('authenticated', 'public.memory_items', 'update')
  and has_table_privilege('authenticated', 'public.memory_items', 'delete'),
  'authenticated callers must use atomic creation while retaining creator update/delete operations'
);
select matches(
  lower(pg_get_functiondef('public.create_memory_item(uuid,uuid,text,text,text,date,text,text,uuid[],text[])'::regprocedure)),
  'for update',
  'memory creation locks the active membership before its count-and-insert decision'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000001', true);
select public.create_memory_item(
  '46000000-0000-0000-0000-000000000001',
  '26000000-0000-0000-0000-000000000001',
  'moment', 'private', '  First memory  ', date '2026-09-23',
  ' A note ', '  Singapore ',
  array['36000000-0000-0000-0000-000000000001']::uuid[],
  array['storage://chat-media/26000000-0000-0000-0000-000000000001/16000000-0000-0000-0000-000000000001/memory.jpg']
);
reset role;
select ok(
  exists (
    select 1 from public.memory_items
    where id = '46000000-0000-0000-0000-000000000001'
      and created_by = '16000000-0000-0000-0000-000000000001'
      and title = 'First memory'
      and note = 'A note'
      and place = 'Singapore'
  ) and exists (
    select 1 from public.memory_item_messages
    where memory_id = '46000000-0000-0000-0000-000000000001'
      and message_id = '36000000-0000-0000-0000-000000000001'
  ),
  'atomic memory creation derives the creator, normalizes text, and links the source message'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.create_memory_item(
    '46000000-0000-0000-0000-000000000001',
    '26000000-0000-0000-0000-000000000001',
    'moment', 'private', 'First memory', date '2026-09-23',
    'A note', 'Singapore',
    array['36000000-0000-0000-0000-000000000001']::uuid[],
    array['storage://chat-media/26000000-0000-0000-0000-000000000001/16000000-0000-0000-0000-000000000001/memory.jpg']
  )$$,
  'an exact replay of a client memory UUID succeeds idempotently'
);
select is(
  (select count(*) from public.memory_items where id = '46000000-0000-0000-0000-000000000001'),
  1::bigint,
  'an idempotent replay still stores one memory'
);
select throws_ok(
  $$select public.create_memory_item(
    '46000000-0000-0000-0000-000000000001',
    '26000000-0000-0000-0000-000000000001',
    'moment', 'private', 'Changed title', date '2026-09-23',
    'A note', 'Singapore',
    array['36000000-0000-0000-0000-000000000001']::uuid[],
    array['storage://chat-media/26000000-0000-0000-0000-000000000001/16000000-0000-0000-0000-000000000001/memory.jpg']
  )$$,
  '23505',
  'KIN_MEMORY_IDEMPOTENCY_CONFLICT',
  'a client memory UUID cannot overwrite a changed payload'
);

select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.create_memory_item(
    '46000000-0000-0000-0000-000000000001',
    '26000000-0000-0000-0000-000000000001',
    'moment', 'private', 'First memory', date '2026-09-23',
    'A note', 'Singapore',
    array['36000000-0000-0000-0000-000000000001']::uuid[],
    array['storage://chat-media/26000000-0000-0000-0000-000000000001/16000000-0000-0000-0000-000000000001/memory.jpg']
  )$$,
  '23505',
  'KIN_MEMORY_IDEMPOTENCY_CONFLICT',
  'another member cannot reuse a memory UUID'
);

select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.create_memory_item(
    '46000000-0000-0000-0000-000000000090',
    '26000000-0000-0000-0000-000000000001',
    'unknown', 'private', '', null, '', null, '{}'::uuid[], '{}'::text[]
  )$$,
  '22023',
  'KIN_MEMORY_INVALID',
  'invalid memory fields are rejected before insertion'
);
select throws_ok(
  $$select public.create_memory_item(
    '46000000-0000-0000-0000-000000000091',
    '26000000-0000-0000-0000-000000000001',
    'moment', 'private', 'Wrong source', date '2026-09-23', '', null,
    array['36000000-0000-0000-0000-000000000002']::uuid[], '{}'::text[]
  )$$,
  '22023',
  'KIN_MEMORY_INVALID',
  'source messages from another Space are rejected'
);

select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.create_memory_item(
    '46000000-0000-0000-0000-000000000092',
    '26000000-0000-0000-0000-000000000001',
    'moment', 'private', 'Intrusion', date '2026-09-23', '', null,
    '{}'::uuid[], '{}'::text[]
  )$$,
  'P0001',
  'KIN_SPACE_UNAVAILABLE',
  'a stranger cannot create a memory in another Space'
);

select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000002', true);
reset role;
update public.kin_space_members
set left_at = now()
where space_id = '26000000-0000-0000-0000-000000000001'
  and user_id = '16000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.create_memory_item(
    '46000000-0000-0000-0000-000000000093',
    '26000000-0000-0000-0000-000000000001',
    'moment', 'private', 'After leaving', date '2026-09-23', '', null,
    '{}'::uuid[], '{}'::text[]
  )$$,
  'P0001',
  'KIN_SPACE_UNAVAILABLE',
  'a departed member cannot create a memory'
);
reset role;
update public.kin_space_members
set left_at = null
where space_id = '26000000-0000-0000-0000-000000000001'
  and user_id = '16000000-0000-0000-0000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000001', true);
select public.create_memory_item(
  ('46000000-0000-0000-0000-' || lpad(sequence::text, 12, '0'))::uuid,
  '26000000-0000-0000-0000-000000000001',
  'moment', 'private', 'Free memory ' || sequence, date '2026-09-23', '', null,
  '{}'::uuid[], '{}'::text[]
)
from generate_series(2, 5) sequence;
reset role;
select is(
  (
    select count(*) from public.memory_items
    where space_id = '26000000-0000-0000-0000-000000000001'
      and created_by = '16000000-0000-0000-0000-000000000001'
  ),
  5::bigint,
  'a non-premium user can own exactly five free memories in one Space'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.create_memory_item(
    '46000000-0000-0000-0000-000000000006',
    '26000000-0000-0000-0000-000000000001',
    'moment', 'private', 'Sixth without Kin+', date '2026-09-23', '', null,
    '{}'::uuid[], '{}'::text[]
  )$$,
  'P0001',
  'KIN_MEMORY_LIMIT_REACHED',
  'the sixth owned memory is blocked without an active Kin+ projection'
);

select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select public.create_memory_item(
    '46000000-0000-0000-0000-000000000020',
    '26000000-0000-0000-0000-000000000001',
    'moment', 'shared', 'Partner memory', date '2026-09-23', '', null,
    '{}'::uuid[], '{}'::text[]
  )$$,
  'the partner has an independent free allowance despite visible shared memories'
);
reset role;

set local role service_role;
select public.sync_revenuecat_entitlement(
  'evt_reactivated', 'UNCANCELLATION', '16000000-0000-0000-0000-000000000001', 'kin_plus', true,
  null, 'kin_plus_lifetime', 'promotional', 'sandbox', now()
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.create_memory_item(
    '46000000-0000-0000-0000-000000000006',
    '26000000-0000-0000-0000-000000000001',
    'moment', 'private', 'Sixth with Kin+', date '2026-09-23', '', null,
    '{}'::uuid[], '{}'::text[]
  )$$,
  'an active Kin+ projection permits an additional memory'
);
reset role;

set local role service_role;
select public.sync_revenuecat_entitlement(
  'evt_revoked', 'EXPIRATION', '16000000-0000-0000-0000-000000000001', 'kin_plus', false,
  null, 'kin_plus_lifetime', 'promotional', 'sandbox', now()
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.create_memory_item(
    '46000000-0000-0000-0000-000000000007',
    '26000000-0000-0000-0000-000000000001',
    'moment', 'private', 'Seventh after revoke', date '2026-09-23', '', null,
    '{}'::uuid[], '{}'::text[]
  )$$,
  'P0001',
  'KIN_MEMORY_LIMIT_REACHED',
  'revocation restores the creation limit without removing existing memories'
);
update public.memory_items
set title = 'Updated existing memory'
where id = '46000000-0000-0000-0000-000000000001';
select is(
  (select title from public.memory_items where id = '46000000-0000-0000-0000-000000000001'),
  'Updated existing memory',
  'the creator can still edit an existing memory after entitlement loss'
);

select * from finish();
rollback;
