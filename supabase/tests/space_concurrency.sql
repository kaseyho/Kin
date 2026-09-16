create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  ('12000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@concurrency.test', extensions.crypt('password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('12000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'first@concurrency.test', extensions.crypt('password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('12000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'second@concurrency.test', extensions.crypt('password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

insert into public.profiles (id, display_name)
values
  ('12000000-0000-0000-0000-000000000001', 'Owner'),
  ('12000000-0000-0000-0000-000000000002', 'First contender'),
  ('12000000-0000-0000-0000-000000000003', 'Second contender');

create table public.space_concurrency_test_state (
  label text primary key,
  value text not null
);
revoke all on public.space_concurrency_test_state from public, anon, authenticated, service_role;
grant select, insert on public.space_concurrency_test_state to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);

insert into public.space_concurrency_test_state (label, value)
select 'space_id', public.create_kin_space('Contender', null)::text;

reset role;
revoke all on public.space_concurrency_test_state from authenticated;
insert into public.space_concurrency_test_state (label, value)
select 'invite_code', code
from public.space_invites
where space_id = (
  select value::uuid from public.space_concurrency_test_state where label = 'space_id'
)
  and revoked_at is null;

commit;

select plan(3);

create temporary table concurrency_results (
  label text primary key,
  value text not null
);

do $$
declare
  invite_code text := (
    select value from public.space_concurrency_test_state where label = 'invite_code'
  );
  result_value text;
begin
  perform extensions.dblink_connect(
    'kin_first_redeemer',
    'host=supabase_db_Kin port=5432 dbname=postgres user=postgres password=postgres'
  );
  perform extensions.dblink_connect(
    'kin_second_redeemer',
    'host=supabase_db_Kin port=5432 dbname=postgres user=postgres password=postgres'
  );

  perform extensions.dblink_exec('kin_first_redeemer', 'set role authenticated');
  perform result
  from extensions.dblink(
    'kin_first_redeemer',
    'select set_config(''request.jwt.claim.sub'', ''12000000-0000-0000-0000-000000000002'', false)'
  ) as configured(result text);

  perform extensions.dblink_exec('kin_second_redeemer', 'set role authenticated');
  perform result
  from extensions.dblink(
    'kin_second_redeemer',
    'select set_config(''request.jwt.claim.sub'', ''12000000-0000-0000-0000-000000000003'', false)'
  ) as configured(result text);

  perform extensions.dblink_send_query(
    'kin_first_redeemer',
    format(
      'with redeemed as materialized (select public.redeem_space_invite(%L) as id) select id::text from redeemed, lateral (select pg_sleep(1) where redeemed.id is not null) pause',
      invite_code
    )
  );
  perform pg_sleep(0.25);
  perform extensions.dblink_send_query(
    'kin_second_redeemer',
    format('select public.redeem_space_invite(%L)::text', invite_code)
  );

  for result_value in
    select result
    from extensions.dblink_get_result('kin_first_redeemer') as first_result(result text)
  loop
    insert into concurrency_results (label, value) values ('first_result', result_value);
  end loop;

  perform result
  from extensions.dblink_get_result('kin_second_redeemer', false) as second_result(result text);
  insert into concurrency_results (label, value)
  values ('second_error', extensions.dblink_error_message('kin_second_redeemer'));

  perform extensions.dblink_disconnect('kin_first_redeemer');
  perform extensions.dblink_disconnect('kin_second_redeemer');
end;
$$;

select ok(
  (select value from concurrency_results where label = 'second_error') like '%KIN_INVITE_USED%',
  'concurrent redemption gives the losing caller an invitation-used result'
);

select is(
  (
    select count(*)
    from public.kin_space_members
    where space_id = (
      select value::uuid from public.space_concurrency_test_state where label = 'space_id'
    )
      and left_at is null
  ),
  2::bigint,
  'concurrent redemption cannot exceed two active members'
);

select ok(
  exists (
    select 1
    from public.space_invites
    where space_id = (
      select value::uuid from public.space_concurrency_test_state where label = 'space_id'
    )
      and use_count = 1
      and redeemed_by = '12000000-0000-0000-0000-000000000002'
  ),
  'the invitation records exactly the serialized winning redeemer'
);

select * from finish();

delete from public.kin_spaces
where id = (
  select value::uuid from public.space_concurrency_test_state where label = 'space_id'
);
delete from auth.users
where id in (
  '12000000-0000-0000-0000-000000000001',
  '12000000-0000-0000-0000-000000000002',
  '12000000-0000-0000-0000-000000000003'
);
drop table public.space_concurrency_test_state;
