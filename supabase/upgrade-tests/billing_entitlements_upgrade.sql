begin;

create extension if not exists pgtap with schema extensions;
select plan(5);

select ok(
  exists (
    select 1 from public.memory_items
    where id = '47000000-0000-0000-0000-000000000001'
      and title = 'Memory before billing upgrade'
      and note = 'Preserve this note'
      and media_uris = array['storage://chat-media/upgrade-memory.jpg']
  ),
  'the forward migration preserves an existing memory payload'
);

select ok(
  exists (
    select 1 from public.memory_item_messages
    where memory_id = '47000000-0000-0000-0000-000000000001'
      and message_id = '35000000-0000-0000-0000-000000000001'
  ),
  'the forward migration preserves an existing source-message link'
);

select is(
  (select count(*) from public.billing_entitlements),
  0::bigint,
  'the migration does not backfill synthetic premium entitlements'
);

select ok(
  not has_table_privilege('authenticated', 'public.memory_items', 'insert')
  and has_table_privilege('authenticated', 'public.memory_items', 'update')
  and has_table_privilege('authenticated', 'public.memory_items', 'delete'),
  'the upgrade moves memory creation behind the RPC without removing edit/delete privileges'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.create_memory_item(uuid,uuid,text,text,text,date,text,text,uuid[],text[])',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.sync_revenuecat_entitlement(text,text,uuid,text,boolean,timestamp with time zone,text,text,text,timestamp with time zone)',
    'execute'
  ),
  'the forward migration exposes only the intended creation and projection contracts'
);

select * from finish();
rollback;
