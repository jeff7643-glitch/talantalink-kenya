alter table public.profiles
  add column is_verified boolean not null default false,
  add column is_moderation_hidden boolean not null default false;

alter table public.posts
  add column is_removed boolean not null default false;

alter table public.comments
  add column is_removed boolean not null default false;

alter table public.opportunities
  add column is_moderation_hidden boolean not null default false;

alter table public.content_reports
  add column status text not null default 'open'
    check (status in ('open', 'in_review', 'resolved', 'dismissed')),
  add column resolution_note text not null default ''
    check (char_length(resolution_note) <= 2000),
  add column reviewed_by uuid references public.profiles (id) on delete set null,
  add column reviewed_at timestamptz;

alter table public.message_user_reports
  add column status text not null default 'open'
    check (status in ('open', 'in_review', 'resolved', 'dismissed')),
  add column resolution_note text not null default ''
    check (char_length(resolution_note) <= 2000),
  add column reviewed_by uuid references public.profiles (id) on delete set null,
  add column reviewed_at timestamptz;

create table public.admin_account_status (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  is_suspended boolean not null default false,
  suspension_reason text,
  suspended_by uuid references public.profiles (id) on delete set null,
  suspended_at timestamptz,
  updated_at timestamptz not null default now(),
  check (
    (
      is_suspended
      and suspension_reason is not null
      and char_length(trim(suspension_reason)) between 8 and 500
      and suspended_at is not null
      and suspended_by is not null
    )
    or (not is_suspended and suspension_reason is null and suspended_at is null)
  )
);

insert into public.admin_account_status (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

create function public.initialize_admin_account_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.admin_account_status (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger initialize_admin_account_status
  after insert on public.profiles
  for each row execute procedure public.initialize_admin_account_status();

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid not null,
  details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create index admin_audit_log_created_at_idx
  on public.admin_audit_log (created_at desc);
create index admin_account_status_suspended_idx
  on public.admin_account_status (updated_at desc) where is_suspended;
create index content_reports_open_queue_idx
  on public.content_reports (created_at desc) where status = 'open';
create index message_user_reports_open_queue_idx
  on public.message_user_reports (created_at desc) where status = 'open';

alter table public.admin_account_status enable row level security;
alter table public.admin_audit_log enable row level security;

create policy "Administrators view account status"
  on public.admin_account_status for select to authenticated
  using (public.current_user_role() = 'administrator');
create policy "Administrators manage account status"
  on public.admin_account_status for update to authenticated
  using (public.current_user_role() = 'administrator')
  with check (public.current_user_role() = 'administrator');
create policy "Administrators view operation audit"
  on public.admin_audit_log for select to authenticated
  using (public.current_user_role() = 'administrator');

grant select on public.admin_account_status to authenticated;
grant update (is_suspended, suspension_reason, suspended_by, suspended_at)
  on public.admin_account_status to authenticated;
grant select on public.admin_audit_log to authenticated;

create policy "Administrators view all profiles"
  on public.profiles for select to authenticated
  using (public.current_user_role() = 'administrator');
create policy "Administrators verify talent profiles"
  on public.profiles for update to authenticated
  using (public.current_user_role() = 'administrator')
  with check (public.current_user_role() = 'administrator');
grant update (is_verified) on public.profiles to authenticated;
grant update (is_moderation_hidden) on public.profiles to authenticated;

create policy "Administrators update reported post visibility"
  on public.posts for update to authenticated
  using (public.current_user_role() = 'administrator')
  with check (public.current_user_role() = 'administrator');
grant update (is_removed) on public.posts to authenticated;

drop policy if exists "Published posts are readable" on public.posts;
create policy "Published posts are readable"
  on public.posts for select
  using (
    not is_removed
    and (is_published or (select auth.uid()) = user_id)
  );
create policy "Administrators view removed posts"
  on public.posts for select to authenticated
  using (public.current_user_role() = 'administrator');

create policy "Administrators update reported comments"
  on public.comments for update to authenticated
  using (public.current_user_role() = 'administrator')
  with check (public.current_user_role() = 'administrator');
grant update (is_removed) on public.comments to authenticated;

drop policy if exists "Comments are readable" on public.comments;
create policy "Comments are readable"
  on public.comments for select
  using (
    not is_removed
    or public.current_user_role() = 'administrator'
  );

create policy "Administrators update content reports"
  on public.content_reports for update to authenticated
  using (public.current_user_role() = 'administrator')
  with check (public.current_user_role() = 'administrator');
grant update (status, resolution_note, reviewed_by, reviewed_at)
  on public.content_reports to authenticated;

create policy "Administrators update message reports"
  on public.message_user_reports for update to authenticated
  using (public.current_user_role() = 'administrator')
  with check (public.current_user_role() = 'administrator');
grant update (status, resolution_note, reviewed_by, reviewed_at)
  on public.message_user_reports to authenticated;
create policy "Administrators verify employers"
  on public.companies for update to authenticated
  using (public.current_user_role() = 'administrator')
  with check (public.current_user_role() = 'administrator');
grant update (is_verified) on public.companies to authenticated;

create policy "Administrators manage opportunity status"
  on public.opportunities for update to authenticated
  using (public.current_user_role() = 'administrator')
  with check (public.current_user_role() = 'administrator');
create policy "Administrators view all opportunities"
  on public.opportunities for select to authenticated
  using (public.current_user_role() = 'administrator');
grant update (is_moderation_hidden) on public.opportunities to authenticated;

drop policy if exists "Published opportunities are readable" on public.opportunities;
create policy "Published opportunities are readable"
  on public.opportunities for select
  using (
    not is_moderation_hidden
    and (
      status = 'published'
      or exists (
        select 1 from public.companies c
        where c.id = company_id and c.owner_id = (select auth.uid())
      )
    )
  );

create policy "Administrators add talent categories"
  on public.talent_categories for insert to authenticated
  with check (public.current_user_role() = 'administrator');
create policy "Administrators rename talent categories"
  on public.talent_categories for update to authenticated
  using (public.current_user_role() = 'administrator')
  with check (public.current_user_role() = 'administrator');
grant insert, update (name) on public.talent_categories to authenticated;

create function public.guard_admin_operations()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  is_admin boolean := coalesce(public.current_user_role() = 'administrator', false);
begin
  if tg_table_name = 'profiles' then
    if tg_op = 'UPDATE' and new.role is distinct from old.role
      and current_user not in ('postgres', 'service_role') then
      raise exception 'Profile roles can only be changed by trusted operators';
    end if;
    if tg_op = 'UPDATE' and new.is_verified is distinct from old.is_verified
      and not is_admin then
      raise exception 'Only administrators can verify talent profiles';
    end if;
    if tg_op = 'UPDATE' and new.is_moderation_hidden is distinct from old.is_moderation_hidden
      and not is_admin then
      raise exception 'Only administrators can change profile moderation status';
    end if;
    if tg_op = 'UPDATE' and old.is_moderation_hidden and new.is_public and not is_admin then
      raise exception 'This profile is hidden by a moderator';
    end if;
  elsif tg_table_name = 'admin_account_status' then
    if not is_admin then
      raise exception 'Only administrators can manage account status';
    end if;
    if new.user_id is distinct from old.user_id then
      raise exception 'Account status records cannot be reassigned';
    end if;
    if new.user_id = auth.uid() and new.is_suspended then
      raise exception 'Administrators cannot suspend their own account';
    end if;
    if new.is_suspended and exists (
      select 1 from public.profiles p
      where p.id = new.user_id and p.role = 'administrator'
    ) then
      raise exception 'Administrator accounts cannot be suspended here';
    end if;
    if new.is_suspended then
      if new.suspended_by is distinct from auth.uid() then
        raise exception 'The current administrator must be recorded as the suspending actor';
      end if;
      new.suspended_at := now();
    else
      new.suspended_by := null;
      new.suspended_at := null;
    end if;
    new.updated_at := now();
  elsif tg_table_name = 'companies' then
    if tg_op = 'UPDATE' and new.is_verified is distinct from old.is_verified
      and not is_admin then
      raise exception 'Only administrators can verify employers';
    end if;
  elsif tg_table_name = 'opportunities' then
    if tg_op = 'UPDATE' and new.is_moderation_hidden is distinct from old.is_moderation_hidden
      and not is_admin then
      raise exception 'Only administrators can hide reported listings';
    end if;
  elsif tg_table_name = 'posts' then
    if tg_op = 'UPDATE' and new.is_removed is distinct from old.is_removed
      and not is_admin then
      raise exception 'Only administrators can remove reported posts';
    end if;
  elsif tg_table_name = 'comments' then
    if tg_op = 'UPDATE' and new.is_removed is distinct from old.is_removed
      and not is_admin then
      raise exception 'Only administrators can remove reported comments';
    end if;
  elsif tg_table_name in ('content_reports', 'message_user_reports') then
    if tg_op = 'INSERT' and (
      new.status <> 'open'
      or coalesce(new.resolution_note, '') <> ''
      or new.reviewed_by is not null
      or new.reviewed_at is not null
    ) then
      raise exception 'New reports must begin in the open state';
    end if;
    if tg_op = 'UPDATE' then
      if new.reporter_id is distinct from old.reporter_id
        or new.reason is distinct from old.reason
        or new.created_at is distinct from old.created_at then
        raise exception 'Submitted report details cannot be changed';
      elsif tg_table_name = 'content_reports' then
        if new.target_type is distinct from old.target_type
          or new.target_id is distinct from old.target_id then
          raise exception 'Submitted report details cannot be changed';
        end if;
      elsif tg_table_name = 'message_user_reports' then
        if new.reported_user_id is distinct from old.reported_user_id
          or new.details is distinct from old.details then
          raise exception 'Submitted report details cannot be changed';
        end if;
      end if;
    end if;
    if tg_op = 'UPDATE' and (
      new.status is distinct from old.status
      or new.resolution_note is distinct from old.resolution_note
      or new.reviewed_by is distinct from old.reviewed_by
      or new.reviewed_at is distinct from old.reviewed_at
    ) and not is_admin then
      raise exception 'Only administrators can resolve reports';
    end if;
  elsif tg_table_name = 'talent_categories' and not is_admin then
    raise exception 'Only administrators can manage talent categories';
  end if;

  return new;
end;
$$;

create trigger guard_profile_admin_fields
  before update on public.profiles
  for each row execute procedure public.guard_admin_operations();
create trigger guard_admin_account_status
  before update on public.admin_account_status
  for each row execute procedure public.guard_admin_operations();
create trigger guard_company_verification
  before update on public.companies
  for each row execute procedure public.guard_admin_operations();
create trigger guard_post_moderation
  before update on public.posts
  for each row execute procedure public.guard_admin_operations();
create trigger guard_comment_moderation
  before update on public.comments
  for each row execute procedure public.guard_admin_operations();
create trigger guard_content_report_review
  before update on public.content_reports
  for each row execute procedure public.guard_admin_operations();
create trigger guard_message_report_review
  before update on public.message_user_reports
  for each row execute procedure public.guard_admin_operations();
create trigger guard_talent_category_changes
  before insert or update on public.talent_categories
  for each row execute procedure public.guard_admin_operations();

create function public.record_admin_operation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_row jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  after_row jsonb := to_jsonb(new);
  action_name text;
  target_kind text := tg_table_name;
  target_uuid uuid;
  audit_details jsonb := '{}'::jsonb;
begin
  if tg_table_name = 'profiles'
    and before_row -> 'is_verified' is distinct from after_row -> 'is_verified' then
    action_name := 'talent_verification_changed';
    target_kind := 'talent_profile';
    audit_details := jsonb_build_object(
      'verified', after_row -> 'is_verified'
    );
  elsif tg_table_name = 'profiles'
    and before_row -> 'is_public' is distinct from after_row -> 'is_public'
    and public.current_user_role() = 'administrator' then
    action_name := 'administrator_profile_visibility_changed';
    target_kind := 'profile';
    audit_details := jsonb_build_object('public', after_row -> 'is_public');
  elsif tg_table_name = 'companies'
    and before_row -> 'is_verified' is distinct from after_row -> 'is_verified' then
    action_name := 'employer_verification_changed';
    target_kind := 'company';
    audit_details := jsonb_build_object('verified', after_row -> 'is_verified');
  elsif tg_table_name = 'admin_account_status'
    and before_row -> 'is_suspended' is distinct from after_row -> 'is_suspended' then
    action_name := case when after_row ->> 'is_suspended' = 'true'
      then 'account_suspended' else 'account_reactivated' end;
    target_kind := 'account';
    audit_details := jsonb_build_object('suspended', after_row -> 'is_suspended');
  elsif tg_table_name = 'posts'
    and before_row -> 'is_removed' is distinct from after_row -> 'is_removed'
    and after_row ->> 'is_removed' = 'true' then
    action_name := 'reported_post_removed';
    target_kind := 'post';
  elsif tg_table_name = 'comments'
    and before_row -> 'is_removed' is distinct from after_row -> 'is_removed'
    and after_row ->> 'is_removed' = 'true' then
    action_name := 'reported_comment_removed';
    target_kind := 'comment';
  elsif tg_table_name in ('content_reports', 'message_user_reports')
    and before_row -> 'status' is distinct from after_row -> 'status' then
    action_name := 'report_' || (after_row ->> 'status');
    target_kind := case when tg_table_name = 'content_reports'
      then 'content_report' else 'account_report' end;
    audit_details := jsonb_build_object(
      'status', after_row -> 'status',
      'target_type', after_row -> 'target_type'
    );
  elsif tg_table_name = 'opportunities'
    and before_row -> 'is_moderation_hidden' is distinct from after_row -> 'is_moderation_hidden'
    and after_row ->> 'is_moderation_hidden' = 'true' then
    action_name := 'reported_opportunity_removed';
    target_kind := 'opportunity';
  elsif tg_table_name = 'opportunities'
    and before_row -> 'status' is distinct from after_row -> 'status'
    and public.current_user_role() = 'administrator' then
    action_name := 'opportunity_status_changed';
    target_kind := 'opportunity';
    audit_details := jsonb_build_object('status', after_row -> 'status');
  elsif tg_table_name = 'talent_categories' then
    action_name := case when tg_op = 'INSERT'
      then 'talent_category_created' else 'talent_category_renamed' end;
    target_kind := 'talent_category';
    audit_details := jsonb_build_object('name', after_row -> 'name');
  end if;

  if action_name is not null then
    target_uuid := coalesce(
      nullif(after_row ->> 'id', '')::uuid,
      nullif(after_row ->> 'user_id', '')::uuid,
      nullif(after_row ->> 'owner_id', '')::uuid
    );
    if target_uuid is null and tg_table_name = 'admin_account_status' then
      target_uuid := (after_row ->> 'user_id')::uuid;
    end if;
    insert into public.admin_audit_log (actor_id, action, target_type, target_id, details)
    values (auth.uid(), action_name, target_kind, target_uuid, audit_details);
  end if;

  return new;
end;
$$;

create trigger audit_profile_verification
  after update on public.profiles
  for each row execute procedure public.record_admin_operation();
create trigger audit_company_verification
  after update on public.companies
  for each row execute procedure public.record_admin_operation();
create trigger audit_account_status
  after update on public.admin_account_status
  for each row execute procedure public.record_admin_operation();
create trigger audit_post_moderation
  after update on public.posts
  for each row execute procedure public.record_admin_operation();
create trigger audit_comment_moderation
  after update on public.comments
  for each row execute procedure public.record_admin_operation();
create trigger audit_content_report_review
  after update on public.content_reports
  for each row execute procedure public.record_admin_operation();
create trigger audit_message_report_review
  after update on public.message_user_reports
  for each row execute procedure public.record_admin_operation();
create trigger audit_opportunity_moderation
  after update on public.opportunities
  for each row execute procedure public.record_admin_operation();
create trigger audit_talent_category_changes
  after insert or update on public.talent_categories
  for each row execute procedure public.record_admin_operation();

create function public.is_current_user_suspended()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_account_status s
    where s.user_id = auth.uid() and s.is_suspended
  );
$$;

revoke all on function public.is_current_user_suspended() from public, anon;
grant execute on function public.is_current_user_suspended() to authenticated;

do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'profiles',
    'talent_profiles',
    'connections',
    'posts',
    'post_likes',
    'comments',
    'companies',
    'opportunities',
    'applications',
    'advertisements',
    'advertisement_events',
    'messages',
    'saved_posts',
    'talent_follows',
    'post_mentions',
    'content_reports',
    'profile_contact_details',
    'profile_portfolio_items',
    'profile_certificates',
    'message_user_blocks',
    'message_attachments',
    'message_notifications',
    'message_user_reports',
    'opportunity_application_documents',
    'admin_account_status',
    'admin_audit_log'
  ] loop
    execute format(
      'create policy "Active member access" on public.%I as restrictive for all to authenticated using (not public.is_current_user_suspended()) with check (not public.is_current_user_suspended())',
      relation_name
    );
  end loop;
end;
$$;

create function public.block_suspended_account_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and public.is_current_user_suspended() then
    raise exception 'This account has been suspended';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.block_suspended_account_activity() from public, anon, authenticated;

do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'profiles',
    'talent_profiles',
    'connections',
    'posts',
    'post_likes',
    'comments',
    'companies',
    'opportunities',
    'applications',
    'advertisements',
    'messages',
    'saved_posts',
    'talent_follows',
    'post_mentions',
    'content_reports',
    'profile_contact_details',
    'profile_portfolio_items',
    'profile_certificates',
    'message_user_blocks',
    'message_user_reports',
    'opportunity_application_documents',
    'message_notifications'
  ] loop
    execute format(
      'create trigger block_suspended_account_activity before insert or update or delete on public.%I for each row execute procedure public.block_suspended_account_activity()',
      relation_name
    );
  end loop;
end;
$$;

create policy "Active members may use storage"
  on storage.objects as restrictive for all to authenticated
  using (not public.is_current_user_suspended())
  with check (not public.is_current_user_suspended());
