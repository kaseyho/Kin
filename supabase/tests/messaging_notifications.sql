begin;

create extension if not exists pgtap with schema extensions;
select plan(28);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  ('14000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sender@messaging.test', extensions.crypt('password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('14000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'recipient@messaging.test', extensions.crypt('password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('14000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stranger@messaging.test', extensions.crypt('password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

insert into public.profiles (id, display_name)
values
  ('14000000-0000-0000-0000-000000000001', 'Sender'),
  ('14000000-0000-0000-0000-000000000002', 'Recipient'),
  ('14000000-0000-0000-0000-000000000003', 'Stranger');

insert into public.kin_spaces (id, created_by)
values ('24000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000001');

insert into public.kin_space_members (space_id, user_id, role, last_read_at)
values
  ('24000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000001', 'owner', now() - interval '1 minute'),
  ('24000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000002', 'member', now() - interval '1 minute');

select ok(
  not has_table_privilege('authenticated', 'public.messages', 'insert')
  and not has_table_privilege('authenticated', 'public.push_installations', 'select')
  and not has_table_privilege('authenticated', 'public.message_notification_outbox', 'select')
  and not has_function_privilege('authenticated', 'public.claim_message_notification_jobs(integer)', 'execute')
  and has_function_privilege('service_role', 'public.claim_message_notification_jobs(integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.complete_message_notification_job(uuid,uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.fail_message_notification_job(uuid,uuid,text,timestamp with time zone)', 'execute')
  and not has_function_privilege('authenticated', 'public.complete_message_notification_receipt(uuid,text,boolean,text)', 'execute'),
  'message insertion and notification delivery use only the intended privileged contracts'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000002', true);
select public.register_push_installation(
  'recipient-installation-0001',
  'ExponentPushToken[recipient-test-0001]',
  'ios'
);

select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$insert into public.messages (space_id, sender_id, kind, body)
    values ('24000000-0000-0000-0000-000000000001', auth.uid(), 'text', 'bypass')$$,
  '42501',
  null,
  'authenticated clients cannot bypass idempotency and outbox creation with a direct insert'
);

select public.send_kin_message(
  '34000000-0000-0000-0000-000000000001',
  '24000000-0000-0000-0000-000000000001',
  'text',
  'First idempotent hello',
  null
);

reset role;
select ok(
  exists (
    select 1 from public.messages
    where id = '34000000-0000-0000-0000-000000000001'
      and sender_id = '14000000-0000-0000-0000-000000000001'
  )
  and exists (
    select 1 from public.message_notification_outbox
    where message_id = '34000000-0000-0000-0000-000000000001'
      and recipient_id = '14000000-0000-0000-0000-000000000002'
      and status = 'pending'
  ),
  'a message send derives its sender and queues only the active recipient'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);
select public.send_kin_message(
  '34000000-0000-0000-0000-000000000001',
  '24000000-0000-0000-0000-000000000001',
  'text',
  'First idempotent hello',
  null
);
reset role;
select ok(
  (select count(*) from public.messages where id = '34000000-0000-0000-0000-000000000001') = 1
  and (select count(*) from public.message_notification_outbox where message_id = '34000000-0000-0000-0000-000000000001') = 1,
  'repeating the same client UUID is idempotent for both message and push work'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.send_kin_message(
    '34000000-0000-0000-0000-000000000001',
    '24000000-0000-0000-0000-000000000001',
    'text',
    'Changed payload',
    null
  )$$,
  '23505',
  'KIN_MESSAGE_ID_CONFLICT',
  'an idempotency UUID cannot overwrite a different payload'
);

select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.send_kin_message(
    '34000000-0000-0000-0000-000000000001',
    '24000000-0000-0000-0000-000000000001',
    'text',
    'First idempotent hello',
    null
  )$$,
  '23505',
  'KIN_MESSAGE_ID_CONFLICT',
  'a member cannot reuse a message UUID owned by the other sender'
);

select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.send_kin_message(
    '34000000-0000-0000-0000-000000000090',
    '24000000-0000-0000-0000-000000000001',
    'video',
    '',
    null
  )$$,
  '22023',
  'KIN_MESSAGE_INVALID',
  'invalid message kinds and empty payloads are rejected'
);

select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000002', true);
select is(
  (select unread_count from public.get_my_unread_counts() where space_id = '24000000-0000-0000-0000-000000000001'),
  1::bigint,
  'the recipient sees one unread partner message'
);

select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);
select is(
  (select unread_count from public.get_my_unread_counts() where space_id = '24000000-0000-0000-0000-000000000001'),
  0::bigint,
  'the sender does not count their own message as unread'
);

select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000002', true);
select public.mark_space_read('24000000-0000-0000-0000-000000000001');
select is(
  (select unread_count from public.get_my_unread_counts() where space_id = '24000000-0000-0000-0000-000000000001'),
  0::bigint,
  'marking a Space read clears its unread count'
);

reset role;
insert into public.messages (id, space_id, sender_id, kind, body, created_at)
select
  ('34000000-0000-0000-0000-' || lpad(sequence::text, 12, '0'))::uuid,
  '24000000-0000-0000-0000-000000000001',
  '14000000-0000-0000-0000-000000000001',
  'text',
  'History ' || sequence,
  now() - ((56 - sequence) * interval '1 second')
from generate_series(2, 56) sequence;

set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000002', true);
select is(
  (
    select count(*)
    from public.list_space_messages(
      '24000000-0000-0000-0000-000000000001', null, null, 50
    )
  ),
  50::bigint,
  'the newest message page is bounded to the requested size'
);

with first_page as (
  select * from public.list_space_messages(
    '24000000-0000-0000-0000-000000000001', null, null, 50
  )
), cursor_row as (
  select created_at, id from first_page order by created_at, id limit 1
)
select is(
  (
    select count(*)
    from public.list_space_messages(
      '24000000-0000-0000-0000-000000000001',
      (select created_at from cursor_row),
      (select id from cursor_row),
      50
    )
  ),
  6::bigint,
  'the stable tuple cursor returns the remaining older page without overlap'
);

select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select * from public.list_space_messages(
    '24000000-0000-0000-0000-000000000001', null, null, 50
  )$$,
  'P0001',
  'KIN_SPACE_UNAVAILABLE',
  'a stranger cannot page through another Space'
);
select throws_ok(
  $$select public.send_kin_message(
    '34000000-0000-0000-0000-000000000099',
    '24000000-0000-0000-0000-000000000001',
    'text',
    'Intrusion',
    null
  )$$,
  'P0001',
  'KIN_SPACE_UNAVAILABLE',
  'a stranger cannot send into another Space'
);
select throws_ok(
  $$select public.mark_space_read('24000000-0000-0000-0000-000000000001')$$,
  'P0001',
  'KIN_SPACE_UNAVAILABLE',
  'a stranger cannot move another membership unread cursor'
);

select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.register_push_installation(
    'recipient-installation-0001',
    'ExponentPushToken[stolen-install-0001]',
    'android'
  )$$,
  '23505',
  'KIN_PUSH_INSTALLATION_OWNED',
  'an installation ID cannot be claimed by another account'
);

select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000002', true);
select public.register_push_installation(
  'account-switch-old-installation',
  'ExponentPushToken[account-switch-device]',
  'ios'
);
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);
select public.register_push_installation(
  'account-switch-new-installation',
  'ExponentPushToken[account-switch-device]',
  'ios',
  'account-switch-old-installation'
);
reset role;
select ok(
  exists (
    select 1 from public.push_installations
    where user_id = '14000000-0000-0000-0000-000000000001'
      and installation_id = 'account-switch-new-installation'
      and expo_push_token = 'ExponentPushToken[account-switch-device]'
  ) and not exists (
    select 1 from public.push_installations
    where installation_id = 'account-switch-old-installation'
  ),
  'a device can safely transfer its token after a failed previous-account deactivation'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000002', true);
select ok(
  public.deactivate_push_installation('recipient-installation-0001'),
  'the installation owner can remove their current device'
);
reset role;
select is(
  (select count(*) from public.push_installations where installation_id = 'recipient-installation-0001'),
  0::bigint,
  'deactivation releases the installation for a future account on the same device'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);
select public.send_kin_message(
  '34000000-0000-0000-0000-000000000057',
  '24000000-0000-0000-0000-000000000001',
  'text',
  'No push while inactive',
  null
);
reset role;
select is(
  (select count(*) from public.message_notification_outbox),
  1::bigint,
  'an inactive installation suppresses new push work without blocking the message'
);

reset role;
insert into public.user_blocks (blocker_id, blocked_id, space_id)
values (
  '14000000-0000-0000-0000-000000000002',
  '14000000-0000-0000-0000-000000000001',
  '24000000-0000-0000-0000-000000000001'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);
select public.send_kin_message(
  '34000000-0000-0000-0000-000000000059',
  '24000000-0000-0000-0000-000000000001',
  'text',
  'No push while blocked',
  null
);
reset role;
select is(
  (select count(*) from public.message_notification_outbox),
  1::bigint,
  'a block suppresses new push work immediately'
);
delete from public.user_blocks
where blocker_id = '14000000-0000-0000-0000-000000000002'
  and blocked_id = '14000000-0000-0000-0000-000000000001';

update public.kin_space_members
set left_at = now()
where space_id = '24000000-0000-0000-0000-000000000001'
  and user_id = '14000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);
select public.send_kin_message(
  '34000000-0000-0000-0000-000000000060',
  '24000000-0000-0000-0000-000000000001',
  'text',
  'No push after leaving',
  null
);
reset role;
select is(
  (select count(*) from public.message_notification_outbox),
  1::bigint,
  'an inactive recipient membership suppresses new push work immediately'
);
update public.kin_space_members
set left_at = null
where space_id = '24000000-0000-0000-0000-000000000001'
  and user_id = '14000000-0000-0000-0000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000002', true);
select public.register_push_installation(
  'recipient-installation-0001',
  'ExponentPushToken[recipient-test-0002]',
  'ios'
);
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);
select public.send_kin_message(
  '34000000-0000-0000-0000-000000000058',
  '24000000-0000-0000-0000-000000000001',
  'text',
  'Push after reactivation',
  null
);
reset role;

set local role service_role;
create temporary table claimed_message_jobs as
select * from public.claim_message_notification_jobs(500);
select is(
  (select count(*) from claimed_message_jobs),
  2::bigint,
  'the notification worker atomically claims all due jobs once'
);
select is(
  (select count(*) from public.claim_message_notification_jobs(500)),
  0::bigint,
  'a concurrent worker cannot claim active leases again'
);
select ok(
  public.complete_message_notification_job(
    (select id from claimed_message_jobs order by id limit 1),
    (select processing_token from claimed_message_jobs order by id limit 1),
    'expo-ticket-test-1'
  )
  and public.fail_message_notification_job(
    (select id from claimed_message_jobs order by id desc limit 1),
    (select processing_token from claimed_message_jobs order by id desc limit 1),
    'DeviceNotRegistered',
    null
  ),
  'only matching worker lease tokens can acknowledge or fail claimed jobs'
);
select ok(
  public.complete_message_notification_receipt(
    (select id from claimed_message_jobs order by id limit 1),
    'expo-ticket-test-1',
    true,
    ''
  ),
  'a matching Expo receipt can finalize a ticketed delivery'
);
select ok(
  (select count(*) from public.message_notification_outbox where status = 'delivered') = 1
  and (select count(*) from public.message_notification_outbox where status = 'failed') = 1,
  'a matching Expo receipt finalizes ticketed delivery without exposing the outbox to clients'
);
reset role;

delete from auth.users where id = '14000000-0000-0000-0000-000000000002';
select ok(
  not exists (
    select 1 from public.push_installations
    where user_id = '14000000-0000-0000-0000-000000000002'
  ),
  'account deletion removes every installation for the deleted user'
);

select * from finish();
rollback;
