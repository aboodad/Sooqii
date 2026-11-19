-- =====================================================================
-- 0005 — حالات الطلب، الإرجاع، التقييم، لوحة التاجر، لوحة الإدارة، الصلاحيات
-- =====================================================================

-- مصفوفة الانتقالات المسموحة (القسم 16.1)
create or replace function private.sub_transition_ok(f public.sub_order_status, t public.sub_order_status)
returns boolean language sql immutable set search_path = '' as $$
  select (f, t) in (
    ('pending_merchant','accepted'), ('pending_merchant','cancelled'),
    ('accepted','preparing'), ('accepted','cancelled'),
    ('preparing','ready'), ('preparing','cancelled'),
    ('ready','handed_over'), ('handed_over','in_transit'),
    ('in_transit','delivered'), ('in_transit','delivery_failed'),
    ('delivery_failed','in_transit'), ('delivery_failed','return_in_progress'),
    ('delivered','return_in_progress'), ('return_in_progress','returned'))
$$;

create or replace function private.restock_sub_order(p_sub uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select offer_id, qty - qty_cancelled as q from public.order_items where sub_order_id = p_sub and qty > qty_cancelled loop
    update public.inventory_levels set qty_on_hand = qty_on_hand + r.q, updated_at = now() where offer_id = r.offer_id;
    insert into public.inventory_movements (offer_id, delta_on_hand, reason, ref_id, actor_id)
    values (r.offer_id, r.q, p_reason, p_sub, auth.uid());
  end loop;
end $$;

-- اشتقاق حالة الطلب الرئيسي من الطلبات الفرعية
create or replace function private.refresh_order(p_order uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_total int; v_canc int; v_del int; v_ret int; v_prog int;
        v_old public.order_status; v_new public.order_status; v_pay public.payment_status;
begin
  select count(*), count(*) filter (where status = 'cancelled'), count(*) filter (where status = 'delivered'),
         count(*) filter (where status = 'returned'), count(*) filter (where status not in ('pending_merchant','cancelled'))
    into v_total, v_canc, v_del, v_ret, v_prog
  from public.sub_orders where order_id = p_order;
  select status, payment_status into v_old, v_pay from public.orders where id = p_order for update;

  v_new := case
    when v_canc = v_total then 'cancelled'
    when v_del > 0 and v_del + v_ret + v_canc = v_total then 'delivered'
    when v_del > 0 then 'partially_delivered'
    when v_prog > 0 then 'in_progress'
    else 'confirmed' end;
  if v_new = 'cancelled' then v_pay := 'unpaid';
  elsif v_new = 'delivered' and v_pay = 'cod_pending' then v_pay := 'cod_collected'; end if;

  if v_new is distinct from v_old then
    update public.orders set status = v_new, payment_status = v_pay where id = p_order;
    insert into public.order_status_history (order_id, from_status, to_status, actor_id)
    values (p_order, v_old::text, v_new::text, auth.uid());
    if v_new = 'cancelled' then
      update public.coupons c set used_count = greatest(c.used_count - 1, 0)
      from public.coupon_redemptions r where r.order_id = p_order and r.coupon_id = c.id and not r.reverted;
      update public.coupon_redemptions set reverted = true where order_id = p_order;
    end if;
  elsif v_pay is distinct from (select payment_status from public.orders where id = p_order) then
    update public.orders set payment_status = v_pay where id = p_order;
  end if;
end $$;

create or replace function private.apply_sub_status(p_sub public.sub_orders, p_to public.sub_order_status, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_order_no text;
begin
  update public.sub_orders set status = p_to,
    cancel_reason = case when p_to = 'cancelled' then left(p_reason, 300) else cancel_reason end,
    delivered_at = case when p_to = 'delivered' then now() else delivered_at end
  where id = p_sub.id;
  insert into public.order_status_history (order_id, sub_order_id, from_status, to_status, actor_id, reason)
  values (p_sub.order_id, p_sub.id, p_sub.status::text, p_to::text, auth.uid(), left(p_reason, 300));

  if p_to = 'cancelled' then perform private.restock_sub_order(p_sub.id, 'order_cancel'); end if;
  if p_to = 'returned' and p_sub.status = 'return_in_progress'
     and not exists (select 1 from public.returns where sub_order_id = p_sub.id) then
    perform private.restock_sub_order(p_sub.id, 'return_restock');
  end if;
  if p_to = 'delivered' then
    insert into public.payments (order_id, sub_order_id, method, amount, status, recorded_by)
    select p_sub.order_id, p_sub.id, o.payment_method, p_sub.total, 'collected', auth.uid()
    from public.orders o where o.id = p_sub.order_id
    on conflict do nothing;
  end if;

  perform private.refresh_order(p_sub.order_id);
  select user_id, order_no into v_user, v_order_no from public.orders where id = p_sub.order_id;
  perform private.notify(v_user, 'تحديث على طلبك ' || v_order_no,
    'الطلب الفرعي ' || p_sub.sub_no || ': ' || private.sub_status_label(p_to),
    '/account/orders/' || p_sub.order_id, 'order');
end $$;

-- تغيير حالة طلب فرعي: التحقق من الدور والانتقال في الخادم
create or replace function public.update_sub_order_status(p_sub uuid, p_to public.sub_order_status,
                                                          p_reason text default null, p_otp text default null)
returns public.sub_order_status language plpgsql security definer set search_path = '' as $$
declare v public.sub_orders; v_merchant boolean; v_ops boolean; v_code record;
begin
  perform private.require_user();
  select * into v from public.sub_orders where id = p_sub for update;
  if not found then raise exception 'الطلب غير موجود' using errcode = 'P0002'; end if;
  if not private.sub_transition_ok(v.status, p_to) then
    raise exception 'لا يمكن نقل الطلب من "%" إلى "%"', private.sub_status_label(v.status), private.sub_status_label(p_to);
  end if;

  v_merchant := private.store_perm(v.store_id, 'orders');
  v_ops := (private.has_role('operations') and private.mfa_ok()) or private.is_admin();

  if not (v_ops or (v_merchant and (v.status, p_to) in (
      ('pending_merchant','accepted'), ('pending_merchant','cancelled'), ('accepted','preparing'),
      ('accepted','cancelled'), ('preparing','ready'), ('preparing','cancelled'), ('ready','handed_over')))) then
    raise exception 'لا تملك صلاحية تنفيذ هذا الإجراء' using errcode = '42501';
  end if;
  if p_to in ('cancelled','delivery_failed') and coalesce(trim(p_reason), '') = '' then
    raise exception 'يرجى ذكر السبب';
  end if;

  if p_to = 'delivered' then
    select * into v_code from public.delivery_codes where sub_order_id = v.id for update;
    if v_code.attempts >= 5 and not private.is_admin() then
      raise exception 'تم تجاوز عدد محاولات رمز التسليم، تواصل مع الإدارة';
    end if;
    if coalesce(p_otp, '') <> v_code.code then
      if private.is_admin() and coalesce(trim(p_reason), '') <> '' then
        null; -- تسليم استثنائي من الإدارة مع سبب مسجل
      else
        update public.delivery_codes set attempts = attempts + 1 where sub_order_id = v.id;
        raise exception 'رمز التسليم غير صحيح';
      end if;
    end if;
  end if;

  perform private.apply_sub_status(v, p_to, p_reason);
  return p_to;
end $$;

-- إلغاء العميل قبل بدء التجهيز
create or replace function public.cancel_order(p_order uuid, p_reason text default 'إلغاء من العميل')
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_user(); r public.sub_orders; v_n int := 0;
begin
  if not exists (select 1 from public.orders where id = p_order and user_id = v_uid) then
    raise exception 'الطلب غير موجود' using errcode = 'P0002';
  end if;
  for r in select * from public.sub_orders where order_id = p_order and status in ('pending_merchant','accepted') for update loop
    perform private.apply_sub_status(r, 'cancelled', coalesce(nullif(trim(p_reason), ''), 'إلغاء من العميل'));
    perform private.notify_store(r.store_id, 'أُلغي الطلب ' || r.sub_no, 'ألغى العميل الطلب قبل التجهيز', '/merchant/orders/' || r.id);
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'لا يمكن إلغاء الطلب بعد بدء التجهيز'; end if;
end $$;

-- ---------- الإرجاع ----------
create or replace function public.request_return(p_item uuid, p_qty int, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_user(); v_item public.order_items; v_sub public.sub_orders;
        v_days int := (private.setting('public_return_days', '7'::jsonb))::text::int; v_used int; v_id uuid;
begin
  select * into v_item from public.order_items where id = p_item;
  select * into v_sub from public.sub_orders where id = v_item.sub_order_id;
  if v_item.id is null or not exists (select 1 from public.orders where id = v_item.order_id and user_id = v_uid) then
    raise exception 'المنتج غير موجود' using errcode = 'P0002';
  end if;
  if v_sub.status <> 'delivered' then raise exception 'يمكن طلب الإرجاع بعد التسليم فقط'; end if;
  if v_sub.delivered_at < now() - make_interval(days => v_days) then
    raise exception 'انتهت مهلة الإرجاع (% أيام)', v_days;
  end if;
  select coalesce(sum(qty), 0) into v_used from public.returns where order_item_id = p_item and status <> 'rejected';
  if p_qty is null or p_qty < 1 or p_qty > v_item.qty - v_item.qty_cancelled - v_used then
    raise exception 'الكمية غير صالحة';
  end if;
  insert into public.returns (order_item_id, sub_order_id, user_id, qty, reason)
  values (p_item, v_sub.id, v_uid, p_qty, left(trim(p_reason), 500)) returning id into v_id;
  perform private.notify_store(v_sub.store_id, 'طلب إرجاع جديد', v_item.product_name, '/merchant/returns');
  return v_id;
end $$;

create or replace function public.decide_return(p_return uuid, p_status public.return_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.returns; v_store uuid; v_offer uuid; v_ok boolean;
begin
  perform private.require_user();
  select * into v from public.returns where id = p_return for update;
  if not found then raise exception 'طلب الإرجاع غير موجود' using errcode = 'P0002'; end if;
  select so.store_id into v_store from public.sub_orders so where so.id = v.sub_order_id;

  if not ((v.status, p_status) in (('requested','approved'), ('requested','rejected'), ('approved','received'), ('received','refunded'))) then
    raise exception 'انتقال غير مسموح لطلب الإرجاع';
  end if;
  v_ok := case when p_status = 'refunded' then private.has_role('finance') and private.mfa_ok() or private.is_admin()
               else private.store_perm(v_store, 'orders') or private.is_admin() or (private.has_role('operations') and private.mfa_ok()) end;
  if not v_ok then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;

  update public.returns set status = p_status, decision_note = left(p_note, 300), decided_by = auth.uid() where id = p_return;
  if p_status = 'received' then
    select offer_id into v_offer from public.order_items where id = v.order_item_id;
    update public.inventory_levels set qty_on_hand = qty_on_hand + v.qty where offer_id = v_offer;
    insert into public.inventory_movements (offer_id, delta_on_hand, reason, ref_id, actor_id)
    values (v_offer, v.qty, 'return_restock', v.id, auth.uid());
  elsif p_status = 'refunded' then
    update public.orders o set payment_status = 'partially_refunded'
    from public.sub_orders so where so.id = v.sub_order_id and o.id = so.order_id;
  end if;
  perform private.notify(v.user_id, 'تحديث طلب الإرجاع',
    case p_status when 'approved' then 'تمت الموافقة على طلب الإرجاع' when 'rejected' then 'رُفض طلب الإرجاع'
                  when 'received' then 'استلمنا المنتج المرتجع' else 'تم استرداد المبلغ' end,
    '/account/returns', 'return');
end $$;

-- ---------- التقييمات الموثقة ----------
create or replace function public.submit_review(p_item uuid, p_rating int, p_comment text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_user(); v_item public.order_items; v_store uuid; v_id uuid;
begin
  select oi.* into v_item from public.order_items oi join public.orders o on o.id = oi.order_id
  where oi.id = p_item and o.user_id = v_uid;
  if not found then raise exception 'المنتج غير موجود' using errcode = 'P0002'; end if;
  select store_id into v_store from public.sub_orders where id = v_item.sub_order_id and status in ('delivered','return_in_progress','returned');
  if v_store is null then raise exception 'يمكن التقييم بعد استلام المنتج'; end if;
  insert into public.reviews (product_id, store_id, user_id, order_item_id, rating, comment)
  values (v_item.product_id, v_store, v_uid, p_item, p_rating, nullif(left(trim(p_comment), 1000), ''))
  on conflict (order_item_id) do update set rating = excluded.rating, comment = excluded.comment
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.notify_when_available(p_offer uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_user();
begin
  if not exists (select 1 from public.seller_offers where id = p_offer and status = 'out_of_stock') then
    raise exception 'المنتج متوفر حاليًا';
  end if;
  insert into public.stock_notifications (user_id, offer_id) values (v_uid, p_offer) on conflict do nothing;
end $$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids))
$$;

-- ---------- سياق المستخدم (لعرض الواجهة فقط؛ الصلاحية تُفرض في الخادم) ----------
create or replace function public.get_my_context()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'profile', (select to_jsonb(p) - 'updated_at' from public.profiles p where p.id = auth.uid()),
    'roles', coalesce((select jsonb_agg(role) from public.user_roles where user_id = auth.uid()), '[]'::jsonb),
    'stores', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'slug', s.slug,
                 'status', s.status, 'logo_url', s.logo_url, 'role', sm.role, 'permissions', sm.permissions) order by sm.created_at)
               from public.store_members sm join public.stores s on s.id = sm.store_id
               where sm.user_id = auth.uid() and sm.is_active and s.status not in ('closed')), '[]'::jsonb),
    'mfa', jsonb_build_object('aal', auth.jwt()->>'aal',
               'enrolled', exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')),
    'unread', (select count(*) from public.notifications where user_id = auth.uid() and read_at is null)
  ) end
$$;

-- =====================================================================
-- لوحة التاجر
-- =====================================================================
create or replace function public.become_seller(p_name text, p_slug text, p_phone text, p_city int, p_description text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_user(); v_id uuid;
begin
  if (select count(*) from public.stores where owner_id = v_uid and status in ('pending','active','suspended')) >= 3 then
    raise exception 'وصلت للحد الأقصى من المتاجر';
  end if;
  if exists (select 1 from public.stores where slug = lower(p_slug)) then
    raise exception 'رابط المتجر مستخدم، اختر رابطًا آخر';
  end if;
  insert into public.stores (owner_id, name, slug, phone, city_id, description)
  values (v_uid, trim(p_name), lower(trim(p_slug)), p_phone, p_city, nullif(trim(p_description), ''))
  returning id into v_id;
  insert into public.store_members (store_id, user_id, role, permissions)
  values (v_id, v_uid, 'owner', '{orders,products,inventory,pricing,finance,team}');
  insert into public.notifications (user_id, title, body, link, kind)
  select ur.user_id, 'طلب انضمام متجر جديد', trim(p_name), '/admin/stores', 'admin'
  from public.user_roles ur where ur.role in ('super_admin','admin');
  return v_id;
end $$;

create or replace function private.valid_image_url(u text) returns boolean
language sql immutable set search_path = '' as $$
  select u ~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/(product-images|store-assets)/[A-Za-z0-9/_.-]+$'
      or u ~ '^https://images\.unsplash\.com/[A-Za-z0-9/_.?=&%-]+$'
$$;

-- إضافة/تعديل منتج وعروضه (معالج المنتج)
create or replace function public.merchant_save_product(p_store uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_user();
  v_pid uuid := nullif(p_data->>'product_id', '')::uuid;
  v_owned boolean := false; v_status public.product_status; v_var jsonb; v_vid uuid; v_oid uuid;
  v_stock int; v_slug text; v_img text; v_i int := 0;
begin
  if not private.store_perm(p_store, 'products') then raise exception 'لا تملك صلاحية إدارة المنتجات' using errcode = '42501'; end if;
  if (select status from public.stores where id = p_store) not in ('active','pending') then raise exception 'المتجر غير نشط'; end if;
  if jsonb_typeof(p_data->'variants') <> 'array' or jsonb_array_length(p_data->'variants') not between 1 and 30 then
    raise exception 'أضف متغيرًا واحدًا على الأقل (30 كحد أقصى)';
  end if;

  if v_pid is not null then
    select status, proposed_by_store_id = p_store into v_status, v_owned from public.products where id = v_pid;
    v_owned := coalesce(v_owned, false);
    if v_status is null or v_status in ('archived') then raise exception 'المنتج غير موجود'; end if;
    if not v_owned and v_status not in ('active','out_of_stock') then raise exception 'المنتج غير متاح لإضافة عرض عليه'; end if;
  end if;

  if v_pid is null or v_owned then
    if char_length(coalesce(trim(p_data->>'name'), '')) < 2 then raise exception 'اسم المنتج مطلوب'; end if;
    if v_pid is null then
      v_slug := lower(coalesce(nullif(p_data->>'slug', ''), 'p-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)));
      if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or exists (select 1 from public.products where slug = v_slug) then
        v_slug := 'p-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
      end if;
      insert into public.products (name, slug, description, category_id, brand_id, specs, status, proposed_by_store_id, created_by)
      values (trim(p_data->>'name'), v_slug, nullif(trim(p_data->>'description'), ''), (p_data->>'category_id')::int,
              nullif(p_data->>'brand_id', '')::int, coalesce(p_data->'specs', '{}'::jsonb), 'pending_review', p_store, v_uid)
      returning id into v_pid;
      v_owned := true;
    else
      update public.products set name = trim(p_data->>'name'), description = nullif(trim(p_data->>'description'), ''),
        category_id = (p_data->>'category_id')::int, brand_id = nullif(p_data->>'brand_id', '')::int,
        specs = coalesce(p_data->'specs', '{}'::jsonb),
        status = case when status = 'rejected' then 'pending_review'::public.product_status else status end
      where id = v_pid;
    end if;
    if jsonb_typeof(p_data->'images') = 'array' then
      delete from public.product_images where product_id = v_pid;
      for v_img in select value #>> '{}' from jsonb_array_elements(p_data->'images') limit 8 loop
        if not private.valid_image_url(v_img) then raise exception 'رابط صورة غير مسموح'; end if;
        insert into public.product_images (product_id, url, sort) values (v_pid, v_img, v_i);
        v_i := v_i + 1;
      end loop;
    end if;
  end if;

  for v_var in select * from jsonb_array_elements(p_data->'variants') loop
    v_vid := nullif(v_var->>'id', '')::uuid;
    if v_vid is not null then
      if not exists (select 1 from public.product_variants where id = v_vid and product_id = v_pid) then
        raise exception 'متغير غير صالح';
      end if;
      if v_owned then
        update public.product_variants set name = coalesce(nullif(trim(v_var->>'name'), ''), name),
               barcode = nullif(trim(v_var->>'barcode'), '') where id = v_vid;
      end if;
    elsif v_owned then
      begin
        insert into public.product_variants (product_id, sku, barcode, name, is_default)
        values (v_pid, upper(trim(v_var->>'sku')), nullif(trim(v_var->>'barcode'), ''),
                coalesce(nullif(trim(v_var->>'name'), ''), 'افتراضي'),
                not exists (select 1 from public.product_variants where product_id = v_pid))
        returning id into v_vid;
      exception when unique_violation then
        raise exception 'رمز SKU "%" مستخدم مسبقًا', v_var->>'sku';
      end;
    else
      raise exception 'لا يمكن إضافة متغير لمنتج لا يملكه متجرك';
    end if;

    insert into public.seller_offers (store_id, variant_id, price, compare_at_price, status)
    values (p_store, v_vid, (v_var->>'price')::numeric, nullif(v_var->>'compare_at_price', '')::numeric, 'active')
    on conflict (store_id, variant_id) do update set price = excluded.price, compare_at_price = excluded.compare_at_price,
      status = case when public.seller_offers.status in ('archived','discontinued') then 'active'::public.offer_status else public.seller_offers.status end,
      archived_at = null
    returning id into v_oid;

    v_stock := greatest(coalesce((v_var->>'stock')::int, 0), 0);
    if not exists (select 1 from public.inventory_levels where offer_id = v_oid) then
      insert into public.inventory_levels (offer_id, qty_on_hand) values (v_oid, v_stock);
      insert into public.inventory_movements (offer_id, delta_on_hand, reason, actor_id) values (v_oid, v_stock, 'initial', v_uid);
      if v_stock = 0 then update public.seller_offers set status = 'out_of_stock' where id = v_oid; end if;
    end if;
  end loop;
  return v_pid;
end $$;

create or replace function public.merchant_update_offer(p_offer uuid, p_price numeric default null,
  p_compare numeric default null, p_status public.offer_status default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.seller_offers; v_avail int;
begin
  perform private.require_user();
  select * into v from public.seller_offers where id = p_offer for update;
  if not found then raise exception 'العرض غير موجود' using errcode = 'P0002'; end if;
  if p_price is not null and not private.store_perm(v.store_id, 'pricing') then raise exception 'لا تملك صلاحية تعديل الأسعار' using errcode = '42501'; end if;
  if p_status is not null and not private.store_perm(v.store_id, 'products') then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  select qty_available into v_avail from public.inventory_levels where offer_id = p_offer;
  if p_status = 'out_of_stock' then raise exception 'تتحدد حالة النفاد تلقائيًا من المخزون'; end if;
  update public.seller_offers set
    price = coalesce(p_price, price),
    compare_at_price = case when p_price is not null then nullif(p_compare, 0) else compare_at_price end,
    status = case when p_status = 'active' and coalesce(v_avail, 0) <= 0 then 'out_of_stock'::public.offer_status
                  else coalesce(p_status, status) end,
    archived_at = case when p_status = 'archived' then now() when p_status is not null then null else archived_at end
  where id = p_offer;
end $$;

create or replace function public.merchant_adjust_stock(p_offer uuid, p_qty int, p_note text default null)
returns int language plpgsql security definer set search_path = '' as $$
declare v_store uuid; v_lvl public.inventory_levels; v_delta int;
begin
  perform private.require_user();
  select store_id into v_store from public.seller_offers where id = p_offer;
  if v_store is null or not private.store_perm(v_store, 'inventory') then raise exception 'لا تملك صلاحية إدارة المخزون' using errcode = '42501'; end if;
  if p_qty is null or p_qty < 0 or p_qty > 1000000 then raise exception 'كمية غير صالحة'; end if;
  select * into v_lvl from public.inventory_levels where offer_id = p_offer for update;
  if v_lvl.offer_id is null then
    insert into public.inventory_levels (offer_id, qty_on_hand) values (p_offer, p_qty);
    v_delta := p_qty;
  else
    if p_qty < v_lvl.qty_reserved then raise exception 'الكمية أقل من المحجوز (%)', v_lvl.qty_reserved; end if;
    v_delta := p_qty - v_lvl.qty_on_hand;
    update public.inventory_levels set qty_on_hand = p_qty, updated_at = now() where offer_id = p_offer;
  end if;
  if v_delta <> 0 then
    insert into public.inventory_movements (offer_id, delta_on_hand, reason, actor_id, note)
    values (p_offer, v_delta, case when v_delta > 0 then 'restock' else 'adjustment' end, auth.uid(), left(p_note, 300));
  end if;
  return p_qty;
end $$;

create or replace function public.merchant_dashboard(p_store uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb; v_fin boolean;
begin
  if not (private.store_perm(p_store, 'orders') or private.store_perm(p_store, 'products')) then
    raise exception 'لا تملك صلاحية' using errcode = '42501';
  end if;
  v_fin := private.store_perm(p_store, 'finance');
  select jsonb_build_object(
    'store', (select jsonb_build_object('id', id, 'name', name, 'slug', slug, 'status', status, 'rating', rating_avg,
               'rating_count', rating_count, 'commission_rate', commission_rate, 'rejection_reason', rejection_reason)
              from public.stores where id = p_store),
    'today_sales', case when v_fin then (select coalesce(sum(subtotal), 0) from public.sub_orders
                    where store_id = p_store and status <> 'cancelled' and created_at >= date_trunc('day', now())) end,
    'month_sales', case when v_fin then (select coalesce(sum(subtotal), 0) from public.sub_orders
                    where store_id = p_store and status <> 'cancelled' and created_at >= date_trunc('month', now())) end,
    'pending_orders', (select count(*) from public.sub_orders where store_id = p_store and status in ('pending_merchant','accepted','preparing')),
    'new_orders', (select count(*) from public.sub_orders where store_id = p_store and status = 'pending_merchant'),
    'unsettled_net', case when v_fin then (select coalesce(sum(merchant_net), 0) from public.sub_orders
                      where store_id = p_store and status = 'delivered' and settlement_id is null) end,
    'products', (select jsonb_build_object(
        'total', count(*), 'active', count(*) filter (where so.status = 'active'),
        'out', count(*) filter (where so.status = 'out_of_stock'))
       from public.seller_offers so where so.store_id = p_store and so.status <> 'archived'),
    'pending_review', (select count(*) from public.products where proposed_by_store_id = p_store and status = 'pending_review'),
    'low_stock', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('offer_id', so.id, 'name', p.name, 'variant', pv.name, 'available', il.qty_available) as x
        from public.seller_offers so join public.inventory_levels il on il.offer_id = so.id
        join public.product_variants pv on pv.id = so.variant_id join public.products p on p.id = pv.product_id
        where so.store_id = p_store and so.status in ('active','out_of_stock') and il.qty_available <= il.low_stock_threshold
        order by il.qty_available limit 8) t), '[]'::jsonb),
    'series', case when v_fin then (select jsonb_agg(jsonb_build_object('day', d::date, 'total',
        (select coalesce(sum(subtotal), 0) from public.sub_orders where store_id = p_store and status <> 'cancelled'
           and created_at >= d and created_at < d + interval '1 day')) order by d)
       from generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') d) end,
    'recent', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('id', id, 'sub_no', sub_no, 'status', status, 'subtotal', subtotal, 'created_at', created_at) as x
        from public.sub_orders where store_id = p_store order by created_at desc limit 6) t), '[]'::jsonb)
  ) into v;
  return v;
end $$;

create or replace function public.merchant_sub_order(p_sub uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v public.sub_orders; v_res jsonb;
begin
  select * into v from public.sub_orders where id = p_sub;
  if not found or not (private.store_perm(v.store_id, 'orders') or private.is_staff()) then
    raise exception 'الطلب غير موجود' using errcode = 'P0002';
  end if;
  select jsonb_build_object(
    'sub', to_jsonb(v) - 'merchant_net' - 'commission_amount' || case when private.store_perm(v.store_id, 'finance') or private.is_staff()
            then jsonb_build_object('merchant_net', v.merchant_net, 'commission_amount', v.commission_amount) else '{}'::jsonb end,
    'order', (select jsonb_build_object('order_no', o.order_no, 'payment_method', o.payment_method, 'notes', o.notes,
               'ship_to', o.address_snapshot, 'created_at', o.created_at) from public.orders o where o.id = v.order_id),
    'store', (select jsonb_build_object('name', name, 'slug', slug) from public.stores where id = v.store_id),
    'items', (select jsonb_agg(to_jsonb(i) order by i.product_name) from public.order_items i where i.sub_order_id = v.id),
    'history', (select jsonb_agg(jsonb_build_object('from', h.from_status, 'to', h.to_status, 'reason', h.reason, 'at', h.created_at) order by h.created_at)
                from public.order_status_history h where h.sub_order_id = v.id)
  ) into v_res;
  return v_res;
end $$;

create or replace function public.invite_store_member(p_store uuid, p_email text, p_role public.store_member_role, p_permissions text[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  if not private.is_store_manager(p_store) then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  if p_role = 'owner' then raise exception 'لا يمكن منح دور المالك'; end if;
  if p_permissions is null or not p_permissions <@ array['orders','products','inventory','pricing','finance'] then
    raise exception 'صلاحيات غير صالحة';
  end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'لا يوجد مستخدم بهذا البريد، اطلب منه التسجيل أولًا'; end if;
  insert into public.store_members (store_id, user_id, role, permissions)
  values (p_store, v_user, p_role, p_permissions)
  on conflict (store_id, user_id) do update set role = excluded.role, permissions = excluded.permissions, is_active = true;
  perform private.notify(v_user, 'أُضفت إلى فريق متجر', (select name from public.stores where id = p_store), '/merchant', 'store');
end $$;

create or replace function public.set_store_member_active(p_member bigint, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.store_members;
begin
  select * into v from public.store_members where id = p_member;
  if not found or not private.is_store_manager(v.store_id) then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  if v.role = 'owner' then raise exception 'لا يمكن تعطيل مالك المتجر'; end if;
  update public.store_members set is_active = p_active where id = p_member;
end $$;

-- قائمة أعضاء الفريق مع البريد (للمدير فقط)
create or replace function public.store_team(p_store uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_store_manager(p_store) and not private.is_admin() then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', sm.id, 'role', sm.role, 'permissions', sm.permissions,
      'is_active', sm.is_active, 'name', p.full_name, 'email', u.email) order by sm.created_at)
    from public.store_members sm join public.profiles p on p.id = sm.user_id join auth.users u on u.id = sm.user_id
    where sm.store_id = p_store), '[]'::jsonb);
end $$;

-- =====================================================================
-- لوحة الإدارة
-- =====================================================================
create or replace function private.require_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'صلاحية الإدارة مطلوبة (مع التحقق الثنائي إن كان مفعّلًا)' using errcode = '42501'; end if;
end $$;

create or replace function public.admin_dashboard()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not private.is_staff() then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  select jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'stores', (select jsonb_build_object('active', count(*) filter (where status = 'active'),
                 'pending', count(*) filter (where status = 'pending')) from public.stores),
    'products', (select jsonb_build_object('active', count(*) filter (where status in ('active','out_of_stock')),
                 'pending', count(*) filter (where status = 'pending_review')) from public.products),
    'orders_today', (select count(*) from public.orders where created_at >= date_trunc('day', now())),
    'gmv_month', (select coalesce(sum(grand_total), 0) from public.orders where status not in ('cancelled','expired')
                  and created_at >= date_trunc('month', now())),
    'commission_month', (select coalesce(sum(commission_amount), 0) from public.sub_orders where status <> 'cancelled'
                  and created_at >= date_trunc('month', now())),
    'late_orders', (select count(*) from public.sub_orders where status in ('pending_merchant','accepted') and created_at < now() - interval '24 hours'),
    'returns_open', (select count(*) from public.returns where status in ('requested','approved','received')),
    'series', (select jsonb_agg(jsonb_build_object('day', d::date,
        'orders', (select count(*) from public.orders where created_at >= d and created_at < d + interval '1 day'),
        'gmv', (select coalesce(sum(grand_total), 0) from public.orders where status not in ('cancelled','expired')
                and created_at >= d and created_at < d + interval '1 day')) order by d)
       from generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') d),
    'top_stores', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('name', s.name, 'slug', s.slug, 'total', sum(so.subtotal), 'orders', count(*)) as x
        from public.sub_orders so join public.stores s on s.id = so.store_id
        where so.status <> 'cancelled' and so.created_at >= now() - interval '30 days'
        group by s.id order by sum(so.subtotal) desc limit 5) t), '[]'::jsonb),
    'top_searches', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('q', query, 'n', count(*)) as x from public.search_queries
        where created_at > now() - interval '7 days' group by query order by count(*) desc limit 8) t), '[]'::jsonb)
  ) into v;
  return v;
end $$;

create or replace function public.admin_set_store_status(p_store uuid, p_status public.store_status, p_reason text default null,
  p_commission numeric default null, p_featured boolean default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.stores;
begin
  perform private.require_admin();
  select * into v from public.stores where id = p_store for update;
  if not found then raise exception 'المتجر غير موجود'; end if;
  if p_status in ('rejected','suspended') and coalesce(trim(p_reason), '') = '' then raise exception 'يرجى ذكر السبب'; end if;
  update public.stores set status = p_status,
    rejection_reason = case when p_status in ('rejected','suspended') then left(p_reason, 300) else null end,
    approved_by = case when p_status = 'active' and v.status <> 'active' then auth.uid() else approved_by end,
    approved_at = case when p_status = 'active' and v.status <> 'active' then now() else approved_at end,
    commission_rate = coalesce(p_commission, commission_rate),
    is_featured = coalesce(p_featured, is_featured),
    archived_at = case when p_status = 'closed' then now() else null end
  where id = p_store;
  if p_status = 'active' and v.status = 'pending' then
    -- اعتماد المنتجات المقترحة من المتجر تلقائيًا عند اعتماده يبقى قرارًا يدويًا (لا شيء هنا)
    null;
  end if;
  if p_status is distinct from v.status then
    perform private.notify(v.owner_id, 'تحديث حالة متجرك',
      case p_status when 'active' then 'تم اعتماد متجرك "' || v.name || '" ويمكنك البيع الآن'
                    when 'rejected' then 'لم يُعتمد متجرك: ' || coalesce(p_reason, '')
                    when 'suspended' then 'تم تعليق متجرك: ' || coalesce(p_reason, '')
                    else 'حالة المتجر: ' || p_status::text end, '/merchant', 'store');
  end if;
end $$;

create or replace function public.admin_review_product(p_product uuid, p_status public.product_status, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.products; v_owner uuid; v_new public.product_status := p_status;
begin
  perform private.require_admin();
  select * into v from public.products where id = p_product for update;
  if not found then raise exception 'المنتج غير موجود'; end if;
  if p_status not in ('active','rejected','hidden','discontinued','archived') then raise exception 'حالة غير صالحة'; end if;
  if p_status = 'rejected' and coalesce(trim(p_reason), '') = '' then raise exception 'يرجى ذكر سبب الرفض'; end if;
  if p_status = 'active' and not exists (select 1 from public.seller_offers so join public.product_variants pv on pv.id = so.variant_id
                                         where pv.product_id = p_product and so.status = 'active') then
    v_new := 'out_of_stock';
  end if;
  update public.products set status = v_new, reviewed_by = auth.uid(),
    rejection_reason = case when p_status = 'rejected' then left(p_reason, 300) end,
    archived_at = case when p_status = 'archived' then now() end
  where id = p_product;
  if v.proposed_by_store_id is not null then
    perform private.notify_store(v.proposed_by_store_id,
      case when p_status = 'active' then 'تم اعتماد منتجك' when p_status = 'rejected' then 'لم يُعتمد منتجك' else 'تحديث حالة منتج' end,
      v.name || coalesce(' — ' || p_reason, ''), '/merchant/products');
  end if;
end $$;

create or replace function public.admin_list_users(p_q text default null, p_limit int default 30, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_q text := nullif(trim(p_q), '');
begin
  perform private.require_admin();
  return jsonb_build_object(
    'total', (select count(*) from public.profiles p join auth.users u on u.id = p.id
              where v_q is null or u.email ilike '%' || private.escape_like(v_q) || '%' or p.full_name ilike '%' || private.escape_like(v_q) || '%'),
    'items', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', u.email, 'phone', p.phone,
        'status', p.status, 'created_at', p.created_at, 'last_sign_in_at', u.last_sign_in_at,
        'roles', coalesce((select jsonb_agg(role) from public.user_roles r where r.user_id = p.id), '[]'::jsonb),
        'stores', coalesce((select jsonb_agg(s.name) from public.store_members sm join public.stores s on s.id = sm.store_id
                            where sm.user_id = p.id and sm.is_active), '[]'::jsonb)) as x
      from public.profiles p join auth.users u on u.id = p.id
      where v_q is null or u.email ilike '%' || private.escape_like(v_q) || '%' or p.full_name ilike '%' || private.escape_like(v_q) || '%'
      order by p.created_at desc limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)) t), '[]'::jsonb));
end $$;

create or replace function public.admin_set_user_status(p_user uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if p_status not in ('active','suspended') then raise exception 'حالة غير صالحة'; end if;
  if p_user = auth.uid() then raise exception 'لا يمكنك تعليق حسابك'; end if;
  if exists (select 1 from public.user_roles where user_id = p_user and role = 'super_admin') and not private.is_super_admin() then
    raise exception 'لا يمكن تعليق مدير عام' using errcode = '42501';
  end if;
  update public.profiles set status = p_status where id = p_user;
  insert into public.audit_logs (actor_id, action, entity, entity_id, new_data)
  values (auth.uid(), 'set_status', 'profiles', p_user::text, jsonb_build_object('status', p_status));
end $$;

create or replace function public.admin_set_role(p_user uuid, p_role public.app_role, p_grant boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  -- المدير العام فقط يمنح/يسحب أدوار الإدارة؛ المدير يمنح أدوار التشغيل
  if (p_role in ('super_admin','admin') and not private.is_super_admin()) then
    raise exception 'هذا الدور يمنحه المدير العام فقط' using errcode = '42501';
  end if;
  if not p_grant and p_role = 'super_admin'
     and (select count(*) from public.user_roles where role = 'super_admin' and user_id <> p_user) = 0 then
    raise exception 'لا يمكن سحب آخر مدير عام';
  end if;
  if p_grant then
    insert into public.user_roles (user_id, role, granted_by) values (p_user, p_role, auth.uid()) on conflict do nothing;
  else
    delete from public.user_roles where user_id = p_user and role = p_role;
  end if;
end $$;

create or replace function public.admin_settlement_candidates()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_days int := (private.setting('public_return_days', '7'::jsonb))::text::int;
begin
  if not (private.is_admin() or (private.has_role('finance') and private.mfa_ok())) then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(x) from (
    select jsonb_build_object('store_id', s.id, 'name', s.name, 'orders', count(*), 'gross', sum(so.subtotal - so.store_coupon_discount),
      'commission', sum(so.commission_amount), 'net', sum(so.merchant_net)) as x
    from public.sub_orders so join public.stores s on s.id = so.store_id
    where so.status = 'delivered' and so.settlement_id is null and so.delivered_at < now() - make_interval(days => v_days)
      and not exists (select 1 from public.returns r where r.sub_order_id = so.id and r.status in ('requested','approved','received'))
    group by s.id order by sum(so.merchant_net) desc) t), '[]'::jsonb);
end $$;

create or replace function public.admin_generate_settlement(p_store uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_days int := (private.setting('public_return_days', '7'::jsonb))::text::int;
begin
  if not (private.is_admin() or (private.has_role('finance') and private.mfa_ok())) then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  insert into public.settlements (store_id, created_by) values (p_store, auth.uid()) returning id into v_id;
  update public.sub_orders so set settlement_id = v_id
  where so.store_id = p_store and so.status = 'delivered' and so.settlement_id is null
    and so.delivered_at < now() - make_interval(days => v_days)
    and not exists (select 1 from public.returns r where r.sub_order_id = so.id and r.status in ('requested','approved','received'));
  if not found then raise exception 'لا توجد طلبات مؤهلة للتسوية'; end if;
  update public.settlements st set
    gross = (select sum(subtotal - store_coupon_discount) from public.sub_orders where settlement_id = v_id),
    commission = (select sum(commission_amount) from public.sub_orders where settlement_id = v_id),
    net = (select sum(merchant_net) from public.sub_orders where settlement_id = v_id)
  where st.id = v_id;
  return v_id;
end $$;

create or replace function public.admin_set_settlement_status(p_id uuid, p_status public.settlement_status, p_ref text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.settlements;
begin
  if not (private.is_admin() or (private.has_role('finance') and private.mfa_ok())) then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  select * into v from public.settlements where id = p_id for update;
  if not ((v.status, p_status) in (('draft','approved'), ('approved','paid'), ('draft','cancelled'), ('approved','cancelled'))) then
    raise exception 'انتقال غير مسموح';
  end if;
  if p_status = 'paid' and coalesce(trim(p_ref), '') = '' then raise exception 'أدخل مرجع التحويل البنكي'; end if;
  update public.settlements set status = p_status,
    approved_by = case when p_status = 'approved' then auth.uid() else approved_by end,
    paid_at = case when p_status = 'paid' then now() else paid_at end,
    bank_ref = coalesce(left(p_ref, 120), bank_ref)
  where id = p_id;
  if p_status = 'cancelled' then update public.sub_orders set settlement_id = null where settlement_id = p_id; end if;
  if p_status = 'paid' then
    perform private.notify_store(v.store_id, 'تم تحويل مستحقاتك', 'المبلغ: ' || v.net || ' — المرجع: ' || p_ref, '/merchant/finance');
  end if;
end $$;

create or replace function public.admin_moderate_review(p_review uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if p_status not in ('published','hidden') then raise exception 'حالة غير صالحة'; end if;
  update public.reviews set status = p_status where id = p_review;
end $$;

-- =====================================================================
-- صلاحيات تنفيذ الدوال: لا شيء افتراضيًا، ثم المطلوب فقط
-- =====================================================================
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.search_products(text, text, text, int, numeric, numeric, boolean, text, int, int),
                          public.get_product(text), public.get_my_context()
  to anon, authenticated;

grant execute on function
  public.log_search(text, int), public.track_event(text, uuid),
  public.get_cart(text, uuid), public.cart_set_item(uuid, int), public.cart_merge(jsonb),
  public.place_order(uuid, text, text, uuid), public.cancel_order(uuid, text),
  public.update_sub_order_status(uuid, public.sub_order_status, text, text),
  public.request_return(uuid, int, text), public.decide_return(uuid, public.return_status, text),
  public.submit_review(uuid, int, text), public.notify_when_available(uuid), public.mark_notifications_read(uuid[]),
  public.become_seller(text, text, text, int, text), public.merchant_save_product(uuid, jsonb),
  public.merchant_update_offer(uuid, numeric, numeric, public.offer_status), public.merchant_adjust_stock(uuid, int, text),
  public.merchant_dashboard(uuid), public.merchant_sub_order(uuid),
  public.invite_store_member(uuid, text, public.store_member_role, text[]), public.set_store_member_active(bigint, boolean),
  public.store_team(uuid),
  public.admin_dashboard(), public.admin_set_store_status(uuid, public.store_status, text, numeric, boolean),
  public.admin_review_product(uuid, public.product_status, text), public.admin_list_users(text, int, int),
  public.admin_set_user_status(uuid, text), public.admin_set_role(uuid, public.app_role, boolean),
  public.admin_settlement_candidates(), public.admin_generate_settlement(uuid),
  public.admin_set_settlement_status(uuid, public.settlement_status, text), public.admin_moderate_review(uuid, text)
  to authenticated;

-- دوال private: للسياسات فقط؛ دوال الكتابة الداخلية غير قابلة للاستدعاء مباشرة (المخطط غير معروض في الـ API أصلًا)
revoke execute on function private.restock_sub_order(uuid, text), private.refresh_order(uuid),
  private.apply_sub_status(public.sub_orders, public.sub_order_status, text),
  private.notify(uuid, text, text, text, text, text), private.notify_store(uuid, text, text, text),
  private.compute_cart(uuid, text, smallint), private.cart_lines(uuid)
  from anon, authenticated, public;
