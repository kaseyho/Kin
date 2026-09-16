begin;

create extension if not exists pgtap with schema extensions;
select plan(2);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'maya@kin.test', extensions.crypt('password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'jamie@kin.test', extensions.crypt('password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

insert into public.profiles (id, display_name)
values
  ('10000000-0000-0000-0000-000000000001', 'Maya'),
  ('10000000-0000-0000-0000-000000000002', 'Jamie');

insert into public.kin_spaces (id, created_by)
values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001');

insert into public.kin_space_members (space_id, user_id, role)
values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'member'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'owner');

insert into public.messages (id, space_id, sender_id, kind, body)
values (
  '30000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  'text',
  'Only Maya can read this Space'
);

insert into public.memory_items (id, space_id, created_by, kind, visibility, title, occurred_on)
values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'moment', 'shared', 'Shared picnic', current_date),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'moment', 'private', 'Maya private note', current_date);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

do $$
begin
  if (select count(*) from public.kin_spaces) <> 2 then
    raise exception 'RLS failed: Maya must see both joined Spaces';
  end if;
  if (select count(*) from public.memory_items where visibility = 'shared') <> 1 then
    raise exception 'RLS failed: the creator must see the shared memory';
  end if;
  if (select count(*) from public.memory_items where visibility = 'private') <> 1 then
    raise exception 'RLS failed: the creator must see their private memory';
  end if;
end;
$$;
select pass('creator RLS exposes joined Spaces and creator-visible memories');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);

do $$
begin
  if (select count(*) from public.kin_spaces) <> 1 then
    raise exception 'RLS failed: Jamie must see only the shared Space';
  end if;
  if (select count(*) from public.messages) <> 0 then
    raise exception 'RLS failed: a nonmember read a message from another Space';
  end if;
  if (select count(*) from public.memory_items where visibility = 'shared') <> 1 then
    raise exception 'RLS failed: a member could not read a shared memory';
  end if;
  if (select count(*) from public.memory_items where visibility = 'private') <> 0 then
    raise exception 'RLS failed: a member read another creator private memory';
  end if;
end;
$$;

select pass('member RLS hides unrelated messages and another creator private memory');

reset role;
select * from finish();
rollback;
