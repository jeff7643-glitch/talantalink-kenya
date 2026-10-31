alter table public.posts
  add column if not exists hashtag_terms text[] not null default '{}',
  add column if not exists media_storage_path text;

alter table public.posts
  add constraint posts_media_storage_owner
  check (media_storage_path is null or media_storage_path like (user_id::text || '/%'));

create index posts_hashtag_terms_search on public.posts using gin (hashtag_terms);

create table public.talent_follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followed_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);

create index talent_follows_followed_order on public.talent_follows (followed_id, created_at desc);
alter table public.talent_follows enable row level security;

create policy "Follow relationships are publicly viewable"
  on public.talent_follows for select using (true);

create policy "Members follow other talents"
  on public.talent_follows for insert to authenticated
  with check (
    (select auth.uid()) = follower_id
    and exists (
      select 1 from public.profiles p
      where p.id = followed_id and p.is_public
    )
  );

create policy "Members unfollow talents"
  on public.talent_follows for delete to authenticated
  using ((select auth.uid()) = follower_id);

grant select on public.talent_follows to anon, authenticated;
grant insert, delete on public.talent_follows to authenticated;

create table public.post_mentions (
  post_id uuid not null references public.posts (id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, mentioned_user_id)
);

alter table public.post_mentions enable row level security;

create policy "Post mentions are publicly viewable"
  on public.post_mentions for select using (true);

create policy "Authors tag members in their own posts"
  on public.post_mentions for insert to authenticated
  with check (
    exists (
      select 1 from public.posts p
      where p.id = post_id and p.user_id = (select auth.uid())
    )
    and (select auth.uid()) <> mentioned_user_id
    and exists (
      select 1 from public.profiles p
      where p.id = mentioned_user_id and p.is_public
    )
  );

grant select on public.post_mentions to anon, authenticated;
grant insert on public.post_mentions to authenticated;

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment', 'profile')),
  target_id uuid not null,
  reason text not null check (char_length(reason) between 1 and 1000),
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);

create index content_reports_queue_order on public.content_reports (created_at desc);

create function public.validate_content_report_target()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.target_type = 'post' and not exists (
    select 1 from public.posts where id = new.target_id
  ) then
    raise exception 'The reported post does not exist';
  elsif new.target_type = 'comment' and not exists (
    select 1 from public.comments where id = new.target_id
  ) then
    raise exception 'The reported comment does not exist';
  elsif new.target_type = 'profile' and not exists (
    select 1 from public.profiles where id = new.target_id
  ) then
    raise exception 'The reported profile does not exist';
  end if;
  return new;
end;
$$;

create trigger validate_content_report_target
  before insert on public.content_reports
  for each row execute procedure public.validate_content_report_target();

alter table public.content_reports enable row level security;

create policy "Members report content as themselves"
  on public.content_reports for insert to authenticated
  with check ((select auth.uid()) = reporter_id);

create policy "Members view their submitted reports"
  on public.content_reports for select to authenticated
  using ((select auth.uid()) = reporter_id);

create policy "Administrators review content reports"
  on public.content_reports for select to authenticated
  using (public.current_user_role() = 'administrator');

grant insert, select on public.content_reports to authenticated;

update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/avif',
      'video/mp4', 'video/webm'
    ]
where id = 'talantalink-posts';
