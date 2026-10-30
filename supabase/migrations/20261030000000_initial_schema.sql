create extension if not exists pgcrypto;

create type public.opportunity_type as enum ('job', 'sponsorship', 'collaboration');
create type public.connection_status as enum ('pending', 'accepted', 'rejected');
create type public.opportunity_status as enum ('draft', 'published', 'closed');
create type public.application_status as enum ('submitted', 'reviewing', 'accepted', 'rejected');
create type public.advertisement_status as enum ('draft', 'active', 'paused', 'ended');

create table public.counties (
  id smallint primary key check (id between 1 and 47),
  name text not null unique
);

insert into public.counties (id, name) values
  (1, 'Mombasa'), (2, 'Kwale'), (3, 'Kilifi'), (4, 'Tana River'),
  (5, 'Lamu'), (6, 'Taita-Taveta'), (7, 'Garissa'), (8, 'Wajir'),
  (9, 'Mandera'), (10, 'Marsabit'), (11, 'Isiolo'), (12, 'Meru'),
  (13, 'Tharaka-Nithi'), (14, 'Embu'), (15, 'Kitui'), (16, 'Machakos'),
  (17, 'Makueni'), (18, 'Nyandarua'), (19, 'Nyeri'), (20, 'Kirinyaga'),
  (21, 'Murang''a'), (22, 'Kiambu'), (23, 'Turkana'), (24, 'West Pokot'),
  (25, 'Samburu'), (26, 'Trans Nzoia'), (27, 'Uasin Gishu'),
  (28, 'Elgeyo-Marakwet'), (29, 'Nandi'), (30, 'Baringo'), (31, 'Laikipia'),
  (32, 'Nakuru'), (33, 'Narok'), (34, 'Kajiado'), (35, 'Kericho'),
  (36, 'Bomet'), (37, 'Kakamega'), (38, 'Vihiga'), (39, 'Bungoma'),
  (40, 'Busia'), (41, 'Siaya'), (42, 'Kisumu'), (43, 'Homa Bay'),
  (44, 'Migori'), (45, 'Kisii'), (46, 'Nyamira'), (47, 'Nairobi');

create table public.talent_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

insert into public.talent_categories (name) values
  ('Board & Mind Games'),
  ('Cue & Table Sports'),
  ('Outdoor & Field Sports'),
  ('E-Sports'),
  ('Performing Arts'),
  ('Creative Arts & Visual'),
  ('Hustle & Technical'),
  ('Indigenous & Special Skills');

create table public.talents (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.talent_categories (id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now(),
  unique (category_id, name)
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 100),
  headline text not null default '' check (char_length(headline) <= 160),
  bio text not null default '' check (char_length(bio) <= 2000),
  county_id smallint references public.counties (id) on delete set null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.talent_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  talent_id uuid not null references public.talents (id) on delete restrict,
  experience_years smallint check (experience_years between 0 and 80),
  portfolio_url text,
  open_to_work boolean not null default false,
  open_to_opportunities boolean not null default false,
  open_to_sponsorship boolean not null default false,
  open_to_collaboration boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, talent_id)
);

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  receiver_id uuid not null references public.profiles (id) on delete cascade,
  status public.connection_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> receiver_id)
);

create unique index connections_unique_pair
  on public.connections (least(requester_id, receiver_id), greatest(requester_id, receiver_id));
create index connections_receiver_status on public.connections (receiver_id, status);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null check (char_length(content) between 1 and 5000),
  image_url text,
  video_url text,
  is_sponsored boolean not null default false,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index posts_feed_order on public.posts (created_at desc) where is_published;

create table public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index comments_post_order on public.comments (post_id, created_at);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  description text not null default '' check (char_length(description) <= 3000),
  website text,
  logo_url text,
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  description text not null check (char_length(description) between 1 and 5000),
  type public.opportunity_type not null,
  county_id smallint references public.counties (id) on delete set null,
  talent_id uuid references public.talents (id) on delete set null,
  compensation text,
  deadline timestamptz,
  status public.opportunity_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index opportunities_discovery on public.opportunities (type, county_id, created_at desc)
  where status = 'published';

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  applicant_id uuid not null references public.profiles (id) on delete cascade,
  message text not null default '' check (char_length(message) <= 3000),
  status public.application_status not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id, applicant_id)
);
create index applications_applicant_order on public.applications (applicant_id, created_at desc);

create function public.protect_application_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.opportunity_id is distinct from old.opportunity_id
    or new.applicant_id is distinct from old.applicant_id
    or new.message is distinct from old.message
    or new.created_at is distinct from old.created_at then
    raise exception 'Application details cannot be changed after submission';
  end if;
  return new;
end;
$$;

create trigger protect_application_fields
  before update on public.applications
  for each row execute procedure public.protect_application_fields();

create table public.advertisements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  image_url text,
  target_talent_id uuid references public.talents (id) on delete set null,
  target_county_id smallint references public.counties (id) on delete set null,
  budget numeric(12, 2) check (budget is null or budget >= 0),
  status public.advertisement_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.advertisement_events (
  id uuid primary key default gen_random_uuid(),
  advertisement_id uuid not null references public.advertisements (id) on delete cascade,
  event_type text not null check (event_type in ('impression', 'click')),
  occurred_at timestamptz not null default now()
);
create index advertisement_events_report on public.advertisement_events (advertisement_id, event_type, occurred_at);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  content text not null check (char_length(content) between 1 and 5000),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create index messages_inbox_order on public.messages (recipient_id, created_at desc);
create index messages_sent_order on public.messages (sender_id, created_at desc);

create function public.protect_message_content()
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
  return new;
end;
$$;

create trigger protect_message_content
  before update on public.messages
  for each row execute procedure public.protect_message_content();

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'New talent')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.counties enable row level security;
alter table public.talent_categories enable row level security;
alter table public.talents enable row level security;
alter table public.profiles enable row level security;
alter table public.talent_profiles enable row level security;
alter table public.connections enable row level security;
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.comments enable row level security;
alter table public.companies enable row level security;
alter table public.opportunities enable row level security;
alter table public.applications enable row level security;
alter table public.advertisements enable row level security;
alter table public.advertisement_events enable row level security;
alter table public.messages enable row level security;

create policy "Counties are readable by everyone" on public.counties
  for select using (true);
create policy "Talent categories are readable by everyone" on public.talent_categories
  for select using (true);
create policy "Talents are readable by everyone" on public.talents
  for select using (true);

create policy "Profiles are publicly viewable" on public.profiles
  for select using (true);
create policy "Users create their own profile" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "Users update their own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Talent profiles are publicly viewable" on public.talent_profiles
  for select using (true);
create policy "Users manage their own talent profiles" on public.talent_profiles
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Connection participants can view requests" on public.connections
  for select to authenticated
  using ((select auth.uid()) in (requester_id, receiver_id));
create policy "Users can send connection requests" on public.connections
  for insert to authenticated
  with check ((select auth.uid()) = requester_id and status = 'pending');
create policy "Recipients can respond to connection requests" on public.connections
  for update to authenticated
  using ((select auth.uid()) = receiver_id and status = 'pending')
  with check ((select auth.uid()) = receiver_id and status in ('accepted', 'rejected'));
create policy "Requesters can cancel pending requests" on public.connections
  for delete to authenticated
  using ((select auth.uid()) = requester_id and status in ('pending', 'rejected'));

create policy "Published posts are readable" on public.posts
  for select using (is_published or (select auth.uid()) = user_id);
create policy "Users create their own posts" on public.posts
  for insert to authenticated
  with check ((select auth.uid()) = user_id and is_sponsored = false);
create policy "Users update their own posts" on public.posts
  for update to authenticated
  using ((select auth.uid()) = user_id and is_sponsored = false)
  with check ((select auth.uid()) = user_id and is_sponsored = false);
create policy "Users delete their own posts" on public.posts
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Post likes are readable" on public.post_likes
  for select using (true);
create policy "Users like posts as themselves" on public.post_likes
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users remove their own likes" on public.post_likes
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Comments are readable" on public.comments
  for select using (true);
create policy "Users comment as themselves" on public.comments
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users delete their own comments" on public.comments
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Companies are publicly viewable" on public.companies
  for select using (true);
create policy "Users create companies they own" on public.companies
  for insert to authenticated
  with check ((select auth.uid()) = owner_id and is_verified = false);
create policy "Company owners update their companies" on public.companies
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy "Company owners delete their companies" on public.companies
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Published opportunities are readable" on public.opportunities
  for select using (
    status = 'published'
    or exists (
      select 1 from public.companies c
      where c.id = company_id and c.owner_id = (select auth.uid())
    )
  );
create policy "Company owners create opportunities" on public.opportunities
  for insert to authenticated
  with check (exists (
    select 1 from public.companies c
    where c.id = company_id and c.owner_id = (select auth.uid())
  ));
create policy "Company owners update opportunities" on public.opportunities
  for update to authenticated
  using (exists (
    select 1 from public.companies c
    where c.id = company_id and c.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.companies c
    where c.id = company_id and c.owner_id = (select auth.uid())
  ));
create policy "Company owners delete opportunities" on public.opportunities
  for delete to authenticated
  using (exists (
    select 1 from public.companies c
    where c.id = company_id and c.owner_id = (select auth.uid())
  ));

create policy "Applicants and company owners view applications" on public.applications
  for select to authenticated
  using (
    applicant_id = (select auth.uid())
    or exists (
      select 1 from public.opportunities o
      join public.companies c on c.id = o.company_id
      where o.id = opportunity_id and c.owner_id = (select auth.uid())
    )
  );
create policy "Users apply as themselves" on public.applications
  for insert to authenticated
  with check (
    applicant_id = (select auth.uid())
    and status = 'submitted'
    and exists (
      select 1 from public.opportunities o
      where o.id = opportunity_id and o.status = 'published'
    )
  );
create policy "Company owners update application status" on public.applications
  for update to authenticated
  using (
    exists (
      select 1 from public.opportunities o
      join public.companies c on c.id = o.company_id
      where o.id = opportunity_id and c.owner_id = (select auth.uid())
    )
  )
  with check (
    status in ('submitted', 'reviewing', 'accepted', 'rejected')
    and exists (
      select 1 from public.opportunities o
      join public.companies c on c.id = o.company_id
      where o.id = opportunity_id and c.owner_id = (select auth.uid())
    )
  );
create policy "Applicants withdraw their applications" on public.applications
  for delete to authenticated
  using (applicant_id = (select auth.uid()));

create policy "Company owners manage advertisements" on public.advertisements
  for all to authenticated
  using (exists (
    select 1 from public.companies c
    where c.id = company_id and c.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.companies c
    where c.id = company_id and c.owner_id = (select auth.uid())
  ));

create policy "Company owners view campaign metrics" on public.advertisement_events
  for select to authenticated
  using (exists (
    select 1 from public.advertisements a
    join public.companies c on c.id = a.company_id
    where a.id = advertisement_id and c.owner_id = (select auth.uid())
  ));

create policy "Message participants can read messages" on public.messages
  for select to authenticated
  using ((select auth.uid()) in (sender_id, recipient_id));
create policy "Users send messages as themselves" on public.messages
  for insert to authenticated
  with check ((select auth.uid()) = sender_id);
create policy "Recipients can mark messages read" on public.messages
  for update to authenticated
  using ((select auth.uid()) = recipient_id)
  with check ((select auth.uid()) = recipient_id);

grant select on public.counties, public.talent_categories, public.talents to anon, authenticated;
grant select on public.profiles, public.talent_profiles, public.posts, public.post_likes,
  public.comments, public.companies, public.opportunities to anon, authenticated;
grant select, insert, update, delete on public.profiles, public.talent_profiles,
  public.connections, public.posts, public.post_likes, public.comments,
  public.companies, public.opportunities, public.applications, public.advertisements,
  public.messages to authenticated;
revoke insert, update on public.companies from authenticated;
grant insert (owner_id, name, description, website, logo_url)
  on public.companies to authenticated;
grant update (name, description, website, logo_url)
  on public.companies to authenticated;
grant select on public.applications, public.advertisements, public.advertisement_events,
  public.messages to authenticated;
