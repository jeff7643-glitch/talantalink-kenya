create table if not exists public.saved_posts (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

alter table public.saved_posts enable row level security;

drop policy if exists "Members view their saved posts" on public.saved_posts;
create policy "Members view their saved posts" on public.saved_posts
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Members save posts for themselves" on public.saved_posts;
create policy "Members save posts for themselves" on public.saved_posts
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Members remove their saved posts" on public.saved_posts;
create policy "Members remove their saved posts" on public.saved_posts
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, delete on public.saved_posts to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'talantalink-avatars',
  'talantalink-avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "TalantaLink member photos are publicly readable" on storage.objects;
create policy "TalantaLink member photos are publicly readable"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'talantalink-avatars');

drop policy if exists "Members upload their own profile photos" on storage.objects;
create policy "Members upload their own profile photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'talantalink-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Members replace their own profile photos" on storage.objects;
create policy "Members replace their own profile photos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'talantalink-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'talantalink-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Members remove their own profile photos" on storage.objects;
create policy "Members remove their own profile photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'talantalink-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users send messages as themselves" on public.messages;
create policy "Connected members can send messages"
  on public.messages for insert to authenticated
  with check (
    (select auth.uid()) = sender_id
    and exists (
      select 1
      from public.connections
      where status = 'accepted'
        and (
          (requester_id = sender_id and receiver_id = recipient_id)
          or (requester_id = recipient_id and receiver_id = sender_id)
        )
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    raise exception 'The supabase_realtime publication does not exist in this project';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;
