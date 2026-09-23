insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  ('15000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sender@upgrade.test', extensions.crypt('password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('15000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'recipient@upgrade.test', extensions.crypt('password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

insert into public.profiles (id, display_name)
values
  ('15000000-0000-0000-0000-000000000001', 'Upgrade Sender'),
  ('15000000-0000-0000-0000-000000000002', 'Upgrade Recipient');

insert into public.kin_spaces (id, created_by)
values ('25000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001');

insert into public.kin_space_members (space_id, user_id, role, last_read_at)
values
  ('25000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001', 'owner', now()),
  ('25000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000002', 'member', now());

insert into public.push_installations (
  id, user_id, installation_id, expo_push_token, platform, active, last_seen_at
)
values
  ('45000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000002', 'upgrade-installation-0001', 'ExponentPushToken[upgrade-device-0001]', 'ios', true, now() - interval '1 minute'),
  ('45000000-0000-0000-0000-000000000002', '15000000-0000-0000-0000-000000000002', 'upgrade-installation-0002', 'ExponentPushToken[upgrade-device-0002]', 'android', true, now());

insert into public.messages (id, space_id, sender_id, kind, body)
values
  ('35000000-0000-0000-0000-000000000001', '25000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001', 'text', 'Pending before delivery upgrade'),
  ('35000000-0000-0000-0000-000000000002', '25000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001', 'text', 'Leased before delivery upgrade'),
  ('35000000-0000-0000-0000-000000000003', '25000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001', 'text', 'Stale before delivery upgrade');

insert into public.message_notification_outbox (
  id, message_id, space_id, recipient_id, status, attempts,
  processing_started_at, processing_token
)
values
  ('55000000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000001', '25000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000002', 'pending', 0, null, null),
  ('55000000-0000-0000-0000-000000000002', '35000000-0000-0000-0000-000000000002', '25000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000002', 'processing', 1, now() - interval '10 minutes', '65000000-0000-0000-0000-000000000001'),
  ('55000000-0000-0000-0000-000000000003', '35000000-0000-0000-0000-000000000003', '25000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000002', 'pending', 0, null, null);

update public.message_notification_outbox
set created_at = now() - interval '30 days',
    updated_at = now() - interval '30 days'
where id = '55000000-0000-0000-0000-000000000003';
