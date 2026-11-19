-- 0013 — إضافة صلاحية «الاستوري» لأعضاء فريق المتجر
create or replace function public.invite_store_member(p_store uuid, p_email text, p_role public.store_member_role, p_permissions text[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  if not private.is_store_manager(p_store) then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  if p_role = 'owner' then raise exception 'لا يمكن منح دور المالك'; end if;
  if p_permissions is null or not p_permissions <@ array['orders','products','inventory','pricing','finance','stories'] then
    raise exception 'صلاحيات غير صالحة';
  end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'لا يوجد مستخدم بهذا البريد، اطلب منه التسجيل أولًا'; end if;
  insert into public.store_members (store_id, user_id, role, permissions)
  values (p_store, v_user, p_role, p_permissions)
  on conflict (store_id, user_id) do update set role = excluded.role, permissions = excluded.permissions, is_active = true;
  perform private.notify(v_user, 'أُضفت إلى فريق متجر', (select name from public.stores where id = p_store), '/merchant', 'store');
end $$;
