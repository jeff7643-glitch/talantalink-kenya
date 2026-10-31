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
  add column search_document tsvector not null default ''::tsvector;

create function public.refresh_profile_search_document()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search_document := pg_catalog.to_tsvector(
    'simple'::pg_catalog.regconfig,
    coalesce(new.display_name, '') || ' ' ||
    coalesce(new.headline, '') || ' ' ||
    coalesce(new.bio, '') || ' ' ||
    coalesce(array_to_string(new.skills, ' '), '')
  );
  return new;
end;
$$;

create trigger refresh_profile_search_document
  before insert or update on public.profiles
  for each row execute procedure public.refresh_profile_search_document();

update public.profiles
set search_document = pg_catalog.to_tsvector(
  'simple'::pg_catalog.regconfig,
  coalesce(display_name, '') || ' ' ||
  coalesce(headline, '') || ' ' ||
  coalesce(bio, '') || ' ' ||
  coalesce(array_to_string(skills, ' '), '')
);

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
