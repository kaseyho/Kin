insert into public.memory_items (
  id, space_id, created_by, kind, visibility, title, occurred_on, note, place, media_uris
)
values (
  '47000000-0000-0000-0000-000000000001',
  '25000000-0000-0000-0000-000000000001',
  '15000000-0000-0000-0000-000000000001',
  'moment',
  'private',
  'Memory before billing upgrade',
  date '2026-09-22',
  'Preserve this note',
  'Singapore',
  array['storage://chat-media/upgrade-memory.jpg']
);

insert into public.memory_item_messages (memory_id, message_id)
values (
  '47000000-0000-0000-0000-000000000001',
  '35000000-0000-0000-0000-000000000001'
);
