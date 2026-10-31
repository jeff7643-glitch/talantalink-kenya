alter table public.profiles
  add column profile_public_consent boolean not null default false,
  add column profile_public_consent_at timestamptz;

update public.profiles
set is_public = false,
    profile_public_consent = false,
    profile_public_consent_at = null;

alter table public.profiles
  alter column is_public set default false,
  add constraint profiles_public_requires_consent
    check (not is_public or profile_public_consent);

create or replace function public.enforce_profile_public_consent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_public is distinct from old.is_public then
    new.profile_public_consent := new.is_public;
    new.profile_public_consent_at := now();
  elsif new.profile_public_consent is distinct from old.profile_public_consent then
    if not new.profile_public_consent then
      new.is_public := false;
    end if;
    new.profile_public_consent_at := now();
  end if;

  if new.is_public and not new.profile_public_consent then
    raise exception 'Public profiles require the member''s consent';
  end if;

  return new;
end;
$$;

create trigger enforce_profile_public_consent
  before update on public.profiles
  for each row execute procedure public.enforce_profile_public_consent();

drop policy if exists "Public profiles are viewable" on public.profiles;
drop policy if exists "Profiles are publicly viewable" on public.profiles;
create policy "Consented public profiles are viewable"
  on public.profiles for select
  using (is_public and profile_public_consent);

drop policy if exists "Public portfolio items are viewable" on public.profile_portfolio_items;
create policy "Consented public portfolio items are viewable"
  on public.profile_portfolio_items for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = user_id
        and p.is_public
        and p.profile_public_consent
    )
    or user_id = (select auth.uid())
  );

drop policy if exists "Public certificates are viewable" on public.profile_certificates;
create policy "Consented public certificates are viewable"
  on public.profile_certificates for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = user_id
        and p.is_public
        and p.profile_public_consent
    )
    or user_id = (select auth.uid())
  );

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
    and p.is_public
    and p.profile_public_consent;
$$;

create or replace function public.has_suspicious_link(p_content text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    p_content ~* '(^|[^[:alnum:].-])(bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd|rb\.gy|cutt\.ly|ow\.ly)(/|[^[:alnum:].-]|$)'
    or p_content ~* 'https?://([0-9]{1,3}\.){3}[0-9]{1,3}([/:]|$)'
    or p_content ~* 'https?://[^[:space:]]*@'
    or p_content ~* '\.(tk|ml|ga|cf|gq|click|zip)([^[:alnum:]]|$)',
    false
  );
$$;

revoke all on function public.has_suspicious_link(text) from public, anon, authenticated;

create table public.trust_safety_signals (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('post', 'comment', 'opportunity')),
  target_id uuid not null,
  signal_type text not null check (signal_type = 'suspicious_link'),
  status text not null default 'open'
    check (status in ('open', 'in_review', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  resolution_note text not null default '' check (char_length(resolution_note) <= 2000),
  unique (target_type, target_id, signal_type)
);

create index trust_safety_signals_queue_order
  on public.trust_safety_signals (created_at desc)
  where status in ('open', 'in_review');

alter table public.trust_safety_signals enable row level security;
revoke all on public.trust_safety_signals from public, anon, authenticated;

create or replace function public.stamp_trust_safety_signal_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.current_user_role() is distinct from 'administrator' then
    raise exception 'Only administrators can resolve trust safety signals';
  end if;

  if new.status is distinct from old.status
    or new.resolution_note is distinct from old.resolution_note then
    new.reviewed_by := (select auth.uid());
    new.reviewed_at := now();
  end if;

  return new;
end;
$$;

revoke all on function public.stamp_trust_safety_signal_review() from public, anon, authenticated;

create trigger stamp_trust_safety_signal_review
  before update on public.trust_safety_signals
  for each row execute procedure public.stamp_trust_safety_signal_review();

create function public.audit_trust_safety_signal_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    insert into public.admin_audit_log (actor_id, action, target_type, target_id, details)
    values (
      auth.uid(),
      'trust_signal_' || new.status,
      'trust_signal',
      new.id,
      jsonb_build_object('target_type', new.target_type, 'target_id', new.target_id)
    );
  end if;
  return new;
end;
$$;

revoke all on function public.audit_trust_safety_signal_review()
  from public, anon, authenticated;

create trigger audit_trust_safety_signal_review
  after update on public.trust_safety_signals
  for each row execute procedure public.audit_trust_safety_signal_review();

create policy "Administrators review trust safety signals"
  on public.trust_safety_signals for select to authenticated
  using (public.current_user_role() = 'administrator');

create policy "Administrators resolve trust safety signals"
  on public.trust_safety_signals for update to authenticated
  using (public.current_user_role() = 'administrator')
  with check (public.current_user_role() = 'administrator');

grant select on public.trust_safety_signals to authenticated;
grant update (status, reviewed_by, reviewed_at, resolution_note)
  on public.trust_safety_signals to authenticated;

create or replace function public.record_suspicious_link_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  content_to_check text;
  signal_target_type text;
  content_changed boolean := true;
begin
  if tg_table_name = 'posts' then
    signal_target_type := 'post';
    content_to_check := new.content;
    if tg_op = 'INSERT' then
      content_changed := true;
    else
      content_changed := new.content is distinct from old.content;
    end if;
  elsif tg_table_name = 'comments' then
    signal_target_type := 'comment';
    content_to_check := new.content;
    if tg_op = 'INSERT' then
      content_changed := true;
    else
      content_changed := new.content is distinct from old.content;
    end if;
  elsif tg_table_name = 'opportunities' then
    signal_target_type := 'opportunity';
    content_to_check := concat_ws(' ', new.title, new.description, new.requirements, new.contact_email, new.location);
    if tg_op = 'INSERT' then
      content_changed := true;
    else
      content_changed := new.title is distinct from old.title
        or new.description is distinct from old.description
        or new.requirements is distinct from old.requirements
        or new.contact_email is distinct from old.contact_email
        or new.location is distinct from old.location;
    end if;
  else
    raise exception 'Unsupported trust safety signal source';
  end if;

  if content_changed and public.has_suspicious_link(content_to_check) then
    delete from public.trust_safety_signals
    where target_type = signal_target_type
      and target_id = new.id
      and signal_type = 'suspicious_link';

    insert into public.trust_safety_signals (target_type, target_id, signal_type)
    values (signal_target_type, new.id, 'suspicious_link')
    on conflict (target_type, target_id, signal_type) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.record_suspicious_link_signal() from public, anon, authenticated;

create trigger record_post_suspicious_link
  before insert or update on public.posts
  for each row execute procedure public.record_suspicious_link_signal();

create trigger record_comment_suspicious_link
  before insert or update on public.comments
  for each row execute procedure public.record_suspicious_link_signal();

create trigger record_opportunity_suspicious_link
  before insert or update on public.opportunities
  for each row execute procedure public.record_suspicious_link_signal();

insert into public.trust_safety_signals (target_type, target_id, signal_type)
select 'post', p.id, 'suspicious_link'
from public.posts p
where public.has_suspicious_link(p.content)
union
select 'comment', c.id, 'suspicious_link'
from public.comments c
where public.has_suspicious_link(c.content)
union
select 'opportunity', o.id, 'suspicious_link'
from public.opportunities o
where public.has_suspicious_link(
  concat_ws(' ', o.title, o.description, o.requirements, o.contact_email, o.location)
)
on conflict (target_type, target_id, signal_type) do nothing;

update public.content_reports set resolution_note = '' where resolution_note is null;
update public.message_user_reports set resolution_note = '' where resolution_note is null;

alter table public.content_reports
  drop constraint if exists content_reports_target_type_check,
  drop constraint if exists content_reports_status_check,
  add constraint content_reports_target_type_check
    check (target_type in ('post', 'comment', 'profile', 'opportunity')),
  add constraint content_reports_status_check
    check (status in ('open', 'in_review', 'resolved', 'dismissed')),
  alter column resolution_note set default '',
  alter column resolution_note set not null;

alter table public.message_user_reports
  drop constraint if exists message_user_reports_status_check,
  add constraint message_user_reports_status_check
    check (status in ('open', 'in_review', 'resolved', 'dismissed')),
  alter column resolution_note set default '',
  alter column resolution_note set not null;

create index message_user_reports_queue_order
  on public.message_user_reports (created_at desc)
  where status in ('open', 'in_review');

create or replace function public.validate_content_report_target()
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
  elsif new.target_type = 'opportunity' and not exists (
    select 1 from public.opportunities where id = new.target_id
  ) then
    raise exception 'The reported opportunity does not exist';
  end if;

  return new;
end;
$$;

revoke insert on public.content_reports from authenticated;
grant insert (reporter_id, target_type, target_id, reason)
  on public.content_reports to authenticated;

revoke insert on public.message_user_reports from authenticated;
grant insert (reporter_id, reported_user_id, reason, details)
  on public.message_user_reports to authenticated;

create table public.company_verification_documents (
  company_id uuid primary key references public.companies (id) on delete cascade,
  submitted_by uuid not null references public.profiles (id) on delete cascade,
  business_name text not null check (char_length(trim(business_name)) between 1 and 160),
  registration_type text not null
    check (registration_type in ('business', 'nonprofit', 'public_body', 'other')),
  registration_number text not null
    check (char_length(trim(registration_number)) between 1 and 120),
  document_path text not null unique,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    document_path ~ (
      '^' || submitted_by::text || '/' || company_id::text || '/[0-9a-f-]{36}\.pdf$'
    )
  )
);

create index company_verification_documents_order
 on public.company_verification_documents (submitted_at desc);

create or replace function public.owns_uploaded_verification_document(p_document_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and p_document_path like ((select auth.uid())::text || '/%')
    and exists (
      select 1 from storage.objects so
      where so.bucket_id = 'talantalink-verification-documents'
        and so.name = p_document_path
    );
$$;

revoke all on function public.owns_uploaded_verification_document(text) from public, anon;
grant execute on function public.owns_uploaded_verification_document(text) to authenticated;

alter table public.company_verification_documents enable row level security;
revoke all on public.company_verification_documents from public, anon, authenticated;

create policy "Company owners view their verification documents"
  on public.company_verification_documents for select to authenticated
  using (
    exists (
      select 1 from public.companies c
      where c.id = company_id
        and c.owner_id = (select auth.uid())
        and submitted_by = (select auth.uid())
    )
  );

create policy "Administrators view company verification documents"
  on public.company_verification_documents for select to authenticated
  using (public.current_user_role() = 'administrator');

create policy "Employers submit company verification documents"
  on public.company_verification_documents for insert to authenticated
  with check (
    submitted_by = (select auth.uid())
    and public.current_user_role() in ('employer', 'recruiter')
    and exists (
      select 1 from public.companies c
      where c.id = company_id
        and c.owner_id = (select auth.uid())
        and not c.is_verified
    )
    and public.owns_uploaded_verification_document(document_path)
  );

create policy "Company owners update unverified company documents"
  on public.company_verification_documents for update to authenticated
  using (
    submitted_by = (select auth.uid())
    and exists (
      select 1 from public.companies c
      where c.id = company_id
        and c.owner_id = (select auth.uid())
        and not c.is_verified
    )
  )
  with check (
    submitted_by = (select auth.uid())
    and public.current_user_role() in ('employer', 'recruiter')
    and exists (
      select 1 from public.companies c
      where c.id = company_id
        and c.owner_id = (select auth.uid())
        and not c.is_verified
    )
    and public.owns_uploaded_verification_document(document_path)
  );

grant select on public.company_verification_documents to authenticated;
grant insert (
  company_id,
  submitted_by,
  business_name,
  registration_type,
  registration_number,
  document_path
) on public.company_verification_documents to authenticated;
grant update (
  business_name,
  registration_type,
  registration_number,
  document_path
) on public.company_verification_documents to authenticated;

create or replace function public.update_company_verification_document_timestamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger update_company_verification_document_timestamp
  before update on public.company_verification_documents
  for each row execute procedure public.update_company_verification_document_timestamp();

revoke all on function public.update_company_verification_document_timestamp()
  from public, anon, authenticated;

create or replace function public.require_company_verification_evidence()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_verified and not old.is_verified
    and not exists (
      select 1 from public.company_verification_documents d
      where d.company_id = new.id
    ) then
    raise exception 'Verification documents are required before approving an employer';
  end if;
  return new;
end;
$$;

create trigger require_company_verification_evidence
  before update of is_verified on public.companies
  for each row execute procedure public.require_company_verification_evidence();

revoke all on function public.require_company_verification_evidence()
  from public, anon, authenticated;

create or replace function public.is_company_verified(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.companies c
    where c.id = p_company_id
      and c.is_verified
  );
$$;

revoke all on function public.is_company_verified(uuid) from public;
grant execute on function public.is_company_verified(uuid) to anon, authenticated;

create policy "Only verified employers publish opportunities"
  on public.opportunities as restrictive for insert to authenticated
  with check (
    status <> 'published'
    or public.is_company_verified(company_id)
  );

create policy "Only verified employers maintain published opportunities"
  on public.opportunities as restrictive for update to authenticated
  using (true)
  with check (
    status <> 'published'
    or public.is_company_verified(company_id)
  );

create policy "Only verified employers expose published opportunities"
  on public.opportunities as restrictive for select to anon, authenticated
  using (
    status <> 'published'
    or public.is_company_verified(company_id)
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'talantalink-verification-documents',
  'talantalink-verification-documents',
  false,
  5242880,
  array['application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Employers upload their own verification documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'talantalink-verification-documents'
    and name ~ (
      '^' || (select auth.uid())::text || '/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'
    )
    and exists (
      select 1 from public.companies c
      where c.id::text = (storage.foldername(name))[2]
        and c.owner_id = (select auth.uid())
    )
    and public.current_user_role() in ('employer', 'recruiter')
  );

create policy "Verification documents are visible only to owners and administrators"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'talantalink-verification-documents'
    and exists (
      select 1 from public.company_verification_documents v
      where v.document_path = name
        and (
          v.submitted_by = (select auth.uid())
          or public.current_user_role() = 'administrator'
        )
    )
  );

create policy "Employers remove unused verification documents"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'talantalink-verification-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (
      select 1 from public.company_verification_documents v
      where v.document_path = name
    )
  );

create table public.trust_safety_rate_limits (
  actor_id uuid not null references public.profiles (id) on delete cascade,
  action text not null check (action in (
    'post', 'comment', 'opportunity', 'application',
    'content_report', 'user_report', 'message'
  )),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (actor_id, action, window_started_at)
);

create index trust_safety_rate_limits_expiry
  on public.trust_safety_rate_limits (window_started_at);

alter table public.trust_safety_rate_limits enable row level security;
revoke all on public.trust_safety_rate_limits from public, anon, authenticated;

create or replace function public.consume_trust_safety_rate_limit(
  p_actor_id uuid,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_limit integer;
  window_seconds integer;
  bucket_start timestamptz;
  updated_count integer;
begin
  if auth.uid() is null or p_actor_id is distinct from auth.uid() then
    raise exception 'A valid member session is required';
  end if;

  case p_action
    when 'post' then request_limit := 10; window_seconds := 3600;
    when 'comment' then request_limit := 50; window_seconds := 3600;
    when 'opportunity' then request_limit := 5; window_seconds := 86400;
    when 'application' then request_limit := 20; window_seconds := 86400;
    when 'content_report' then request_limit := 8; window_seconds := 86400;
    when 'user_report' then request_limit := 8; window_seconds := 86400;
    when 'message' then request_limit := 60; window_seconds := 3600;
    else raise exception 'Unsupported trust safety rate limit action';
  end case;

  bucket_start := to_timestamp(
    floor(extract(epoch from statement_timestamp()) / window_seconds) * window_seconds
  );

  insert into public.trust_safety_rate_limits as limits (
    actor_id, action, window_started_at, request_count
  )
  values (p_actor_id, p_action, bucket_start, 1)
  on conflict (actor_id, action, window_started_at)
  do update set request_count = limits.request_count + 1
  where limits.request_count < request_limit
  returning request_count into updated_count;

  if updated_count is null then
    raise exception using
      errcode = 'P0001',
      message = 'Rate limit exceeded. Please try again later.';
  end if;

  delete from public.trust_safety_rate_limits
  where window_started_at < statement_timestamp() - interval '2 days';
end;
$$;

create or replace function public.enforce_trust_safety_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rate_actor_id uuid;
  rate_action text;
begin
  if tg_table_name = 'posts' then
    rate_actor_id := new.user_id;
    rate_action := 'post';
  elsif tg_table_name = 'comments' then
    rate_actor_id := new.user_id;
    rate_action := 'comment';
  elsif tg_table_name = 'opportunities' then
    select c.owner_id into rate_actor_id
    from public.companies c
    where c.id = new.company_id;
    rate_action := 'opportunity';
  elsif tg_table_name = 'applications' then
    rate_actor_id := new.applicant_id;
    rate_action := 'application';
  elsif tg_table_name = 'content_reports' then
    rate_actor_id := new.reporter_id;
    rate_action := 'content_report';
  elsif tg_table_name = 'message_user_reports' then
    rate_actor_id := new.reporter_id;
    rate_action := 'user_report';
  elsif tg_table_name = 'messages' then
    rate_actor_id := new.sender_id;
    rate_action := 'message';
  else
    raise exception 'Unsupported trust safety rate limit source';
  end if;

  perform public.consume_trust_safety_rate_limit(rate_actor_id, rate_action);
  return new;
end;
$$;

revoke all on function public.consume_trust_safety_rate_limit(uuid, text)
  from public, anon, authenticated;
revoke all on function public.enforce_trust_safety_rate_limit()
  from public, anon, authenticated;

create trigger trust_safety_rate_limit_posts
  before insert on public.posts
  for each row execute procedure public.enforce_trust_safety_rate_limit();

create trigger trust_safety_rate_limit_comments
  before insert on public.comments
  for each row execute procedure public.enforce_trust_safety_rate_limit();

create trigger trust_safety_rate_limit_opportunities
  before insert on public.opportunities
  for each row execute procedure public.enforce_trust_safety_rate_limit();

create trigger trust_safety_rate_limit_applications
  before insert on public.applications
  for each row execute procedure public.enforce_trust_safety_rate_limit();

create trigger trust_safety_rate_limit_content_reports
  before insert on public.content_reports
  for each row execute procedure public.enforce_trust_safety_rate_limit();

create trigger trust_safety_rate_limit_user_reports
  before insert on public.message_user_reports
  for each row execute procedure public.enforce_trust_safety_rate_limit();

create trigger trust_safety_rate_limit_messages
  before insert on public.messages
  for each row execute procedure public.enforce_trust_safety_rate_limit();
