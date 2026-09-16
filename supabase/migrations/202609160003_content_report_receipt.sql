drop function public.submit_content_report(uuid, uuid, text, text);

create function public.submit_content_report(
  target_space_id uuid,
  target_message_id uuid,
  report_category text,
  report_explanation text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_user_id uuid;
  report_id uuid;
  report_created_at timestamptz;
  normalized_explanation text := trim(coalesce(report_explanation, ''));
begin
  if actor_id is null then
    raise exception 'KIN_AUTH_REQUIRED' using errcode = '28000';
  end if;
  if not public.is_space_member(target_space_id, actor_id) then
    raise exception 'KIN_SPACE_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if report_category not in ('harassment', 'threats', 'hate', 'sexual_content', 'spam', 'other') then
    raise exception 'KIN_REPORT_CATEGORY_INVALID' using errcode = '22023';
  end if;
  if length(normalized_explanation) > 2000 then
    raise exception 'KIN_REPORT_EXPLANATION_TOO_LONG' using errcode = '22001';
  end if;

  if target_message_id is not null then
    select sender_id into target_user_id
    from public.messages
    where id = target_message_id and space_id = target_space_id;
  else
    select user_id into target_user_id
    from public.kin_space_members
    where space_id = target_space_id
      and user_id <> actor_id
      and left_at is null
    order by joined_at
    limit 1;
  end if;

  if target_user_id is null or target_user_id = actor_id then
    raise exception 'KIN_REPORT_TARGET_INVALID' using errcode = '22023';
  end if;

  insert into public.content_reports (
    reporter_id,
    reported_user_id,
    space_id,
    message_id,
    category,
    explanation
  ) values (
    actor_id,
    target_user_id,
    target_space_id,
    target_message_id,
    report_category,
    normalized_explanation
  ) returning id, created_at into report_id, report_created_at;

  return jsonb_build_object(
    'id', report_id,
    'created_at', report_created_at
  );
end;
$$;

revoke all on function public.submit_content_report(uuid, uuid, text, text)
from public, anon, authenticated, service_role;
grant execute on function public.submit_content_report(uuid, uuid, text, text) to authenticated;
