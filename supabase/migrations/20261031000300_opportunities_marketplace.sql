alter type public.opportunity_type add value if not exists 'audition';
alter type public.opportunity_type add value if not exists 'internship';
alter type public.opportunity_type add value if not exists 'competition';
alter type public.opportunity_type add value if not exists 'freelance_gig';

alter table public.opportunities
  add column if not exists requirements text,
  add column if not exists location text,
  add column if not exists contact_email text;

update public.opportunities
set requirements = coalesce(nullif(trim(requirements), ''), 'Details provided by the organizer.'),
    location = coalesce(nullif(trim(location), ''), 'Kenya'),
    deadline = coalesce(deadline, created_at + interval '30 days'),
    contact_email = coalesce(
      nullif(trim(contact_email), ''),
      (select u.email from public.companies c
       join auth.users u on u.id = c.owner_id
       where c.id = opportunities.company_id),
      'contact@example.invalid'
    ),
    compensation = case
      when type::text in ('job', 'internship', 'freelance_gig', 'sponsorship')
        then coalesce(nullif(trim(compensation), ''), 'To be discussed')
      else compensation
    end;

alter table public.opportunities
  alter column requirements set not null,
  alter column location set not null,
  alter column contact_email set not null,
  add constraint opportunities_requirements_length
    check (char_length(trim(requirements)) between 1 and 5000),
  add constraint opportunities_location_length
    check (char_length(trim(location)) between 1 and 200),
  add constraint opportunities_contact_email_valid
    check (contact_email ~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'),
  add constraint opportunities_deadline_required
    check (deadline is not null),
  add constraint opportunities_compensation_required_when_applicable
    check (
      type::text not in ('job', 'internship', 'freelance_gig', 'sponsorship')
      or (compensation is not null and char_length(trim(compensation)) > 0)
    );

create table public.opportunity_application_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  applicant_id uuid not null references public.profiles (id) on delete cascade,
  document_type text not null check (document_type in ('cv', 'portfolio')),
  file_name text not null check (char_length(file_name) between 1 and 180),
  storage_path text not null unique,
  mime_type text not null check (
    mime_type in (
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/webp'
    )
  ),
  created_at timestamptz not null default now(),
  unique (application_id, document_type),
  check (storage_path ~ (
    '^' || applicant_id::text || '/' || application_id::text || '/[A-Za-z0-9._-]{1,120}$'
  ))
);

create index opportunity_application_documents_application
  on public.opportunity_application_documents (application_id);

alter table public.opportunity_application_documents enable row level security;

drop policy if exists "Company owners create opportunities" on public.opportunities;
drop policy if exists "Employers and recruiters create opportunities" on public.opportunities;
drop policy if exists "Company owners update opportunities" on public.opportunities;
drop policy if exists "Employers and recruiters update opportunities" on public.opportunities;
drop policy if exists "Company owners delete opportunities" on public.opportunities;
drop policy if exists "Employers and recruiters delete opportunities" on public.opportunities;

create policy "Employer roles create opportunities"
  on public.opportunities for insert to authenticated
  with check (
    public.current_user_role() in ('employer', 'recruiter', 'administrator')
    and exists (
      select 1 from public.companies c
      where c.id = company_id and c.owner_id = (select auth.uid())
    )
  );

create policy "Employer roles update opportunities"
  on public.opportunities for update to authenticated
  using (
    public.current_user_role() in ('employer', 'recruiter', 'administrator')
    and exists (
      select 1 from public.companies c
      where c.id = company_id and c.owner_id = (select auth.uid())
    )
  )
  with check (
    public.current_user_role() in ('employer', 'recruiter', 'administrator')
    and exists (
      select 1 from public.companies c
      where c.id = company_id and c.owner_id = (select auth.uid())
    )
  );

create policy "Employer roles delete opportunities"
  on public.opportunities for delete to authenticated
  using (
    public.current_user_role() in ('employer', 'recruiter', 'administrator')
    and exists (
      select 1 from public.companies c
      where c.id = company_id and c.owner_id = (select auth.uid())
    )
  );

drop policy if exists "Users apply as themselves" on public.applications;
drop policy if exists "Talent apply as themselves" on public.applications;
drop policy if exists "Applicants withdraw their applications" on public.applications;
drop policy if exists "Company owners update application status" on public.applications;
drop policy if exists "Employer and recruiter owners update application status" on public.applications;

create policy "Talent apply to published opportunities"
  on public.applications for insert to authenticated
  with check (
    applicant_id = (select auth.uid())
    and public.current_user_role() = 'talent'
    and status = 'submitted'
    and exists (
      select 1 from public.opportunities o
      where o.id = opportunity_id
        and o.status = 'published'
        and o.deadline > now()
    )
  );

create policy "Employer roles update application status"
  on public.applications for update to authenticated
  using (
    public.current_user_role() in ('employer', 'recruiter', 'administrator')
    and exists (
      select 1 from public.opportunities o
      join public.companies c on c.id = o.company_id
      where o.id = opportunity_id and c.owner_id = (select auth.uid())
    )
  )
  with check (
    status in ('submitted', 'reviewing', 'accepted', 'rejected')
    and public.current_user_role() in ('employer', 'recruiter', 'administrator')
    and exists (
      select 1 from public.opportunities o
      join public.companies c on c.id = o.company_id
      where o.id = opportunity_id and c.owner_id = (select auth.uid())
    )
  );

create policy "Applicants view their application documents"
  on public.opportunity_application_documents for select to authenticated
  using (applicant_id = (select auth.uid()));

create policy "Opportunity owners view applicant documents"
  on public.opportunity_application_documents for select to authenticated
  using (
    public.current_user_role() in ('employer', 'recruiter', 'administrator')
    and exists (
      select 1
      from public.applications a
      join public.opportunities o on o.id = a.opportunity_id
      join public.companies c on c.id = o.company_id
      where a.id = application_id and c.owner_id = (select auth.uid())
    )
  );

create policy "Talent attach documents to their applications"
  on public.opportunity_application_documents for insert to authenticated
  with check (
    applicant_id = (select auth.uid())
    and public.current_user_role() = 'talent'
    and exists (
      select 1 from public.applications a
      where a.id = application_id
        and a.applicant_id = (select auth.uid())
        and a.status = 'submitted'
    )
    and storage_path like (
      (select auth.uid())::text || '/' || application_id::text || '/%'
    )
    and exists (
      select 1 from storage.objects so
      where so.bucket_id = 'talantalink-application-files'
        and so.name = storage_path
    )
  );

revoke insert, update, delete on public.opportunity_application_documents from authenticated;
grant select, insert (
  application_id,
  applicant_id,
  document_type,
  file_name,
  storage_path,
  mime_type
) on public.opportunity_application_documents to authenticated;

revoke insert, update, delete on public.applications from authenticated;
grant insert (opportunity_id, applicant_id, message, status),
  update (status),
  delete on public.applications to authenticated;

create policy "Talent withdraw submitted applications"
  on public.applications for delete to authenticated
  using (
    applicant_id = (select auth.uid())
    and public.current_user_role() = 'talent'
    and status = 'submitted'
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'talantalink-application-files',
  'talantalink-application-files',
  false,
  15728640,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Applicants upload files for their applications"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'talantalink-application-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.applications a
      where a.id::text = (storage.foldername(name))[2]
        and a.applicant_id = (select auth.uid())
        and a.status = 'submitted'
        and public.current_user_role() = 'talent'
    )
  );

create policy "Application participants read application files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'talantalink-application-files'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1
        from public.opportunity_application_documents d
        join public.applications a on a.id = d.application_id
        join public.opportunities o on o.id = a.opportunity_id
        join public.companies c on c.id = o.company_id
        where d.storage_path = name
          and c.owner_id = (select auth.uid())
          and public.current_user_role() in ('employer', 'recruiter', 'administrator')
      )
    )
  );

create policy "Applicants delete their application files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'talantalink-application-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
