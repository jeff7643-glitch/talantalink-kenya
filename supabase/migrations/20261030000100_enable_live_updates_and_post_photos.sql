insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'talantalink-posts',
  'talantalink-posts',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "TalantaLink post photos are publicly readable"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'talantalink-posts');

create policy "Members upload photos to their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'talantalink-posts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Members remove photos from their own folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'talantalink-posts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

do $$
declare
  table_name text;
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    raise exception 'The supabase_realtime publication does not exist in this project';
  end if;

  foreach table_name in array array['posts', 'post_likes', 'comments'] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;
