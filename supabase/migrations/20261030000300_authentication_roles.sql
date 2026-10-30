alter table public.profiles
  add column if not exists role text not null default 'talent'
    check (role in ('talent', 'employer', 'recruiter', 'administrator')),
  add column if not exists onboarding_complete boolean not null default false;

alter table public.profiles
  add constraint profiles_completed_onboarding
    check (
      not onboarding_complete
      or (
        char_length(trim(display_name)) > 0
        and char_length(trim(headline)) > 0
        and county_id is not null
      )
    );

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_role text := new.raw_user_meta_data ->> 'role';
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'New talent'),
    case
      when selected_role in ('employer', 'recruiter') then selected_role
      else 'talent'
    end
  );
  return new;
end;
$$;

revoke insert, update on public.profiles from authenticated;
grant update (display_name, headline, bio, county_id, avatar_url, onboarding_complete)
  on public.profiles to authenticated;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid())
$$;

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;

drop policy if exists "Users create companies they own" on public.companies;
create policy "Employers and recruiters create companies they own" on public.companies
  for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and is_verified = false
    and public.current_user_role() in ('employer', 'recruiter', 'administrator')
  );

drop policy if exists "Company owners update their companies" on public.companies;
create policy "Employers and recruiters update their companies" on public.companies
  for update to authenticated
  using (
    public.current_user_role() in ('employer', 'recruiter', 'administrator')
    and (select auth.uid()) = owner_id
  )
  with check (
    public.current_user_role() in ('employer', 'recruiter', 'administrator')
    and (select auth.uid()) = owner_id
  );

drop policy if exists "Company owners delete their companies" on public.companies;
create policy "Employers and recruiters delete their companies" on public.companies
  for delete to authenticated
  using (
    public.current_user_role() in ('employer', 'recruiter', 'administrator')
    and (select auth.uid()) = owner_id
  );

drop policy if exists "Company owners create opportunities" on public.opportunities;
create policy "Employers and recruiters create opportunities" on public.opportunities
  for insert to authenticated
  with check (
    public.current_user_role() in ('employer', 'recruiter', 'administrator')
    and exists (
      select 1 from public.companies c
      where c.id = company_id and c.owner_id = (select auth.uid())
    )
  );

drop policy if exists "Company owners update opportunities" on public.opportunities;
create policy "Employers and recruiters update opportunities" on public.opportunities
  for update to authenticated
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

drop policy if exists "Company owners delete opportunities" on public.opportunities;
create policy "Employers and recruiters delete opportunities" on public.opportunities
  for delete to authenticated
  using (
    public.current_user_role() in ('employer', 'recruiter', 'administrator')
    and exists (
      select 1 from public.companies c
      where c.id = company_id and c.owner_id = (select auth.uid())
    )
  );

drop policy if exists "Users apply as themselves" on public.applications;
create policy "Talent apply as themselves" on public.applications
  for insert to authenticated
  with check (
    (select auth.uid()) = applicant_id
    and public.current_user_role() = 'talent'
    and status = 'submitted'
    and exists (
      select 1 from public.opportunities o
      where o.id = opportunity_id and o.status = 'published'
    )
  );

drop policy if exists "Company owners update application status" on public.applications;
create policy "Employer and recruiter owners update application status" on public.applications
  for update to authenticated
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
    status in ('submitted', 'reviewing', 'accepted', 'rejected')
    and public.current_user_role() in ('employer', 'recruiter', 'administrator')
    and exists (
      select 1
      from public.opportunities o
      join public.companies c on c.id = o.company_id
      where o.id = opportunity_id and c.owner_id = (select auth.uid())
    )
  );

drop policy if exists "Users manage their own talent profiles" on public.talent_profiles;
create policy "Talent manage their own talent profiles" on public.talent_profiles
  for all to authenticated
  using (
    (select auth.uid()) = user_id
    and public.current_user_role() = 'talent'
  )
  with check (
    (select auth.uid()) = user_id
    and public.current_user_role() = 'talent'
  );

drop policy if exists "Company owners manage advertisements" on public.advertisements;
create policy "Employers and recruiters manage advertisements" on public.advertisements
  for all to authenticated
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

drop policy if exists "Company owners view campaign metrics" on public.advertisement_events;
create policy "Employers and recruiters view campaign metrics" on public.advertisement_events
  for select to authenticated
  using (
    public.current_user_role() in ('employer', 'recruiter', 'administrator')
    and exists (
      select 1
      from public.advertisements a
      join public.companies c on c.id = a.company_id
      where a.id = advertisement_id and c.owner_id = (select auth.uid())
    )
  );
