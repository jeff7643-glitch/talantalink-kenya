alter table public.profiles
  add column cover_photo_url text,
  add column town text check (town is null or char_length(town) <= 120),
  add column experience_years smallint check (experience_years between 0 and 80),
  add column skills text[] not null default '{}',
  add column education text not null default '' check (char_length(education) <= 4000),
  add column availability_status text not null default 'available'
    check (availability_status in ('available', 'open_to_opportunities', 'unavailable')),
  add column social_links jsonb not null default '{}'::jsonb
    check (jsonb_typeof(social_links) = 'object'),
  add column contact_preferences text[] not null default '{in_app}'
    check (contact_preferences <@ array['email', 'phone', 'in_app']::text[]),
  add column is_public boolean not null default true;

grant update (
  cover_photo_url,
  town,
  experience_years,
  skills,
  education,
  availability_status,
  social_links,
  contact_preferences,
  is_public
) on public.profiles to authenticated;

drop policy if exists "Profiles are publicly viewable" on public.profiles;
create policy "Public profiles are viewable"
  on public.profiles for select
  using (is_public);

create policy "Members can view their own private profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create table public.profile_contact_details (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  email text check (email is null or char_length(email) <= 254),
  phone text check (phone is null or char_length(phone) <= 32),
  updated_at timestamptz not null default now()
);

alter table public.profile_contact_details enable row level security;

create policy "Members manage their own contact details"
  on public.profile_contact_details for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.profile_contact_details to authenticated;

create or replace function public.get_public_profile_contacts(target_user_id uuid)
returns table (email text, phone text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case when 'email' = any(p.contact_preferences) then c.email end,
    case when 'phone' = any(p.contact_preferences) then c.phone end
  from public.profiles p
  left join public.profile_contact_details c on c.user_id = p.id
  where p.id = target_user_id
    and p.is_public;
$$;

revoke all on function public.get_public_profile_contacts(uuid) from public;
grant execute on function public.get_public_profile_contacts(uuid) to anon, authenticated;

create table public.profile_portfolio_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '' check (char_length(description) <= 1000),
  media_type text not null check (media_type in ('photo', 'video', 'document')),
  storage_path text not null,
  created_at timestamptz not null default now(),
  check (storage_path like (user_id::text || '/%'))
);

create index profile_portfolio_items_user_order
  on public.profile_portfolio_items (user_id, created_at desc);

alter table public.profile_portfolio_items enable row level security;

create policy "Public portfolio items are viewable"
  on public.profile_portfolio_items for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = user_id and (p.is_public or p.id = (select auth.uid()))
    )
  );

create policy "Members manage their own portfolio items"
  on public.profile_portfolio_items for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select on public.profile_portfolio_items to anon, authenticated;
grant insert, update, delete on public.profile_portfolio_items to authenticated;

create table public.profile_certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  issuer text not null default '' check (char_length(issuer) <= 160),
  issued_on date,
  credential_url text check (credential_url is null or char_length(credential_url) <= 2000),
  storage_path text,
  created_at timestamptz not null default now(),
  check (storage_path is null or storage_path like (user_id::text || '/%'))
);

create index profile_certificates_user_order
  on public.profile_certificates (user_id, issued_on desc nulls last);

alter table public.profile_certificates enable row level security;

create policy "Public certificates are viewable"
  on public.profile_certificates for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = user_id and (p.is_public or p.id = (select auth.uid()))
    )
  );

create policy "Members manage their own certificates"
  on public.profile_certificates for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select on public.profile_certificates to anon, authenticated;
grant insert, update, delete on public.profile_certificates to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'talantalink-profile-media',
  'talantalink-profile-media',
  true,
  26214400,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/avif',
    'video/mp4', 'video/webm',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Professional profile media is publicly readable"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'talantalink-profile-media');

create policy "Members upload their own professional profile media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'talantalink-profile-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Members remove their own professional profile media"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'talantalink-profile-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
