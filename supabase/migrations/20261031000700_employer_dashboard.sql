alter type public.application_status add value if not exists 'shortlisted';

drop policy if exists "Employer roles update application status" on public.applications;
create policy "Employer roles update application status"
  on public.applications for update to authenticated
  using (
    public.current_user_role() in ('employer', 'recruiter', 'administrator')
    and exists (
      select 1
      from public.opportunities o
      join public.companies c on c.id = o.company_id
      where o.id = opportunity_id and c.owner_id = (select auth.uid())
    )
  )
  with check (
    status::text in ('submitted', 'reviewing', 'shortlisted', 'accepted', 'rejected')
    and public.current_user_role() in ('employer', 'recruiter', 'administrator')
    and exists (
      select 1
      from public.opportunities o
      join public.companies c on c.id = o.company_id
      where o.id = opportunity_id and c.owner_id = (select auth.uid())
    )
  );

alter table public.companies
  add column if not exists verification_requested_at timestamptz,
  add column if not exists logo_storage_path text,
  add constraint companies_logo_path_owner
    check (
      logo_storage_path is null
      or logo_storage_path ~ (
        '^' || owner_id::text || '/' || id::text || '/[0-9a-f-]{36}\.(jpg|png|webp|avif)$'
      )
    );

grant update (verification_requested_at, logo_storage_path)
  on public.companies to authenticated;

create policy "Employer roles create organization profiles"
  on public.companies as restrictive for insert to authenticated
  with check (public.current_user_role() in ('employer', 'recruiter', 'administrator'));

create policy "Employer roles update organization profiles"
  on public.companies as restrictive for update to authenticated
  using (public.current_user_role() in ('employer', 'recruiter', 'administrator'))
  with check (public.current_user_role() in ('employer', 'recruiter', 'administrator'));

create table public.employer_recruitment_activities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  opportunity_id uuid references public.opportunities (id) on delete set null,
  application_id uuid references public.applications (id) on delete set null,
  actor_id uuid references public.profiles (id) on delete set null,
  activity_type text not null check (activity_type in (
    'company_profile_created',
    'company_profile_updated',
    'verification_requested',
    'opportunity_created',
    'opportunity_published',
    'opportunity_closed',
    'application_received',
    'application_reviewing',
    'application_shortlisted',
    'application_approved',
    'application_rejected'
  )),
  created_at timestamptz not null default now()
);

create index employer_recruitment_activities_company_order
  on public.employer_recruitment_activities (company_id, created_at desc);
create index employer_recruitment_activities_application
  on public.employer_recruitment_activities (application_id, created_at desc);

alter table public.employer_recruitment_activities enable row level security;

create policy "Company owners view their recruitment activity"
  on public.employer_recruitment_activities for select to authenticated
  using (
    exists (
      select 1 from public.companies c
      where c.id = company_id and c.owner_id = (select auth.uid())
    )
  );

grant select on public.employer_recruitment_activities to authenticated;

create function public.record_employer_recruitment_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  company uuid;
  action text;
  target_opportunity uuid;
  target_application uuid;
begin
  if tg_table_name = 'applications' then
    target_application := new.id;
    target_opportunity := new.opportunity_id;
    select o.company_id into company
    from public.opportunities o
    where o.id = new.opportunity_id;

    if tg_op = 'INSERT' then
      action := 'application_received';
    elsif new.status is distinct from old.status then
      action := case new.status::text
        when 'reviewing' then 'application_reviewing'
        when 'shortlisted' then 'application_shortlisted'
        when 'accepted' then 'application_approved'
        when 'rejected' then 'application_rejected'
        else null
      end;
    end if;
  elsif tg_table_name = 'opportunities' then
    company := new.company_id;
    target_opportunity := new.id;
    if tg_op = 'INSERT' then
      action := 'opportunity_created';
      if new.status = 'published' then
        insert into public.employer_recruitment_activities
          (company_id, opportunity_id, actor_id, activity_type)
        values (company, target_opportunity, auth.uid(), 'opportunity_published');
      end if;
    elsif new.status is distinct from old.status then
      action := case new.status::text
        when 'published' then 'opportunity_published'
        when 'closed' then 'opportunity_closed'
        else null
      end;
    end if;
  elsif tg_table_name = 'companies' then
    company := new.id;
    if tg_op = 'INSERT' then
      action := 'company_profile_created';
    else
      if old.verification_requested_at is null and new.verification_requested_at is not null then
        action := 'verification_requested';
      elsif new.name is distinct from old.name
        or new.description is distinct from old.description
        or new.website is distinct from old.website
        or new.logo_url is distinct from old.logo_url then
        action := 'company_profile_updated';
      end if;
    end if;
  end if;

  if action is not null then
    insert into public.employer_recruitment_activities
      (company_id, opportunity_id, application_id, actor_id, activity_type)
    values (company, target_opportunity, target_application, auth.uid(), action);
  end if;

  return new;
end;
$$;

create trigger record_employer_application_activity
  after insert or update of status on public.applications
  for each row execute procedure public.record_employer_recruitment_activity();

create trigger record_employer_opportunity_activity
  after insert or update of status on public.opportunities
  for each row execute procedure public.record_employer_recruitment_activity();

create trigger record_employer_company_activity
  after insert or update on public.companies
  for each row execute procedure public.record_employer_recruitment_activity();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'talantalink-company-logos',
  'talantalink-company-logos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Company logos are publicly readable"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'talantalink-company-logos');

create policy "Company owners upload logos to their company folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'talantalink-company-logos'
    and public.current_user_role() in ('employer', 'recruiter', 'administrator')
    and exists (
      select 1 from public.companies c
      where c.owner_id = (select auth.uid())
        and (storage.foldername(name))[1] = c.owner_id::text
        and (storage.foldername(name))[2] = c.id::text
    )
  );

create policy "Company owners delete their company logos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'talantalink-company-logos'
    and public.current_user_role() in ('employer', 'recruiter', 'administrator')
    and exists (
      select 1 from public.companies c
      where c.owner_id = (select auth.uid())
        and (storage.foldername(name))[1] = c.owner_id::text
        and (storage.foldername(name))[2] = c.id::text
    )
  );

create or replace function public.request_applicant_connection(target_application_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  employer uuid := auth.uid();
  applicant uuid;
  connection_id uuid;
begin
  if employer is null
    or coalesce(public.current_user_role() not in ('employer', 'recruiter', 'administrator'), true) then
    raise exception 'Employer access is required';
  end if;

  select a.applicant_id into applicant
  from public.applications a
  join public.opportunities o on o.id = a.opportunity_id
  join public.companies c on c.id = o.company_id
  where a.id = target_application_id
    and c.owner_id = employer;

  if applicant is null then
    raise exception 'Application not found for an organization you manage';
  end if;
  if public.is_message_pair_blocked(employer, applicant) then
    raise exception 'Messaging is unavailable for this member';
  end if;
  if exists (
    select 1 from public.connections
    where status = 'accepted'
      and (
        (requester_id = employer and receiver_id = applicant)
        or (requester_id = applicant and receiver_id = employer)
      )
  ) then
    raise exception 'You are already connected to this applicant';
  end if;
  if exists (
    select 1 from public.connections
    where status = 'pending'
      and (
        (requester_id = employer and receiver_id = applicant)
        or (requester_id = applicant and receiver_id = employer)
      )
  ) then
    raise exception 'A connection request is already pending';
  end if;
  delete from public.connections
  where status = 'rejected'
    and (
      (requester_id = employer and receiver_id = applicant)
      or (requester_id = applicant and receiver_id = employer)
    );

  insert into public.connections (requester_id, receiver_id, status)
  values (employer, applicant, 'pending')
  on conflict do nothing
  returning id into connection_id;

  if connection_id is null then
    select id into connection_id
    from public.connections
    where (requester_id = employer and receiver_id = applicant)
       or (requester_id = applicant and receiver_id = employer)
    limit 1;
  end if;
  return connection_id;
end;
$$;

revoke all on function public.request_applicant_connection(uuid) from public, anon;
grant execute on function public.request_applicant_connection(uuid) to authenticated;
