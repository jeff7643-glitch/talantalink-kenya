update public.profile_contact_details
set phone = case
  when regexp_replace(phone, '[^0-9]', '', 'g') ~ '^254[17][0-9]{8}$'
    then '+' || regexp_replace(phone, '[^0-9]', '', 'g')
  when regexp_replace(phone, '[^0-9]', '', 'g') ~ '^0[17][0-9]{8}$'
    then '+254' || substr(regexp_replace(phone, '[^0-9]', '', 'g'), 2)
  when regexp_replace(phone, '[^0-9]', '', 'g') ~ '^[17][0-9]{8}$'
    then '+254' || regexp_replace(phone, '[^0-9]', '', 'g')
  else null
end
where phone is not null;

alter table public.profile_contact_details
  drop constraint if exists profile_contact_details_phone_kenya_format,
  add constraint profile_contact_details_phone_kenya_format
    check (phone is null or phone ~ '^\+254[17][0-9]{8}$');

alter table public.profiles
  drop constraint if exists profiles_contact_preferences_check,
  add constraint profiles_contact_preferences_check
    check (contact_preferences <@ array['email', 'phone', 'whatsapp', 'in_app']::text[]);

create or replace function public.get_public_profile_contacts(target_user_id uuid)
returns table (email text, phone text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case when 'email' = any(p.contact_preferences) then c.email end,
    case when 'phone' = any(p.contact_preferences)
       or 'whatsapp' = any(p.contact_preferences)
      then c.phone end
  from public.profiles p
  left join public.profile_contact_details c on c.user_id = p.id
  where p.id = target_user_id
    and p.is_public
    and p.profile_public_consent;
$$;

revoke all on function public.get_public_profile_contacts(uuid) from public;
grant execute on function public.get_public_profile_contacts(uuid) to anon, authenticated;

create table public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  notify_follows boolean not null default true,
  notify_post_activity boolean not null default true,
  notify_messages boolean not null default true,
  notify_applications boolean not null default true,
  notify_matching_opportunities boolean not null default true,
  notify_profile_verification boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.notification_preferences (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

create function public.initialize_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger initialize_notification_preferences
  after insert on public.profiles
  for each row execute procedure public.initialize_notification_preferences();

alter table public.notification_preferences enable row level security;
create policy "Members view their notification preferences"
  on public.notification_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Members create their notification preferences"
  on public.notification_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Members update their notification preferences"
  on public.notification_preferences for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select on public.notification_preferences to authenticated;
grant insert (
  user_id,
  notify_follows,
  notify_post_activity,
  notify_messages,
  notify_applications,
  notify_matching_opportunities,
  notify_profile_verification
) on public.notification_preferences to authenticated;
grant update (
  notify_follows,
  notify_post_activity,
  notify_messages,
  notify_applications,
  notify_matching_opportunities,
  notify_profile_verification
) on public.notification_preferences to authenticated;

create function public.protect_notification_preferences()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'Notification preferences cannot be reassigned';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger protect_notification_preferences
  before update on public.notification_preferences
  for each row execute procedure public.protect_notification_preferences();

create table public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  notification_type text not null check (notification_type in (
    'follow',
    'post_appreciation',
    'post_comment',
    'message',
    'application_status',
    'matching_opportunity',
    'profile_verified'
  )),
  entity_type text not null check (entity_type in ('profile', 'post', 'message', 'application', 'opportunity')),
  entity_id uuid not null,
  title text not null check (char_length(title) between 1 and 160),
  body text not null default '' check (char_length(body) <= 500),
  href text not null check (href like '/%' and href not like '//%'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index user_notifications_recipient_order
  on public.user_notifications (recipient_id, created_at desc);
create index user_notifications_unread
  on public.user_notifications (recipient_id, created_at desc)
  where read_at is null;

alter table public.user_notifications enable row level security;
create policy "Members view their own notifications"
  on public.user_notifications for select to authenticated
  using (recipient_id = (select auth.uid()));
create policy "Members update their own notification read state"
  on public.user_notifications for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

grant select on public.user_notifications to authenticated;
grant update (read_at) on public.user_notifications to authenticated;

create function public.protect_notification_content()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.recipient_id is distinct from old.recipient_id
    or new.actor_id is distinct from old.actor_id
    or new.notification_type is distinct from old.notification_type
    or new.entity_type is distinct from old.entity_type
    or new.entity_id is distinct from old.entity_id
    or new.title is distinct from old.title
    or new.body is distinct from old.body
    or new.href is distinct from old.href
    or new.created_at is distinct from old.created_at then
    raise exception 'Notification content cannot be changed';
  end if;
  return new;
end;
$$;

create trigger protect_notification_content
  before update on public.user_notifications
  for each row execute procedure public.protect_notification_content();

create function public.create_user_notification(
  p_recipient_id uuid,
  p_actor_id uuid,
  p_notification_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_title text,
  p_body text,
  p_href text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  enabled boolean;
begin
  if p_recipient_id is null or (p_actor_id is not null and p_recipient_id = p_actor_id) then
    return;
  end if;

  select case p_notification_type
    when 'follow' then n.notify_follows
    when 'post_appreciation' then n.notify_post_activity
    when 'post_comment' then n.notify_post_activity
    when 'message' then n.notify_messages
    when 'application_status' then n.notify_applications
    when 'matching_opportunity' then n.notify_matching_opportunities
    when 'profile_verified' then n.notify_profile_verification
    else false
  end
  into enabled
  from public.notification_preferences n
  where n.user_id = p_recipient_id;

  if not coalesce(enabled, true) then
    return;
  end if;

  insert into public.user_notifications (
    recipient_id,
    actor_id,
    notification_type,
    entity_type,
    entity_id,
    title,
    body,
    href
  )
  values (
    p_recipient_id,
    p_actor_id,
    p_notification_type,
    p_entity_type,
    p_entity_id,
    p_title,
    p_body,
    p_href
  );
end;
$$;

revoke all on function public.create_user_notification(uuid, uuid, text, text, uuid, text, text, text)
  from public, anon, authenticated;

create function public.notify_followed_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.create_user_notification(
    new.followed_id, new.follower_id, 'follow', 'profile', new.follower_id,
    'New follower', 'A TalantaLink member followed your profile.',
    '/talent/' || new.follower_id::text
  );
  return new;
end;
$$;

create trigger notify_followed_member
  after insert on public.talent_follows
  for each row execute procedure public.notify_followed_member();

create function public.notify_post_appreciation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_owner uuid;
begin
  select p.user_id into post_owner
  from public.posts p
  where p.id = new.post_id;
  perform public.create_user_notification(
    post_owner, new.user_id, 'post_appreciation', 'post', new.post_id,
    'Your work was appreciated', 'A member appreciated your post.',
    '/posts/' || new.post_id::text
  );
  return new;
end;
$$;

create trigger notify_post_appreciation
  after insert on public.post_likes
  for each row execute procedure public.notify_post_appreciation();

create function public.notify_post_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_owner uuid;
begin
  select p.user_id into post_owner
  from public.posts p
  where p.id = new.post_id;
  perform public.create_user_notification(
    post_owner, new.user_id, 'post_comment', 'post', new.post_id,
    'New comment on your post', 'A member commented on your post.',
    '/posts/' || new.post_id::text
  );
  return new;
end;
$$;

create trigger notify_post_comment
  after insert on public.comments
  for each row execute procedure public.notify_post_comment();

create function public.notify_message_recipient()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.create_user_notification(
    new.recipient_id, new.sender_id, 'message', 'message', new.id,
    'New message', 'You received a new private message.',
    '/inbox'
  );
  return new;
end;
$$;

create trigger notify_message_recipient
  after insert on public.messages
  for each row execute procedure public.notify_message_recipient();

create function public.notify_application_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  opportunity_title text;
  status_title text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select o.title into opportunity_title
  from public.opportunities o
  where o.id = new.opportunity_id;
  status_title := case new.status::text
    when 'reviewing' then 'under review'
    when 'shortlisted' then 'shortlisted'
    when 'accepted' then 'approved'
    when 'rejected' then 'declined'
    else 'updated'
  end;
  perform public.create_user_notification(
    new.applicant_id, null, 'application_status', 'application', new.id,
    'Application status updated',
    coalesce(opportunity_title, 'Your application') || ' is ' || status_title || '.',
    '/opportunities'
  );
  return new;
end;
$$;

create trigger notify_application_status_change
  after update of status on public.applications
  for each row execute procedure public.notify_application_status_change();

create function public.notify_matching_opportunity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  opportunity_text text;
  is_newly_published boolean;
  candidate record;
begin
  if tg_op = 'INSERT' then
    is_newly_published := new.status = 'published';
  else
    is_newly_published := new.status = 'published' and old.status is distinct from new.status;
  end if;
  if not is_newly_published then
    return new;
  end if;

  select concat_ws(' ', new.title, new.description, new.requirements, new.type::text)
    into opportunity_text;

  for candidate in
    select p.id
    from public.profiles p
    where p.role = 'talent'
      and (
        new.county_id is null
        or p.county_id = new.county_id
        or coalesce(new.location, '') ilike '%remote%'
        or coalesce(new.location, '') ilike '%nationwide%'
      )
      and (
        (
          new.talent_id is not null
          and exists (
            select 1 from public.talent_profiles tp
            where tp.user_id = p.id and tp.talent_id = new.talent_id
          )
        )
        or exists (
          select 1
          from unnest(p.skills) skill
          where char_length(trim(skill)) > 1
            and lower(opportunity_text) like '%' || lower(trim(skill)) || '%'
        )
      )
      and not exists (
        select 1 from public.admin_account_status s
        where s.user_id = p.id and s.is_suspended
      )
  loop
    perform public.create_user_notification(
      candidate.id, null, 'matching_opportunity', 'opportunity', new.id,
      'A new opportunity may match your skills',
      new.title || ' - ' || new.location,
      '/opportunities'
    );
  end loop;
  return new;
end;
$$;

create trigger notify_matching_opportunity
  after insert or update of status on public.opportunities
  for each row execute procedure public.notify_matching_opportunity();

create function public.notify_talent_verification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_verified and not old.is_verified then
    perform public.create_user_notification(
      new.id, null, 'profile_verified', 'profile', new.id,
      'Your talent profile is verified',
      'Your profile has received the TalantaLink verification badge.',
      '/profile/edit'
    );
  end if;
  return new;
end;
$$;

create trigger notify_talent_verification
  after update of is_verified on public.profiles
  for each row execute procedure public.notify_talent_verification();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_notifications'
  ) then
    alter publication supabase_realtime add table public.user_notifications;
  end if;
end;
$$;

create policy "No client access to rate limit counters"
  on public.trust_safety_rate_limits as restrictive for all to anon, authenticated
  using (false)
  with check (false);
