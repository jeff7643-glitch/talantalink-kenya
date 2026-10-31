alter table public.profiles
  add column avatar_path text,
  add column avatar_bucket text not null default 'talantalink-profile-media'
    check (avatar_bucket in ('talantalink-profile-media', 'talantalink-avatars')),
  add column cover_photo_path text;

update public.profiles
set avatar_path = case
      when avatar_url like '%/object/public/talantalink-profile-media/%'
        then split_part(avatar_url, '/object/public/talantalink-profile-media/', 2)
      when avatar_url like '%/object/public/talantalink-avatars/%'
        then split_part(avatar_url, '/object/public/talantalink-avatars/', 2)
      else avatar_path
    end,
    avatar_bucket = case
      when avatar_url like '%/object/public/talantalink-avatars/%' then 'talantalink-avatars'
      else avatar_bucket
    end,
    avatar_url = case
      when avatar_url like '%/object/public/talantalink-profile-media/%'
        or avatar_url like '%/object/public/talantalink-avatars/%' then null
      else avatar_url
    end,
    cover_photo_path = case
      when cover_photo_url like '%/object/public/talantalink-profile-media/%'
        then split_part(cover_photo_url, '/object/public/talantalink-profile-media/', 2)
      else cover_photo_path
    end,
    cover_photo_url = case
      when cover_photo_url like '%/object/public/talantalink-profile-media/%' then null
      else cover_photo_url
    end;

update storage.buckets
set public = false
where id in ('talantalink-profile-media', 'talantalink-avatars');

drop policy if exists "Professional profile media is publicly readable" on storage.objects;
drop policy if exists "TalantaLink member photos are publicly readable" on storage.objects;
drop policy if exists "Consented profile media is readable" on storage.objects;

create policy "Consented profile media is readable"
  on storage.objects for select to anon, authenticated
  using (
    (
      bucket_id = 'talantalink-profile-media'
      and exists (
        select 1
        from public.profiles p
        where p.is_public
          and p.profile_public_consent
          and (
            p.avatar_path = name
            or p.cover_photo_path = name
            or exists (
              select 1 from public.profile_portfolio_items item
              where item.user_id = p.id and item.storage_path = name
            )
            or exists (
              select 1 from public.profile_certificates certificate
              where certificate.user_id = p.id and certificate.storage_path = name
            )
          )
      )
    )
    or (
      bucket_id = 'talantalink-avatars'
      and exists (
        select 1
        from public.profiles p
        where p.is_public
          and p.profile_public_consent
          and p.avatar_bucket = 'talantalink-avatars'
          and p.avatar_path = name
      )
    )
    or (
      (select auth.uid()) is not null
      and (storage.foldername(name))[1] = (select auth.uid())::text
      and bucket_id in ('talantalink-profile-media', 'talantalink-avatars')
    )
  );
