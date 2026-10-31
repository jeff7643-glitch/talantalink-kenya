do $$
declare
  app_table record;
  expected_bucket record;
  actual_bucket_public boolean;
begin
  for app_table in
    select c.relname, c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not exists (
        select 1
        from pg_depend extension_dependency
        where extension_dependency.classid = 'pg_class'::regclass
          and extension_dependency.objid = c.oid
          and extension_dependency.refclassid = 'pg_extension'::regclass
          and extension_dependency.deptype = 'e'
      )
  loop
    if not app_table.relrowsecurity then
      raise exception 'RLS audit failed: public.% does not have row-level security enabled', app_table.relname;
    end if;
    if not exists (
      select 1
      from pg_policy policy
      join pg_class table_class on table_class.oid = policy.polrelid
      join pg_namespace table_schema on table_schema.oid = table_class.relnamespace
      where table_schema.nspname = 'public'
        and table_class.relname = app_table.relname
    ) then
      raise exception 'RLS audit failed: public.% has no access policy', app_table.relname;
    end if;
  end loop;

  if exists (
    select 1
    from pg_constraint constraint_row
    join pg_class table_class on table_class.oid = constraint_row.conrelid
    join pg_namespace table_schema on table_schema.oid = table_class.relnamespace
    where table_schema.nspname = 'public'
      and constraint_row.contype in ('c', 'f')
      and not constraint_row.convalidated
      and not exists (
        select 1
        from pg_depend extension_dependency
        where extension_dependency.classid = 'pg_class'::regclass
          and extension_dependency.objid = table_class.oid
          and extension_dependency.refclassid = 'pg_extension'::regclass
          and extension_dependency.deptype = 'e'
      )
  ) then
    raise exception 'Schema audit failed: public check or foreign-key constraints must be validated';
  end if;

  if exists (
    select 1
    from pg_class table_class
    join pg_namespace table_schema on table_schema.oid = table_class.relnamespace
    where table_schema.nspname = 'public'
      and table_class.relkind in ('r', 'p')
      and not exists (
        select 1
        from pg_depend extension_dependency
        where extension_dependency.classid = 'pg_class'::regclass
          and extension_dependency.objid = table_class.oid
          and extension_dependency.refclassid = 'pg_extension'::regclass
          and extension_dependency.deptype = 'e'
      )
      and not exists (
        select 1 from pg_constraint primary_key
        where primary_key.conrelid = table_class.oid
          and primary_key.contype = 'p'
      )
  ) then
    raise exception 'Schema audit failed: every public table must have a primary key';
  end if;

  if exists (
    select 1
    from (values
      ('public', 'profiles', 'id', 'auth', 'users', 'id'),
      ('public', 'companies', 'owner_id', 'public', 'profiles', 'id'),
      ('public', 'opportunities', 'company_id', 'public', 'companies', 'id'),
      ('public', 'applications', 'applicant_id', 'public', 'profiles', 'id'),
      ('public', 'applications', 'opportunity_id', 'public', 'opportunities', 'id'),
      ('public', 'opportunity_application_documents', 'application_id', 'public', 'applications', 'id'),
      ('public', 'messages', 'sender_id', 'public', 'profiles', 'id'),
      ('public', 'messages', 'recipient_id', 'public', 'profiles', 'id'),
      ('public', 'message_attachments', 'message_id', 'public', 'messages', 'id'),
      ('public', 'notification_preferences', 'user_id', 'public', 'profiles', 'id'),
      ('public', 'user_notifications', 'recipient_id', 'public', 'profiles', 'id'),
      ('public', 'user_notifications', 'actor_id', 'public', 'profiles', 'id')
    ) as expected(
      source_schema,
      source_table,
      source_column,
      target_schema,
      target_table,
      target_column
    )
    where not exists (
      select 1
      from pg_constraint fk
      join pg_class src_table on src_table.oid = fk.conrelid
      join pg_namespace src_schema on src_schema.oid = src_table.relnamespace
      join pg_attribute src_column
        on src_column.attrelid = src_table.oid
        and src_column.attnum = any(fk.conkey)
      join pg_class dst_table on dst_table.oid = fk.confrelid
      join pg_namespace dst_schema on dst_schema.oid = dst_table.relnamespace
      join pg_attribute dst_column
        on dst_column.attrelid = dst_table.oid
        and dst_column.attnum = any(fk.confkey)
      where fk.contype = 'f'
        and fk.convalidated
        and src_schema.nspname = expected.source_schema
        and src_table.relname = expected.source_table
        and src_column.attname = expected.source_column
        and dst_schema.nspname = expected.target_schema
        and dst_table.relname = expected.target_table
        and dst_column.attname = expected.target_column
        and fk.conkey = array[src_column.attnum]::smallint[]
        and fk.confkey = array[dst_column.attnum]::smallint[]
    )
  ) then
    raise exception 'Schema audit failed: a required profile, marketplace, message, or notification relationship is missing';
  end if;

  if (select count(*) from public.counties) <> 47 then
    raise exception 'Kenya location audit failed: expected exactly 47 counties';
  end if;

  if exists (
    select expected.index_name
    from (values
      ('applications_applicant_order'),
      ('messages_inbox_order'),
      ('messages_sent_order'),
      ('opportunity_application_documents_application'),
      ('user_notifications_recipient_order'),
      ('user_notifications_unread')
    ) as expected(index_name)
    where not exists (
      select 1
      from pg_indexes existing_index
      where existing_index.schemaname = 'public'
        and existing_index.indexname = expected.index_name
    )
  ) then
    raise exception 'Schema audit failed: required applicant, message, attachment, or notification indexes are missing';
  end if;

  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage'
      and c.relname = 'objects'
      and c.relrowsecurity
  ) then
    raise exception 'Storage audit failed: storage.objects must have RLS enabled';
  end if;

  for expected_bucket in
    select * from (values
      ('talantalink-posts', true),
      ('talantalink-avatars', false),
      ('talantalink-profile-media', false),
      ('talantalink-inbox-files', false),
      ('talantalink-application-files', false),
      ('talantalink-verification-documents', false),
      ('talantalink-company-logos', true)
    ) as buckets(bucket_id, is_public)
  loop
    select b.public into actual_bucket_public
    from storage.buckets b
    where b.id = expected_bucket.bucket_id;

    if not found then
      raise exception 'Storage audit failed: bucket % is missing', expected_bucket.bucket_id;
    end if;
    if actual_bucket_public is distinct from expected_bucket.is_public then
      raise exception 'Storage audit failed: bucket % has an unexpected visibility setting', expected_bucket.bucket_id;
    end if;
    if not exists (
      select 1
      from pg_policies p
      where p.schemaname = 'storage'
        and p.tablename = 'objects'
        and concat_ws(' ', p.qual, p.with_check) like '%' || expected_bucket.bucket_id || '%'
    ) then
      raise exception 'Storage audit failed: bucket % has no object access policy', expected_bucket.bucket_id;
    end if;
  end loop;
end;
$$;
