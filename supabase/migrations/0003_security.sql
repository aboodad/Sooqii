-- =====================================================================
-- 0003 — الدوال المساعدة، المشغّلات، سياسات RLS، والصلاحيات الصريحة
-- كل الدوال: SECURITY DEFINER + search_path فارغ لمنع اختطاف المسار
-- =====================================================================

-- ---------- تطبيع النص العربي للبحث ----------
create or replace function private.normalize_ar(t text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select lower(
    regexp_replace(
      translate(coalesce(t,''), 'أإآٱىةؤئـ', 'اااايهوي'),
      '[ً-ْٰ]', '', 'g'))
$$;

-- ---------- الهوية والصلاحيات ----------
create or replace function private.mfa_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((auth.jwt()->>'aal') = 'aal2', false)
      or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
$$;

create or replace function private.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active')
$$;

create or replace function private.has_role(r public.app_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_active_user() and exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and (ur.role = r or ur.role = 'super_admin'))
$$;

create or replace function private.is_super_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_active_user() and private.mfa_ok() and exists (
    select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'super_admin')
$$;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.mfa_ok() and private.has_role('admin')
$$;

create or replace function private.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_active_user() and private.mfa_ok() and exists (
    select 1 from public.user_roles ur where ur.user_id = auth.uid())
$$;

create or replace function private.my_store_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select sm.store_id from public.store_members sm
  join public.stores s on s.id = sm.store_id
  where sm.user_id = auth.uid() and sm.is_active and s.status in ('pending','active','suspended')
    and private.is_active_user()
$$;

create or replace function private.store_perm(p_store uuid, p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_active_user() and exists (
    select 1 from public.store_members sm
    join public.stores s on s.id = sm.store_id
    where sm.store_id = p_store and sm.user_id = auth.uid() and sm.is_active
      and s.status in ('pending','active','suspended')
      and (sm.role in ('owner','manager') or p_perm = any(sm.permissions)))
$$;

create or replace function private.is_store_manager(p_store uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_active_user() and exists (
    select 1 from public.store_members sm
    where sm.store_id = p_store and sm.user_id = auth.uid() and sm.is_active and sm.role in ('owner','manager'))
$$;

create or replace function private.setting(p_key text, p_default jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select value from public.app_settings where key = p_key), p_default)
$$;

-- ---------- المشغّلات العامة ----------
create or replace function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

do $$ declare t text; begin
  foreach t in array array['profiles','stores','products','seller_offers','orders','sub_orders','returns'] loop
    execute format('create trigger trg_%1$s_updated before update on public.%1$I for each row execute function private.set_updated_at()', t);
  end loop;
end $$;

-- إنشاء ملف المستخدم والسلة تلقائيًا
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), 120))
  on conflict (id) do nothing;
  insert into public.carts (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- سجل التدقيق (إضافة فقط)
create or replace function private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs (actor_id, action, entity, entity_id, old_data, new_data)
  values (auth.uid(), lower(tg_op), tg_table_name,
          coalesce((case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id',
                   (case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'key'),
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

do $$ declare t text; begin
  foreach t in array array['stores','store_members','user_roles','coupons','seller_offers','app_settings','settlements','merchant_discounts','categories','shipping_rates'] loop
    execute format('create trigger trg_%1$s_audit after insert or update or delete on public.%1$I for each row execute function private.audit_row()', t);
  end loop;
end $$;
create trigger trg_products_audit after update of status on public.products
  for each row execute function private.audit_row();

create or replace function private.forbid_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'هذا السجل غير قابل للتعديل أو الحذف' using errcode = '42501'; end $$;
create trigger trg_audit_immutable before update or delete on public.audit_logs
  for each row execute function private.forbid_mutation();
create trigger trg_movements_immutable before update or delete on public.inventory_movements
  for each row execute function private.forbid_mutation();
create trigger trg_history_immutable before update or delete on public.order_status_history
  for each row execute function private.forbid_mutation();

-- نص البحث للمنتج
create or replace function private.products_search_doc() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.search_doc := private.normalize_ar(concat_ws(' ',
    new.name,
    (select b.name from public.brands b where b.id = new.brand_id),
    (select c.name_ar from public.categories c where c.id = new.category_id),
    left(new.description, 500)));
  return new;
end $$;
create trigger trg_products_search before insert or update of name, description, brand_id, category_id
  on public.products for each row execute function private.products_search_doc();

-- سجل الأسعار
create or replace function private.log_offer_price() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.price is distinct from old.price then
    insert into public.offer_price_history (offer_id, old_price, new_price, changed_by)
    values (new.id, case when tg_op='UPDATE' then old.price end, new.price, auth.uid());
  end if;
  return new;
end $$;
create trigger trg_offer_price after insert or update of price on public.seller_offers
  for each row execute function private.log_offer_price();

-- مزامنة حالة العرض/المنتج مع المخزون + «أبلغني عند التوفر»
create or replace function private.sync_stock_status() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_offer public.seller_offers; v_product uuid;
begin
  select * into v_offer from public.seller_offers where id = new.offer_id;
  select pv.product_id into v_product from public.product_variants pv where pv.id = v_offer.variant_id;

  if new.qty_available <= 0 and v_offer.status = 'active' then
    update public.seller_offers set status = 'out_of_stock' where id = new.offer_id;
  elsif new.qty_available > 0 and v_offer.status = 'out_of_stock' then
    update public.seller_offers set status = 'active' where id = new.offer_id;
    -- إشعار المنتظرين (مرة واحدة لكل عودة توفر، حد أقصى 3)
    insert into public.notifications (user_id, title, body, link, kind, dedupe_key)
    select sn.user_id, 'عاد المنتج للتوفر', p.name, '/p/' || p.slug, 'stock',
           'stock:' || sn.id || ':' || (sn.sent_count + 1)
    from public.stock_notifications sn
    join public.products p on p.id = v_product
    where sn.offer_id = new.offer_id and sn.is_active and sn.sent_count < 3
    on conflict (dedupe_key) do nothing;
    update public.stock_notifications set sent_count = sent_count + 1,
           is_active = (sent_count + 1) < 3
    where offer_id = new.offer_id and is_active;
  end if;

  update public.products p set status = case
      when exists (select 1 from public.seller_offers so join public.product_variants pv on pv.id = so.variant_id
                   where pv.product_id = p.id and so.status = 'active') then 'active'::public.product_status
      else 'out_of_stock'::public.product_status end
  where p.id = v_product and p.status in ('active','out_of_stock');
  return new;
end $$;
create trigger trg_inventory_sync after insert or update of qty_on_hand, qty_reserved on public.inventory_levels
  for each row execute function private.sync_stock_status();

-- متوسط التقييم
create or replace function private.refresh_ratings() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.products p set
    rating_avg = coalesce((select round(avg(rating)::numeric,2) from public.reviews r where r.product_id = p.id and r.status='published'),0),
    rating_count = (select count(*) from public.reviews r where r.product_id = p.id and r.status='published')
  where p.id = coalesce(new.product_id, old.product_id);
  update public.stores s set
    rating_avg = coalesce((select round(avg(rating)::numeric,2) from public.reviews r where r.store_id = s.id and r.status='published'),0),
    rating_count = (select count(*) from public.reviews r where r.store_id = s.id and r.status='published')
  where s.id = coalesce(new.store_id, old.store_id);
  return null;
end $$;
create trigger trg_reviews_rating after insert or update or delete on public.reviews
  for each row execute function private.refresh_ratings();

-- =====================================================================
-- RLS — تفعيل على كل الجداول
-- =====================================================================
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('alter table public.%I force row level security', t.tablename);
  end loop;
end $$;

-- لا صلاحيات افتراضية لأي جدول؛ نمنح المطلوب فقط
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ---- بيانات الكتالوج العامة (قراءة للجميع، كتابة للإدارة) ----
grant select on public.governorates, public.cities, public.categories, public.brands,
                public.shipping_rates, public.malls, public.mall_stores, public.content_blocks,
                public.stores, public.products, public.product_images, public.product_variants,
                public.seller_offers, public.reviews, public.app_settings
  to anon, authenticated;

grant insert, update on public.governorates, public.cities, public.categories, public.brands,
                        public.shipping_rates, public.malls, public.mall_stores, public.content_blocks,
                        public.app_settings
  to authenticated;
grant delete on public.content_blocks, public.mall_stores to authenticated;

create policy read_all on public.governorates   for select using (true);
create policy read_all on public.cities         for select using (true);
create policy read_all on public.shipping_rates for select using (true);
create policy read_all on public.app_settings   for select using (key like 'public_%' or (select private.is_admin()));
create policy read_cat on public.categories     for select using (is_active or (select private.is_admin()));
create policy read_brand on public.brands       for select using (is_active or (select private.is_admin()));
create policy read_mall on public.malls         for select using (is_active or (select private.is_admin()));
create policy read_all on public.mall_stores    for select using (true);
create policy read_active on public.content_blocks for select using (
  (is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()))
  or (select private.is_admin()));

do $$ declare t text; begin
  foreach t in array array['governorates','cities','categories','brands','shipping_rates','malls','mall_stores','content_blocks','app_settings'] loop
    execute format('create policy admin_insert on public.%I for insert to authenticated with check ((select private.is_admin()))', t);
    execute format('create policy admin_update on public.%I for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))', t);
  end loop;
end $$;
create policy admin_delete on public.content_blocks for delete to authenticated using ((select private.is_admin()));
create policy admin_delete on public.mall_stores    for delete to authenticated using ((select private.is_admin()));

-- ---- الملف الشخصي ----
grant select on public.profiles to authenticated;
grant update (full_name, phone, avatar_url) on public.profiles to authenticated;
create policy own_or_staff on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_staff()));
create policy own_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

grant select on public.user_roles to authenticated;
create policy own_or_admin on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

-- ---- العناوين ----
grant select, insert on public.addresses to authenticated;
grant update (label, recipient_name, phone, city_id, district, street, details, is_default, archived_at) on public.addresses to authenticated;
create policy own_select on public.addresses for select to authenticated
  using (user_id = (select auth.uid()));
create policy own_insert on public.addresses for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy own_update on public.addresses for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---- المتاجر ----
grant update (description, logo_url, cover_url, phone, city_id, prep_time_hours) on public.stores to authenticated;
create policy visible on public.stores for select using (
  status = 'active' or id in (select private.my_store_ids()) or (select private.is_staff()));
create policy manager_update on public.stores for update to authenticated
  using ((select private.is_store_manager(id))) with check ((select private.is_store_manager(id)));

grant select on public.store_members to authenticated;
create policy same_store on public.store_members for select to authenticated
  using (store_id in (select private.my_store_ids()) or (select private.is_admin()));

-- ---- الكتالوج ----
create policy visible on public.products for select using (
  status in ('active','out_of_stock')
  or proposed_by_store_id in (select private.my_store_ids())
  or (select private.is_staff()));
create policy visible on public.product_images for select using (
  exists (select 1 from public.products p where p.id = product_id));
create policy visible on public.product_variants for select using (
  exists (select 1 from public.products p where p.id = product_id));
create policy visible on public.seller_offers for select using (
  (status in ('active','out_of_stock') and exists (select 1 from public.stores s where s.id = store_id and s.status = 'active'))
  or store_id in (select private.my_store_ids())
  or (select private.is_staff()));

grant select on public.offer_price_history, public.inventory_levels, public.inventory_movements to authenticated;
create policy store_or_staff on public.offer_price_history for select to authenticated using (
  exists (select 1 from public.seller_offers o where o.id = offer_id and (o.store_id in (select private.my_store_ids()) or (select private.is_staff()))));
create policy store_or_staff on public.inventory_levels for select to authenticated using (
  exists (select 1 from public.seller_offers o where o.id = offer_id and (o.store_id in (select private.my_store_ids()) or (select private.is_staff()))));
create policy store_or_staff on public.inventory_movements for select to authenticated using (
  exists (select 1 from public.seller_offers o where o.id = offer_id and (o.store_id in (select private.my_store_ids()) or (select private.is_staff()))));

-- ---- الخصومات والكوبونات ----
grant select, insert on public.merchant_discounts to authenticated;
grant update (title, type, value, starts_at, ends_at, is_active) on public.merchant_discounts to authenticated;
create policy store_select on public.merchant_discounts for select to authenticated
  using (store_id in (select private.my_store_ids()) or (select private.is_staff()));
create policy store_insert on public.merchant_discounts for insert to authenticated
  with check ((select private.store_perm(store_id, 'pricing'))
    and (offer_id is null or exists (select 1 from public.seller_offers o where o.id = offer_id and o.store_id = merchant_discounts.store_id)));
create policy store_update on public.merchant_discounts for update to authenticated
  using ((select private.store_perm(store_id, 'pricing'))) with check ((select private.store_perm(store_id, 'pricing')));

grant select, insert on public.coupons to authenticated;
grant update (value, max_discount, min_cart_value, usage_limit, per_user_limit, starts_at, ends_at, is_active) on public.coupons to authenticated;
create policy scoped_select on public.coupons for select to authenticated using (
  (issuer = 'store' and store_id in (select private.my_store_ids())) or (select private.is_admin()));
create policy scoped_insert on public.coupons for insert to authenticated with check (
  used_count = 0 and created_by = (select auth.uid()) and (
    (issuer = 'store' and (select private.store_perm(store_id, 'pricing')))
    or (issuer = 'platform' and (select private.is_admin()))));
create policy scoped_update on public.coupons for update to authenticated using (
  (issuer = 'store' and (select private.store_perm(store_id, 'pricing'))) or (issuer = 'platform' and (select private.is_admin())))
  with check (
  (issuer = 'store' and (select private.store_perm(store_id, 'pricing'))) or (issuer = 'platform' and (select private.is_admin())));

-- ---- السلة (القراءة فقط مباشرة؛ الكتابة عبر RPC) ----
grant select on public.carts, public.cart_items to authenticated;
create policy own on public.carts for select to authenticated using (user_id = (select auth.uid()));
create policy own on public.cart_items for select to authenticated using (
  exists (select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid())));

-- ---- الطلبات ----
grant select on public.orders, public.sub_orders, public.order_items, public.order_price_components,
                public.order_status_history, public.delivery_codes, public.payments, public.returns,
                public.coupon_redemptions, public.settlements
  to authenticated;

create policy own_or_staff on public.orders for select to authenticated using (
  user_id = (select auth.uid()) or (select private.is_staff()));
create policy scoped on public.sub_orders for select to authenticated using (
  exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
  or (select private.store_perm(store_id, 'orders'))
  or (select private.is_staff()));
create policy scoped on public.order_items for select to authenticated using (
  exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
  or exists (select 1 from public.sub_orders so where so.id = sub_order_id and (select private.store_perm(so.store_id, 'orders')))
  or (select private.is_staff()));
create policy scoped on public.order_price_components for select to authenticated using (
  exists (select 1 from public.sub_orders so join public.orders o on o.id = so.order_id
          where so.id = sub_order_id and (o.user_id = (select auth.uid()) or (select private.store_perm(so.store_id, 'finance'))))
  or (select private.is_staff()));
create policy scoped on public.order_status_history for select to authenticated using (
  exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
  or exists (select 1 from public.sub_orders so where so.id = sub_order_id and (select private.store_perm(so.store_id, 'orders')))
  or (select private.is_staff()));
-- رمز التسليم يراه صاحب الطلب فقط
create policy owner_only on public.delivery_codes for select to authenticated using (
  exists (select 1 from public.sub_orders so join public.orders o on o.id = so.order_id
          where so.id = sub_order_id and o.user_id = (select auth.uid())));
create policy own_or_finance on public.payments for select to authenticated using (
  exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
  or (select private.has_role('finance')) or (select private.is_admin()));
create policy scoped on public.returns for select to authenticated using (
  user_id = (select auth.uid())
  or exists (select 1 from public.sub_orders so where so.id = sub_order_id and (select private.store_perm(so.store_id, 'orders')))
  or (select private.is_staff()));
create policy own_or_admin on public.coupon_redemptions for select to authenticated using (
  user_id = (select auth.uid()) or (select private.is_admin()));
create policy scoped on public.settlements for select to authenticated using (
  (select private.store_perm(store_id, 'finance')) or (select private.has_role('finance')) or (select private.is_admin()));

-- ---- التقييمات والمفضلة والإشعارات ----
create policy visible on public.reviews for select using (
  status = 'published' or user_id = (select auth.uid()) or (select private.is_staff()));

grant select, insert, delete on public.wishlists to authenticated;
create policy own_select on public.wishlists for select to authenticated using (user_id = (select auth.uid()));
create policy own_insert on public.wishlists for insert to authenticated with check (user_id = (select auth.uid()));
create policy own_delete on public.wishlists for delete to authenticated using (user_id = (select auth.uid()));

grant select on public.stock_notifications, public.notifications to authenticated;
create policy own on public.stock_notifications for select to authenticated using (user_id = (select auth.uid()));
create policy own on public.notifications for select to authenticated using (user_id = (select auth.uid()));

grant select on public.audit_logs, public.activity_events, public.search_queries to authenticated;
create policy staff_read on public.audit_logs for select to authenticated
  using ((select private.is_admin()) or (select private.has_role('support')));
create policy admin_read on public.activity_events for select to authenticated using ((select private.is_admin()));
create policy admin_read on public.search_queries for select to authenticated using ((select private.is_admin()));

-- الدوال المساعدة في private قابلة للتنفيذ من الأدوار (للاستخدام في السياسات فقط)
grant execute on all functions in schema private to anon, authenticated;
revoke execute on function private.handle_new_user(), private.audit_row(), private.forbid_mutation(),
  private.products_search_doc(), private.log_offer_price(), private.sync_stock_status(),
  private.refresh_ratings(), private.set_updated_at() from anon, authenticated;

-- الإشعارات اللحظية
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.sub_orders;
