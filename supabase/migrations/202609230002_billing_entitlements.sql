create table public.billing_entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement_id text not null,
  is_active boolean not null default false,
  expires_at timestamptz,
  product_id text,
  store text not null,
  environment text not null,
  last_event_id text not null,
  last_event_created_at timestamptz not null,
  synced_at timestamptz not null default now(),
  primary key (user_id, entitlement_id),
  check (entitlement_id = 'kin_plus'),
  check (product_id is null or length(product_id) between 1 and 255),
  check (store in (
    'amazon', 'app_store', 'mac_app_store', 'paddle', 'play_store',
    'promotional', 'rc_billing', 'roku', 'stripe', 'test_store', 'unknown'
  )),
  check (environment in ('production', 'sandbox')),
  check (length(last_event_id) between 1 and 255)
);

create table public.revenuecat_webhook_events (
  event_id text primary key,
  event_type text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  environment text not null,
  provider_created_at timestamptz not null,
  processed_at timestamptz not null default now(),
  check (length(event_id) between 1 and 255),
  check (event_type ~ '^[A-Z][A-Z0-9_]{1,79}$'),
  check (environment in ('production', 'sandbox'))
);

create index billing_entitlements_active_user_idx
on public.billing_entitlements (user_id, entitlement_id, expires_at)
where is_active;

create index revenuecat_webhook_events_processed_idx
on public.revenuecat_webhook_events (processed_at desc);

alter table public.billing_entitlements enable row level security;
alter table public.revenuecat_webhook_events enable row level security;

revoke all on public.billing_entitlements from public, anon, authenticated;
revoke all on public.revenuecat_webhook_events from public, anon, authenticated;
grant select, insert, update, delete on public.billing_entitlements to service_role;
grant select, insert, update, delete on public.revenuecat_webhook_events to service_role;

create or replace function public.sync_revenuecat_entitlement(
  target_event_id text,
  target_event_type text,
  target_user_id uuid,
  target_entitlement_id text,
  target_is_active boolean,
  target_expires_at timestamptz,
  target_product_id text,
  target_store text,
  target_environment text,
  target_event_created_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  normalized_event_id text := trim(coalesce(target_event_id, ''));
  normalized_event_type text := upper(trim(coalesce(target_event_type, '')));
  normalized_entitlement_id text := trim(coalesce(target_entitlement_id, ''));
  normalized_product_id text := nullif(trim(coalesce(target_product_id, '')), '');
  normalized_store text := lower(trim(coalesce(target_store, '')));
  normalized_environment text := lower(trim(coalesce(target_environment, '')));
  inserted_event_id text;
begin
  if normalized_event_id !~ '^[A-Za-z0-9_:-]{1,255}$'
    or normalized_event_type !~ '^[A-Z][A-Z0-9_]{1,79}$'
    or target_user_id is null
    or normalized_entitlement_id <> 'kin_plus'
    or target_is_active is null
    or target_event_created_at is null
    or (normalized_product_id is not null and length(normalized_product_id) > 255)
    or normalized_store not in (
      'amazon', 'app_store', 'mac_app_store', 'paddle', 'play_store',
      'promotional', 'rc_billing', 'roku', 'stripe', 'test_store', 'unknown'
    )
    or normalized_environment not in ('production', 'sandbox')
    or not exists (select 1 from auth.users where id = target_user_id)
  then
    raise exception 'KIN_REVENUECAT_EVENT_INVALID' using errcode = '22023';
  end if;

  insert into public.revenuecat_webhook_events (
    event_id,
    event_type,
    user_id,
    environment,
    provider_created_at
  )
  values (
    normalized_event_id,
    normalized_event_type,
    target_user_id,
    normalized_environment,
    target_event_created_at
  )
  on conflict (event_id) do nothing
  returning event_id into inserted_event_id;

  if inserted_event_id is null then
    return false;
  end if;

  insert into public.billing_entitlements (
    user_id,
    entitlement_id,
    is_active,
    expires_at,
    product_id,
    store,
    environment,
    last_event_id,
    last_event_created_at,
    synced_at
  )
  values (
    target_user_id,
    normalized_entitlement_id,
    target_is_active,
    target_expires_at,
    normalized_product_id,
    normalized_store,
    normalized_environment,
    normalized_event_id,
    target_event_created_at,
    now()
  )
  on conflict (user_id, entitlement_id) do update
  set is_active = excluded.is_active,
      expires_at = excluded.expires_at,
      product_id = excluded.product_id,
      store = excluded.store,
      environment = excluded.environment,
      last_event_id = excluded.last_event_id,
      last_event_created_at = excluded.last_event_created_at,
      synced_at = now();

  return true;
end;
$$;

revoke all on function public.sync_revenuecat_entitlement(
  text, text, uuid, text, boolean, timestamptz, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.sync_revenuecat_entitlement(
  text, text, uuid, text, boolean, timestamptz, text, text, text, timestamptz
) to service_role;

create or replace function public.has_active_kin_plus(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.billing_entitlements
    where user_id = target_user_id
      and entitlement_id = 'kin_plus'
      and is_active
      and (expires_at is null or expires_at > now())
  );
$$;

revoke all on function public.has_active_kin_plus(uuid)
from public, anon, authenticated, service_role;

create or replace function public.create_memory_item(
  client_memory_id uuid,
  target_space_id uuid,
  memory_kind text,
  memory_visibility text,
  memory_title text,
  memory_occurred_on date,
  memory_note text,
  memory_place text,
  source_message_ids uuid[],
  memory_media_uris text[]
)
returns public.memory_items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  normalized_kind text := lower(trim(coalesce(memory_kind, '')));
  normalized_visibility text := lower(trim(coalesce(memory_visibility, '')));
  normalized_title text := trim(coalesce(memory_title, ''));
  normalized_note text := trim(coalesce(memory_note, ''));
  normalized_place text := nullif(trim(coalesce(memory_place, '')), '');
  normalized_source_ids uuid[];
  normalized_media_uris text[] := coalesce(memory_media_uris, '{}'::text[]);
  existing_source_ids uuid[];
  existing_memory public.memory_items%rowtype;
  created_memory public.memory_items%rowtype;
  owned_memory_count integer;
begin
  select coalesce(array_agg(distinct source_id order by source_id), '{}'::uuid[])
  into normalized_source_ids
  from unnest(coalesce(source_message_ids, '{}'::uuid[])) source_id;

  if actor_id is null then
    raise exception 'KIN_AUTH_REQUIRED' using errcode = '28000';
  end if;

  if client_memory_id is null
    or target_space_id is null
    or normalized_kind not in ('moment', 'important_date', 'plan')
    or normalized_visibility not in ('private', 'shared')
    or length(normalized_title) not between 1 and 160
    or memory_occurred_on is null
    or length(normalized_note) > 10000
    or (normalized_place is not null and length(normalized_place) > 160)
    or cardinality(normalized_source_ids) > 50
    or cardinality(normalized_media_uris) > 10
    or exists (
      select 1
      from unnest(normalized_media_uris) as media(uri)
      where uri is null or length(trim(uri)) not between 1 and 2048
    )
  then
    raise exception 'KIN_MEMORY_INVALID' using errcode = '22023';
  end if;

  perform 1
  from public.kin_space_members
  where space_id = target_space_id
    and user_id = actor_id
    and left_at is null
  for update;

  if not found then
    raise exception 'KIN_SPACE_UNAVAILABLE' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from unnest(normalized_source_ids) as requested(message_id)
    left join public.messages
      on messages.id = requested.message_id
      and messages.space_id = target_space_id
    where messages.id is null
  ) then
    raise exception 'KIN_MEMORY_INVALID' using errcode = '22023';
  end if;

  select * into existing_memory
  from public.memory_items
  where id = client_memory_id;

  if found then
    select coalesce(array_agg(message_id order by message_id), '{}'::uuid[])
    into existing_source_ids
    from public.memory_item_messages
    where memory_id = client_memory_id;

    if existing_memory.space_id = target_space_id
      and existing_memory.created_by = actor_id
      and existing_memory.kind = normalized_kind
      and existing_memory.visibility = normalized_visibility
      and existing_memory.title = normalized_title
      and existing_memory.occurred_on = memory_occurred_on
      and existing_memory.note = normalized_note
      and existing_memory.place is not distinct from normalized_place
      and existing_memory.media_uris = normalized_media_uris
      and existing_source_ids = normalized_source_ids
    then
      return existing_memory;
    end if;

    raise exception 'KIN_MEMORY_IDEMPOTENCY_CONFLICT' using errcode = '23505';
  end if;

  if not public.has_active_kin_plus(actor_id) then
    select count(*) into owned_memory_count
    from public.memory_items
    where space_id = target_space_id
      and created_by = actor_id;

    if owned_memory_count >= 5 then
      raise exception 'KIN_MEMORY_LIMIT_REACHED' using errcode = 'P0001';
    end if;
  end if;

  insert into public.memory_items (
    id,
    space_id,
    created_by,
    kind,
    visibility,
    title,
    occurred_on,
    note,
    place,
    media_uris
  )
  values (
    client_memory_id,
    target_space_id,
    actor_id,
    normalized_kind,
    normalized_visibility,
    normalized_title,
    memory_occurred_on,
    normalized_note,
    normalized_place,
    normalized_media_uris
  )
  returning * into created_memory;

  insert into public.memory_item_messages (memory_id, message_id)
  select client_memory_id, message_id
  from unnest(normalized_source_ids) as source(message_id);

  return created_memory;
end;
$$;

drop policy if exists memories_insert_creator on public.memory_items;
drop policy if exists memory_messages_insert_creator on public.memory_item_messages;

revoke insert on public.memory_items from authenticated;
revoke insert on public.memory_item_messages from authenticated;

revoke all on function public.create_memory_item(
  uuid, uuid, text, text, text, date, text, text, uuid[], text[]
) from public, anon, authenticated, service_role;
grant execute on function public.create_memory_item(
  uuid, uuid, text, text, text, date, text, text, uuid[], text[]
) to authenticated;
