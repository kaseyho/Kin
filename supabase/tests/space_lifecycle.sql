begin;

create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  ('11000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@space.test', extensions.crypt('password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('11000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'partner@space.test', extensions.crypt('password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('11000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stranger@space.test', extensions.crypt('password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('11000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'leaver@space.test', extensions.crypt('password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('11000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'remaining@space.test', extensions.crypt('password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

insert into public.profiles (id, display_name)
values
  ('11000000-0000-0000-0000-000000000001', 'Owner'),
  ('11000000-0000-0000-0000-000000000002', 'Partner'),
  ('11000000-0000-0000-0000-000000000003', 'Stranger'),
  ('11000000-0000-0000-0000-000000000004', 'Leaver'),
  ('11000000-0000-0000-0000-000000000005', 'Remaining member');

create temporary table space_test_state (
  label text primary key,
  value text not null
);

grant select, insert, update, delete on table space_test_state to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);

insert into space_test_state (label, value)
select 'primary_space', public.create_kin_space('Partner', '2025-12-05')::text;

insert into space_test_state (label, value)
select 'primary_invite', invite.code
from public.space_invites invite
where invite.space_id = (select value::uuid from space_test_state where label = 'primary_space')
  and invite.revoked_at is null
  and invite.use_count < invite.max_uses;

do $$
declare
  target_space uuid := (select value::uuid from space_test_state where label = 'primary_space');
begin
  if (select count(*) from public.kin_spaces where id = target_space) <> 1 then
    raise exception 'Space lifecycle failed: atomic create did not create the Space';
  end if;
  if (select count(*) from public.kin_space_members where space_id = target_space and left_at is null) <> 1 then
    raise exception 'Space lifecycle failed: atomic create did not create one active owner';
  end if;
  if (select count(*) from public.space_themes where space_id = target_space) <> 1 then
    raise exception 'Space lifecycle failed: atomic create did not create owner preferences';
  end if;
  if (select count(*) from public.space_invites where space_id = target_space and revoked_at is null) <> 1 then
    raise exception 'Space lifecycle failed: atomic create did not create one active invitation';
  end if;
end;
$$;
select pass('atomic Space creation creates the owner, preferences, and one invitation');

do $$
declare
  target_space uuid := (select value::uuid from space_test_state where label = 'primary_space');
begin
  if not exists (
    select 1 from public.kin_spaces
    where id = target_space
      and created_by = auth.uid()
  ) or not exists (
    select 1 from public.kin_space_members
    where space_id = target_space
      and user_id = auth.uid()
      and role = 'owner'
      and left_at is null
  ) then
    raise exception 'Space lifecycle failed: the authenticated actor was not derived as owner';
  end if;
end;
$$;
select pass('Space creation derives the owner from auth.uid()');

select throws_ok(
  format('select public.redeem_space_invite(%L)', value),
  'P0001',
  'KIN_INVITE_SELF',
  'an invitation creator cannot redeem their own invitation'
)
from space_test_state
where label = 'primary_invite';

select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000002', true);
select public.redeem_space_invite((select value from space_test_state where label = 'primary_invite'));

do $$
declare
  target_space uuid := (select value::uuid from space_test_state where label = 'primary_space');
begin
  if (select count(*) from public.kin_space_members where space_id = target_space and left_at is null) <> 2 then
    raise exception 'Space lifecycle failed: invite redemption did not create exactly two active members';
  end if;
end;
$$;
select pass('invitation redemption creates exactly two active members');

select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000003', true);
select throws_ok(
  format('select public.redeem_space_invite(%L)', value),
  'P0001',
  'KIN_INVITE_USED',
  'an invitation cannot be redeemed twice'
)
from space_test_state
where label = 'primary_invite';

reset role;

do $$
begin
  begin
    insert into public.kin_space_members (space_id, user_id, role)
    values (
      (select value::uuid from space_test_state where label = 'primary_space'),
      '11000000-0000-0000-0000-000000000003',
      'member'
    );
    raise exception 'Space lifecycle failed: a direct write added a third active member';
  exception
    when check_violation then
      if sqlerrm <> 'KIN_SPACE_FULL' then
        raise;
      end if;
  end;
end;
$$;
select pass('the database rejects a third active member');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select throws_ok(
  format(
    'select public.rotate_space_invite(%L::uuid)',
    (select value from space_test_state where label = 'primary_space')
  ),
  'P0001',
  'KIN_SPACE_FULL',
  'a full Space cannot create another invitation'
);

insert into space_test_state (label, value)
select 'expired_space', public.create_kin_space('Expired partner', null)::text;

insert into space_test_state (label, value)
select 'expired_invite', invite.code
from public.space_invites invite
where invite.space_id = (select value::uuid from space_test_state where label = 'expired_space')
  and invite.revoked_at is null;

reset role;
update public.space_invites
set expires_at = now() - interval '1 minute'
where code = (select value from space_test_state where label = 'expired_invite');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000002', true);
select throws_ok(
  format('select public.redeem_space_invite(%L)', value),
  'P0001',
  'KIN_INVITE_EXPIRED',
  'an expired invitation cannot be redeemed'
)
from space_test_state
where label = 'expired_invite';

select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
insert into space_test_state (label, value)
select 'revoked_space', public.create_kin_space('Revoked partner', null)::text;

insert into space_test_state (label, value)
select 'revoked_invite', invite.code
from public.space_invites invite
where invite.space_id = (select value::uuid from space_test_state where label = 'revoked_space')
  and invite.revoked_at is null;

select public.revoke_space_invite(
  (select value::uuid from space_test_state where label = 'revoked_space')
);

select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000002', true);
select throws_ok(
  format('select public.redeem_space_invite(%L)', value),
  'P0001',
  'KIN_INVITE_REVOKED',
  'a revoked invitation cannot be redeemed'
)
from space_test_state
where label = 'revoked_invite';

select public.send_kin_message(
  '31000000-0000-0000-0000-000000000001',
  (select value::uuid from space_test_state where label = 'primary_space'),
  'text',
  'Report fixture message',
  null
);

select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select throws_ok(
  format(
    'select public.submit_content_report(%L::uuid, %L::uuid, %L, %L)',
    (select value from space_test_state where label = 'primary_space'),
    '31000000-0000-0000-0000-000000000001',
    'provider-specific-value',
    ''
  ),
  '22023',
  'KIN_REPORT_CATEGORY_INVALID',
  'content reports reject unsupported categories'
);

insert into space_test_state (label, value)
select 'report_id', public.submit_content_report(
  (select value::uuid from space_test_state where label = 'primary_space'),
  '31000000-0000-0000-0000-000000000001',
  'harassment',
  'Please review this message.'
)->>'id';

do $$
begin
  if not exists (
    select 1 from public.content_reports
    where id = (select value::uuid from space_test_state where label = 'report_id')
      and reporter_id = auth.uid()
      and reported_user_id = '11000000-0000-0000-0000-000000000002'
      and message_id = '31000000-0000-0000-0000-000000000001'
      and category = 'harassment'
      and explanation = 'Please review this message.'
      and status = 'open'
  ) then
    raise exception 'Space lifecycle failed: report identities were not derived on the server';
  end if;
end;
$$;
select pass('content reports derive reporter and target identities on the server');

select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000002', true);
select is(
  (select count(*) from public.content_reports),
  0::bigint,
  'the reported member cannot read another person report'
);

select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000003', true);
do $$
begin
  if (select count(*) from public.profiles) <> 1
    or (select count(*) from public.kin_spaces) <> 0
    or (select count(*) from public.kin_space_members) <> 0
    or (select count(*) from public.space_themes) <> 0
    or (select count(*) from public.space_invites) <> 0
    or (select count(*) from public.messages) <> 0
    or (select count(*) from public.memory_items) <> 0
    or (select count(*) from public.content_reports) <> 0 then
    raise exception 'Space lifecycle failed: a stranger could read relationship data';
  end if;
end;
$$;
select pass('a stranger can read only their own profile and no relationship data');

reset role;
select ok(
  has_function_privilege('authenticated', 'public.create_kin_space(text,date)', 'execute')
  and has_function_privilege('authenticated', 'public.redeem_space_invite(text)', 'execute')
  and has_function_privilege('authenticated', 'public.rotate_space_invite(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.revoke_space_invite(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.leave_kin_space(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.block_kin_space_member(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.submit_content_report(uuid,uuid,text,text)', 'execute')
  and not has_function_privilege('anon', 'public.create_kin_space(text,date)', 'execute')
  and not has_function_privilege('anon', 'public.redeem_space_invite(text)', 'execute')
  and not has_function_privilege('anon', 'public.rotate_space_invite(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.revoke_space_invite(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.leave_kin_space(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.block_kin_space_member(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.submit_content_report(uuid,uuid,text,text)', 'execute'),
  'only authenticated clients can execute Space lifecycle functions'
);

select ok(
  not has_table_privilege('authenticated', 'public.kin_spaces', 'insert')
  and not has_table_privilege('authenticated', 'public.kin_spaces', 'delete')
  and not has_table_privilege('authenticated', 'public.kin_space_members', 'insert')
  and not has_table_privilege('authenticated', 'public.kin_space_members', 'delete')
  and not has_table_privilege('authenticated', 'public.space_invites', 'insert')
  and not has_table_privilege('authenticated', 'public.space_invites', 'update')
  and not has_table_privilege('authenticated', 'public.space_invites', 'delete')
  and not has_table_privilege('authenticated', 'public.user_blocks', 'insert')
  and not has_table_privilege('authenticated', 'public.content_reports', 'insert'),
  'authenticated clients cannot bypass lifecycle functions with direct writes'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);

insert into space_test_state (label, value)
select 'secondary_space', public.create_kin_space('Partner again', null)::text;

insert into space_test_state (label, value)
select 'secondary_invite', invite.code
from public.space_invites invite
where invite.space_id = (select value::uuid from space_test_state where label = 'secondary_space')
  and invite.revoked_at is null;

select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000002', true);
select public.redeem_space_invite((select value from space_test_state where label = 'secondary_invite'));

select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select public.block_kin_space_member((select value::uuid from space_test_state where label = 'primary_space'));

do $$
begin
  if exists (
    select 1 from public.kin_space_members
    where space_id = (select value::uuid from space_test_state where label = 'primary_space')
      and user_id = auth.uid()
      and left_at is null
  ) then
    raise exception 'Space lifecycle failed: blocking user retained active membership';
  end if;
end;
$$;
select pass('blocking ends the blocker active membership');

reset role;
do $$
begin
  if exists (
    select 1
    from public.kin_space_members mine
    join public.kin_space_members theirs on theirs.space_id = mine.space_id
    where mine.user_id = '11000000-0000-0000-0000-000000000001'
      and mine.left_at is null
      and theirs.user_id = '11000000-0000-0000-0000-000000000002'
      and theirs.left_at is null
  ) then
    raise exception 'Space lifecycle failed: blocked users retained another active shared Space';
  end if;
end;
$$;
select pass('blocking ends every active Space shared by the blocked pair');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000002', true);
insert into space_test_state (label, value)
select 'blocked_pair_space', public.create_kin_space('Owner', null)::text;
insert into space_test_state (label, value)
select 'blocked_pair_invite', invite.code
from public.space_invites invite
where invite.space_id = (select value::uuid from space_test_state where label = 'blocked_pair_space')
  and invite.revoked_at is null;

select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);

do $$
begin
  begin
    perform public.redeem_space_invite((select value from space_test_state where label = 'blocked_pair_invite'));
    raise exception 'Space lifecycle failed: blocked users reconnected';
  exception
    when raise_exception then
      if sqlerrm <> 'KIN_INVITE_BLOCKED' then
        raise;
      end if;
  end;
end;
$$;
select pass('a blocked pair cannot reconnect through another Space invitation');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000004', true);

insert into space_test_state (label, value)
select 'leave_space', public.create_kin_space('Remaining member', null)::text;

insert into space_test_state (label, value)
select 'leave_invite', invite.code
from public.space_invites invite
where invite.space_id = (select value::uuid from space_test_state where label = 'leave_space')
  and invite.revoked_at is null;

select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000005', true);
select public.redeem_space_invite((select value from space_test_state where label = 'leave_invite'));

select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000004', true);
select public.send_kin_message(
  '31000000-0000-0000-0000-000000000002',
  (select value::uuid from space_test_state where label = 'leave_space'),
  'text',
  'Shared history remains available',
  null
);
select public.create_memory_item(
  '41000000-0000-0000-0000-000000000001',
  (select value::uuid from space_test_state where label = 'leave_space'),
  'moment',
  'shared',
  'Shared memory',
  current_date,
  '',
  null,
  '{}'::uuid[],
  '{}'::text[]
);
select public.create_memory_item(
  '41000000-0000-0000-0000-000000000002',
  (select value::uuid from space_test_state where label = 'leave_space'),
  'moment',
  'private',
  'Leaver private memory',
  current_date,
  '',
  null,
  '{}'::uuid[],
  '{}'::text[]
);

reset role;
insert into public.space_invites (space_id, created_by, code)
values (
  (select value::uuid from space_test_state where label = 'leave_space'),
  '11000000-0000-0000-0000-000000000004',
  'LEAVE123'
);
insert into storage.objects (bucket_id, name, owner_id)
values (
  'chat-media',
  format(
    '%s/%s/leave-proof.jpg',
    (select value from space_test_state where label = 'leave_space'),
    '11000000-0000-0000-0000-000000000004'
  ),
  '11000000-0000-0000-0000-000000000004'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000004', true);
select public.leave_kin_space((select value::uuid from space_test_state where label = 'leave_space'));

do $$
begin
  if (select count(*) from public.kin_spaces where id = (select value::uuid from space_test_state where label = 'leave_space')) <> 0
    or (select count(*) from public.messages where space_id = (select value::uuid from space_test_state where label = 'leave_space')) <> 0
    or (select count(*) from public.memory_items where space_id = (select value::uuid from space_test_state where label = 'leave_space')) <> 0
    or (select count(*) from storage.objects where bucket_id = 'chat-media' and name like (select value from space_test_state where label = 'leave_space') || '/%') <> 0 then
    raise exception 'Space lifecycle failed: leaver retained a relationship or Storage read path';
  end if;
end;
$$;
select pass('leaving removes every relationship and Storage read path for the leaver');

select throws_ok(
  format(
    'insert into public.messages (space_id, sender_id, kind, body) values (%L::uuid, %L::uuid, %L, %L)',
    (select value from space_test_state where label = 'leave_space'),
    auth.uid(),
    'text',
    'This write must fail'
  ),
  '42501',
  null,
  'a leaver cannot write another message'
);

select throws_ok(
  format(
    'insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, %L)',
    'chat-media',
    (select value from space_test_state where label = 'leave_space') || '/11000000-0000-0000-0000-000000000004/after-leave.jpg',
    auth.uid()::text
  ),
  '42501',
  null,
  'a leaver cannot upload media after access loss'
);

select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000005', true);
do $$
begin
  if (select count(*) from public.kin_spaces where id = (select value::uuid from space_test_state where label = 'leave_space')) <> 1
    or (select count(*) from public.messages where space_id = (select value::uuid from space_test_state where label = 'leave_space')) <> 1
    or (select count(*) from public.memory_items where title = 'Shared memory') <> 1
    or (select count(*) from public.memory_items where title = 'Leaver private memory') <> 0
    or (select count(*) from storage.objects where bucket_id = 'chat-media' and name like (select value from space_test_state where label = 'leave_space') || '/%') <> 1 then
    raise exception 'Space lifecycle failed: remaining member content policy was not preserved';
  end if;
end;
$$;
select pass('the remaining member keeps shared history but cannot read the leaver private memory');

reset role;
select ok(
  exists (
    select 1 from public.space_invites
    where code = 'LEAVE123'
      and revoked_at is not null
  ),
  'leaving revokes unused invitations for the Space'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000003', true);
insert into space_test_state (label, value)
select 'last_member_space', public.create_kin_space('Absent partner', null)::text;

reset role;
insert into storage.objects (bucket_id, name, owner_id)
values (
  'chat-media',
  (select value from space_test_state where label = 'last_member_space') || '/11000000-0000-0000-0000-000000000003/final.jpg',
  '11000000-0000-0000-0000-000000000003'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000003', true);
select public.leave_kin_space((select value::uuid from space_test_state where label = 'last_member_space'));

reset role;
select ok(
  not exists (
    select 1 from public.kin_spaces
    where id = (select value::uuid from space_test_state where label = 'last_member_space')
  )
  and exists (
    select 1 from public.account_storage_cleanup_jobs
    where bucket_id = 'chat-media'
      and target_kind = 'object'
      and target_path = (select value from space_test_state where label = 'last_member_space') || '/11000000-0000-0000-0000-000000000003/final.jpg'
      and status = 'pending'
  ),
  'the last member leaving deletes the empty Space and durably queues its media'
);

reset role;
select * from finish();
rollback;
