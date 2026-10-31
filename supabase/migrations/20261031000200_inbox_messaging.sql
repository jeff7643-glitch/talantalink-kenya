create table public.message_user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.message_user_blocks enable row level security;

create policy "Members view their own message blocks"
  on public.message_user_blocks for select to authenticated
  using ((select auth.uid()) = blocker_id);
create policy "Members block users as themselves"
  on public.message_user_blocks for insert to authenticated
  with check ((select auth.uid()) = blocker_id);
create policy "Members unblock users as themselves"
  on public.message_user_blocks for delete to authenticated
  using ((select auth.uid()) = blocker_id);

grant select, insert, delete on public.message_user_blocks to authenticated;

create or replace function public.is_message_pair_blocked(user_a uuid, user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.message_user_blocks b
    where (b.blocker_id = user_a and b.blocked_id = user_b)
       or (b.blocker_id = user_b and b.blocked_id = user_a)
  );
$$;

revoke all on function public.is_message_pair_blocked(uuid, uuid) from public, anon;
grant execute on function public.is_message_pair_blocked(uuid, uuid) to authenticated;

create or replace function public.is_message_user_blocked(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is null
    or target_user_id is null
    or target_user_id = auth.uid()
    or public.is_message_pair_blocked(auth.uid(), target_user_id);
$$;

revoke all on function public.is_message_user_blocked(uuid) from public, anon;
grant execute on function public.is_message_user_blocked(uuid) to authenticated;

create table public.message_attachments (
  message_id uuid primary key references public.messages (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (
    char_length(file_name) between 1 and 255
    and file_name !~ '[[:cntrl:]]'
  ),
  mime_type text not null check (mime_type in (
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  file_size bigint not null check (file_size between 1 and 10485760),
  created_at timestamptz not null default now(),
  check (
    storage_path like uploaded_by::text || '/%'
    and storage_path !~ '/.+/'
    and storage_path ~ ('^' || uploaded_by::text || '/[0-9a-f-]{36}\.(jpg|png|webp|pdf|doc|docx)$')
  ),
  check (
    (mime_type = 'image/jpeg' and storage_path ~ '\.jpg$')
    or (mime_type = 'image/png' and storage_path ~ '\.png$')
    or (mime_type = 'image/webp' and storage_path ~ '\.webp$')
    or (mime_type = 'application/pdf' and storage_path ~ '\.pdf$')
    or (mime_type = 'application/msword' and storage_path ~ '\.doc$')
    or (
      mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      and storage_path ~ '\.docx$'
    )
  )
);

alter table public.message_attachments enable row level security;

create policy "Message participants view shared attachments"
  on public.message_attachments for select to authenticated
  using (
    exists (
      select 1
      from public.messages m
      where m.id = message_id
        and (select auth.uid()) in (m.sender_id, m.recipient_id)
        and not public.is_message_pair_blocked(m.sender_id, m.recipient_id)
    )
  );

grant select on public.message_attachments to authenticated;

create table public.message_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  message_id uuid not null unique references public.messages (id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index message_notifications_unread
  on public.message_notifications (recipient_id, created_at desc)
  where read_at is null;

alter table public.message_notifications enable row level security;

create policy "Members view their own message notifications"
  on public.message_notifications for select to authenticated
  using ((select auth.uid()) = recipient_id);

grant select on public.message_notifications to authenticated;

create or replace function public.create_message_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.message_notifications (recipient_id, message_id)
  values (new.recipient_id, new.id);
  return new;
end;
$$;

create trigger create_message_notification
  after insert on public.messages
  for each row execute procedure public.create_message_notification();

drop policy if exists "Message participants can read messages" on public.messages;
create policy "Unblocked message participants can read messages"
  on public.messages for select to authenticated
  using (
    (select auth.uid()) in (sender_id, recipient_id)
    and not public.is_message_pair_blocked(sender_id, recipient_id)
  );

drop policy if exists "Users send messages as themselves" on public.messages;
drop policy if exists "Connected members can send messages" on public.messages;
revoke insert on public.messages from authenticated;

revoke update on public.messages from authenticated;
grant update (read_at) on public.messages to authenticated;

create or replace function public.protect_message_content()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sender_id is distinct from old.sender_id
    or new.recipient_id is distinct from old.recipient_id
    or new.content is distinct from old.content
    or new.created_at is distinct from old.created_at then
    raise exception 'Sent messages cannot be changed';
  end if;

  if new.read_at is distinct from old.read_at then
    if old.read_at is not null
      or new.read_at is null
      or (select auth.uid()) is distinct from old.recipient_id then
      raise exception 'Only message recipients can mark messages as read';
    end if;
    new.read_at := now();
  end if;

  return new;
end;
$$;

drop policy if exists "Recipients can mark messages read" on public.messages;
create policy "Recipients mark their messages read"
  on public.messages for update to authenticated
  using (
    (select auth.uid()) = recipient_id
    and not public.is_message_pair_blocked(sender_id, recipient_id)
  )
  with check (
    (select auth.uid()) = recipient_id
    and not public.is_message_pair_blocked(sender_id, recipient_id)
  );

create or replace function public.send_message(
  p_recipient_id uuid,
  p_content text,
  p_attachment_path text default null,
  p_attachment_name text default null,
  p_attachment_type text default null,
  p_attachment_size bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sender uuid := auth.uid();
  new_message_id uuid;
begin
  if sender is null then
    raise exception 'Sign in to send messages';
  end if;

  if p_recipient_id is null or p_recipient_id = sender then
    raise exception 'Choose another member to message';
  end if;

  if p_content is null or char_length(p_content) > 5000
    or (char_length(btrim(p_content)) = 0 and p_attachment_path is null) then
    raise exception 'Message text must be between 1 and 5000 characters';
  end if;

  if public.is_message_pair_blocked(sender, p_recipient_id) then
    raise exception 'Messaging is unavailable for this member';
  end if;

  if not exists (
    select 1
    from public.connections c
    where c.status = 'accepted'
      and (
        (c.requester_id = sender and c.receiver_id = p_recipient_id)
        or (c.requester_id = p_recipient_id and c.receiver_id = sender)
      )
  ) then
    raise exception 'An accepted connection is required to send a message';
  end if;

  if (p_attachment_path is null) <> (p_attachment_name is null)
    or (p_attachment_path is null) <> (p_attachment_type is null)
    or (p_attachment_path is null) <> (p_attachment_size is null) then
    raise exception 'Attachment details are incomplete';
  end if;

  if p_attachment_path is not null then
    if p_attachment_path !~ ('^' || sender::text || '/[0-9a-f-]{36}\.(jpg|png|webp|pdf|doc|docx)$')
      or p_attachment_name !~ '^[^[:cntrl:]]{1,255}$'
      or p_attachment_size not between 1 and 10485760
      or p_attachment_type not in (
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      )
      or not exists (
        select 1 from storage.objects o
        where o.bucket_id = 'talantalink-inbox-files'
          and o.name = p_attachment_path
      ) then
      raise exception 'Attachment is invalid or unavailable';
    end if;

    if not (
      (p_attachment_type = 'image/jpeg' and p_attachment_path ~ '\.jpg$')
      or (p_attachment_type = 'image/png' and p_attachment_path ~ '\.png$')
      or (p_attachment_type = 'image/webp' and p_attachment_path ~ '\.webp$')
      or (p_attachment_type = 'application/pdf' and p_attachment_path ~ '\.pdf$')
      or (p_attachment_type = 'application/msword' and p_attachment_path ~ '\.doc$')
      or (
        p_attachment_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        and p_attachment_path ~ '\.docx$'
      )
    ) then
      raise exception 'Attachment type does not match its file extension';
    end if;
  end if;

  insert into public.messages (sender_id, recipient_id, content)
  values (sender, p_recipient_id, p_content)
  returning id into new_message_id;

  if p_attachment_path is not null then
    insert into public.message_attachments (
      message_id, uploaded_by, storage_path, file_name, mime_type, file_size
    )
    values (
      new_message_id, sender, p_attachment_path, p_attachment_name, p_attachment_type, p_attachment_size
    );
  end if;

  return new_message_id;
end;
$$;

revoke all on function public.send_message(uuid, text, text, text, text, bigint) from public, anon;
grant execute on function public.send_message(uuid, text, text, text, text, bigint) to authenticated;

create or replace function public.mark_message_conversation_read(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient uuid := auth.uid();
begin
  if recipient is null then
    raise exception 'Sign in to mark messages as read';
  end if;

  if target_user_id is null or target_user_id = recipient
    or public.is_message_pair_blocked(recipient, target_user_id) then
    raise exception 'Messaging is unavailable for this member';
  end if;

  update public.messages
  set read_at = now()
  where recipient_id = recipient
    and sender_id = target_user_id
    and read_at is null;

  update public.message_notifications n
  set read_at = now()
  from public.messages m
  where n.message_id = m.id
    and n.recipient_id = recipient
    and m.sender_id = target_user_id
    and n.read_at is null;
end;
$$;

revoke all on function public.mark_message_conversation_read(uuid) from public, anon;
grant execute on function public.mark_message_conversation_read(uuid) to authenticated;

create table public.message_user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reported_user_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (reason in ('spam', 'harassment', 'inappropriate', 'other')),
  details text not null default '' check (char_length(details) <= 2000),
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_user_id)
);

alter table public.message_user_reports enable row level security;

create policy "Members view reports they submitted"
  on public.message_user_reports for select to authenticated
  using ((select auth.uid()) = reporter_id);
create policy "Administrators review message reports"
  on public.message_user_reports for select to authenticated
  using (exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'administrator'
  ));
create policy "Members report other users"
  on public.message_user_reports for insert to authenticated
  with check ((select auth.uid()) = reporter_id and reporter_id <> reported_user_id);

grant select, insert on public.message_user_reports to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'talantalink-inbox-files',
  'talantalink-inbox-files',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Members upload inbox files to their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'talantalink-inbox-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Message participants read shared inbox files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'talantalink-inbox-files'
    and exists (
      select 1
      from public.message_attachments a
      join public.messages m on m.id = a.message_id
      where a.storage_path = name
        and (select auth.uid()) in (m.sender_id, m.recipient_id)
        and not public.is_message_pair_blocked(m.sender_id, m.recipient_id)
    )
  );

create policy "Members remove inbox files from their own folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'talantalink-inbox-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_notifications'
  ) then
    alter publication supabase_realtime add table public.message_notifications;
  end if;
end;
$$;
