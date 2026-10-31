insert into public.talent_categories (name) values
  ('Music'),
  ('Sports'),
  ('Acting'),
  ('Dancing'),
  ('Photography'),
  ('Technology'),
  ('Art'),
  ('Fashion'),
  ('Writing'),
  ('Entrepreneurship'),
  ('Other skills')
on conflict (name) do nothing;

alter table public.profiles
  add column primary_category_id uuid
    references public.talent_categories (id) on delete set null,
  add column search_document tsvector generated always as (
    to_tsvector(
      'simple'::regconfig,
      coalesce(display_name, '') || ' ' ||
      coalesce(headline, '') || ' ' ||
      coalesce(bio, '') || ' ' ||
      coalesce(array_to_string(skills, ' '), '')
    )
  ) stored;

create index profiles_primary_category_id_idx
  on public.profiles (primary_category_id);
create index profiles_county_id_idx
  on public.profiles (county_id);
create index profiles_availability_status_idx
  on public.profiles (availability_status);
create index profiles_experience_years_idx
  on public.profiles (experience_years);
create index profiles_skills_idx
  on public.profiles using gin (skills);
create index profiles_search_document_idx
  on public.profiles using gin (search_document);
