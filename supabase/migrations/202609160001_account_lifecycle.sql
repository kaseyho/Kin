create or replace function public.prepare_account_deletion(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owned_space record;
  replacement_user_id uuid;
begin
  if target_user_id is null then
    raise exception 'Target user is required' using errcode = '22004';
  end if;

  for owned_space in
    select id from public.kin_spaces where created_by = target_user_id for update
  loop
    select user_id into replacement_user_id
    from public.kin_space_members
    where space_id = owned_space.id and user_id <> target_user_id
    order by joined_at asc
    limit 1;

    if replacement_user_id is null then
      delete from public.kin_spaces where id = owned_space.id;
    else
      update public.kin_spaces
      set created_by = replacement_user_id
      where id = owned_space.id;

      update public.kin_space_members
      set role = 'owner'
      where space_id = owned_space.id and user_id = replacement_user_id;
    end if;
  end loop;

  delete from public.space_invites where created_by = target_user_id;
end;
$$;

revoke all on function public.prepare_account_deletion(uuid) from public;
revoke all on function public.prepare_account_deletion(uuid) from anon;
revoke all on function public.prepare_account_deletion(uuid) from authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;
