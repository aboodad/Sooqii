-- 0001 — حذف قاعدة البيانات القديمة بالكامل وتهيئة مخطط public نظيف
do $$ declare j record; begin
  for j in select jobid from cron.job loop perform cron.unschedule(j.jobid); end loop;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists souqi_on_auth_user_created on auth.users;

drop schema if exists osra_archive cascade;
drop schema if exists private cascade;
drop schema public cascade;
create schema public;
comment on schema public is 'Sawqy marketplace';

-- صلاحيات صريحة: لا منح تلقائي للجداول الجديدة إلى anon/authenticated
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;
alter default privileges in schema public revoke execute on functions from public;

-- مخطط خاص للدوال المساعدة (غير معروض عبر الـ API)
create schema private;
revoke all on schema private from public;
grant usage on schema private to authenticated, anon, service_role;
alter default privileges in schema private revoke execute on functions from public;

-- سياسات التخزين القديمة
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='storage' and tablename='objects' loop
    execute format('drop policy if exists %I on storage.objects', p.policyname);
  end loop;
end $$;
