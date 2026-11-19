-- =====================================================================
-- 0016 — دورة الطلب الموسّعة: طرق الدفع عبر واتساب، مهلة الدفع، العملات،
--        مسارات التوصيل (مباشر / مركز / فرع / نقطة استلام)، استبدال النقاط، الترقيم الجديد
-- =====================================================================

insert into public.app_settings (key, value) values
  ('public_loyalty', '{"enabled":true,"point_value":1,"max_redeem_percent":30,"min_redeem":100,
     "signup_points":100,"daily_points":5,"streak_days":7,"streak_bonus":50,"purchase_percent":2,
     "review_points":20,"referral_inviter":200,"referral_invitee":100}'::jsonb)
on conflict (key) do nothing;

alter table public.coupons add column if not exists assigned_user_id uuid references public.profiles(id) on delete restrict;
create index if not exists coupons_assigned_idx on public.coupons(assigned_user_id);

alter table public.order_price_components drop constraint if exists order_price_components_type_check;
alter table public.order_price_components add constraint order_price_components_type_check
  check (type in ('base','merchant_discount','store_coupon','platform_coupon','shipping','commission','points'));

-- رقم يمني بصيغة دولية (967XXXXXXXXX) أو null
create or replace function private.phone_e164(p text) returns text
language sql immutable set search_path = '' as $$
  select case
    when d ~ '^967[0-9]{8,9}$' then d
    when d ~ '^00967[0-9]{8,9}$' then substr(d, 3)
    when d ~ '^0?7[0-9]{8}$' then '967' || right(d, 9)
    when d ~ '^[1-9][0-9]{9,14}$' then d
    else null end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x
$$;

create or replace function private.loyalty() returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.setting('public_loyalty', '{}'::jsonb)
$$;

create or replace function private.payment_method_ok(p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from jsonb_array_elements(private.setting('public_payment_methods', '[]'::jsonb)) m
                 where m->>'key' = p_key and coalesce((m->>'enabled')::boolean, false))
$$;

-- ---------- التسعير: يدعم الشحن الموحد للطرد عند المرور بالمركز أو نقطة الاستلام ----------
drop function if exists private.compute_cart(uuid, text, smallint);
create or replace function private.compute_cart(p_user uuid, p_coupon text, p_gov smallint, p_mode text default 'direct')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_coupon public.coupons; v_coupon_ok boolean := false; v_coupon_msg text;
  v_elig numeric := 0; v_cdisc numeric := 0;
  v_fee numeric; v_eta_min int := 2; v_eta_max int := 5;
  v_free_min numeric := (private.setting('public_free_shipping_min', '0'::jsonb))::text::numeric;
  v_code text := upper(nullif(trim(p_coupon), ''));
  v_single boolean := p_mode in ('hub','branch','pickup');
  v_used int; v_result jsonb;
begin
  select fee, eta_days_min, eta_days_max into v_fee, v_eta_min, v_eta_max
  from public.shipping_rates where governorate_id = p_gov;
  if v_fee is null then
    v_fee := (private.setting('public_default_shipping', '1500'::jsonb))::text::numeric;
    v_eta_min := coalesce(v_eta_min, 2); v_eta_max := coalesce(v_eta_max, 5);
  end if;
  if p_mode = 'pickup' then v_fee := (private.setting('public_pickup_fee', '0'::jsonb))::text::numeric; end if;

  if v_code is not null then
    select * into v_coupon from public.coupons where code = v_code;
    if v_coupon.id is null or not v_coupon.is_active or v_coupon.starts_at > now()
       or (v_coupon.ends_at is not null and v_coupon.ends_at <= now())
       or (v_coupon.assigned_user_id is not null and v_coupon.assigned_user_id <> p_user) then
      v_coupon_msg := 'الكوبون غير صالح أو منتهي';
    elsif v_coupon.usage_limit is not null and v_coupon.used_count >= v_coupon.usage_limit then
      v_coupon_msg := 'تم استنفاد هذا الكوبون';
    else
      select count(*) into v_used from public.coupon_redemptions
      where coupon_id = v_coupon.id and user_id = p_user and not reverted;
      if v_used >= v_coupon.per_user_limit then v_coupon_msg := 'استخدمت هذا الكوبون من قبل';
      else v_coupon_ok := true; end if;
    end if;
  end if;

  if v_coupon_ok then
    select coalesce(sum((l.unit_price - l.unit_discount) * l.qty), 0) into v_elig
    from private.cart_lines(p_user) l
    where l.ok and (v_coupon.issuer = 'platform' or l.store_id = v_coupon.store_id);
    if v_elig <= 0 then v_coupon_ok := false; v_coupon_msg := 'الكوبون لا ينطبق على منتجات سلتك';
    elsif v_elig < v_coupon.min_cart_value then
      v_coupon_ok := false; v_coupon_msg := 'الحد الأدنى للسلة لاستخدام الكوبون ' || v_coupon.min_cart_value;
    else
      v_cdisc := case when v_coupon.type = 'percent' then round(v_elig * v_coupon.value / 100, 2) else least(v_coupon.value, v_elig) end;
      if v_coupon.max_discount is not null then v_cdisc := least(v_cdisc, v_coupon.max_discount); end if;
      v_coupon_msg := 'تم تطبيق الكوبون';
    end if;
  end if;

  with lines as (
    select l.*, (l.unit_price - l.unit_discount) * l.qty as line_total,
           (v_coupon_ok and l.ok and (v_coupon.issuer = 'platform' or l.store_id = v_coupon.store_id)) as eligible,
           row_number() over (order by l.store_name, l.offer_id) as rn
    from private.cart_lines(p_user) l
  ), shares as (
    select lines.*, case when eligible then round(v_cdisc * line_total / v_elig, 2) else 0 end as share0 from lines
  ), fixed as (
    select shares.*,
      share0 + case when eligible and rn = (select max(rn) from shares where eligible)
                    then v_cdisc - (select coalesce(sum(share0),0) from shares) else 0 end as coupon_share
    from shares
  ), stores as (
    select store_id, store_name, store_slug, commission_rate,
           sum(line_total) filter (where ok) as subtotal, sum(coupon_share) filter (where ok) as coupon_disc,
           count(*) as item_count, bool_or(ok) as any_ok
    from fixed group by store_id, store_name, store_slug, commission_rate
  ), ranked as (
    select s.*, row_number() over (order by s.any_ok desc, s.store_name) as srn,
           sum(coalesce(s.subtotal,0)) over () as all_subtotal
    from stores s
  ), stores2 as (
    select s.*,
      case when not s.any_ok then 0
           when v_single then case when s.srn = 1 and not (v_free_min > 0 and s.all_subtotal >= v_free_min and p_mode <> 'pickup') then v_fee else 0 end
           when v_free_min > 0 and coalesce(s.subtotal,0) >= v_free_min then 0 else v_fee end as shipping,
      case when v_coupon_ok and v_coupon.issuer = 'store' then coalesce(s.coupon_disc,0) else 0 end as store_coupon,
      case when v_coupon_ok and v_coupon.issuer = 'platform' then coalesce(s.coupon_disc,0) else 0 end as platform_coupon
    from ranked s
  ), stores3 as (
    select s.*, round((coalesce(s.subtotal,0) - s.store_coupon) * s.commission_rate / 100, 2) as commission from stores2 s
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'offer_id', f.offer_id, 'product_id', f.product_id, 'name', f.product_name, 'slug', f.product_slug,
        'variant', f.variant_name, 'image', f.image, 'store_id', f.store_id, 'store_name', f.store_name,
        'store_slug', f.store_slug, 'qty', f.qty, 'unit_price', f.unit_price, 'unit_discount', f.unit_discount,
        'unit_final', f.unit_price - f.unit_discount, 'line_total', f.line_total, 'coupon_share', f.coupon_share,
        'available', least(f.available, 99), 'ok', f.ok, 'issue', f.issue) order by f.rn) from fixed f), '[]'::jsonb),
    'stores', coalesce((select jsonb_agg(jsonb_build_object(
        'store_id', s.store_id, 'name', s.store_name, 'slug', s.store_slug,
        'subtotal', coalesce(s.subtotal,0), 'store_coupon', s.store_coupon, 'platform_coupon', s.platform_coupon,
        'shipping', s.shipping, 'total', coalesce(s.subtotal,0) - s.store_coupon - s.platform_coupon + s.shipping,
        'commission_rate', s.commission_rate, 'commission', s.commission,
        'merchant_net', coalesce(s.subtotal,0) - s.store_coupon - s.commission,
        'eta_min', v_eta_min, 'eta_max', v_eta_max, 'item_count', s.item_count, 'any_ok', s.any_ok)
        order by s.srn) from stores3 s), '[]'::jsonb),
    'totals', jsonb_build_object(
        'original_subtotal', (select coalesce(sum(unit_price * qty) filter (where ok), 0) from fixed),
        'merchant_discount', (select coalesce(sum(unit_discount * qty) filter (where ok), 0) from fixed),
        'subtotal', (select coalesce(sum(line_total) filter (where ok), 0) from fixed),
        'coupon_discount', v_cdisc,
        'points_discount', 0,
        'shipping', (select coalesce(sum(shipping), 0) from stores3),
        'grand_total', (select coalesce(sum(line_total) filter (where ok), 0) from fixed) - v_cdisc
                       + (select coalesce(sum(shipping), 0) from stores3)),
    'coupon', case when v_code is null then null else jsonb_build_object(
        'code', v_code, 'valid', v_coupon_ok, 'message', v_coupon_msg,
        'issuer', v_coupon.issuer, 'id', case when v_coupon_ok then v_coupon.id end) end,
    'count', (select coalesce(sum(qty), 0) from fixed),
    'has_issues', (select coalesce(bool_or(not ok), false) from fixed),
    'free_shipping_min', v_free_min, 'mode', p_mode)
  into v_result;
  return v_result;
end $$;

-- استبدال النقاط: يحسب الخصم المسموح ويعدّل الإجمالي
create or replace function private.apply_points(p_cart jsonb, p_user uuid, p_points int)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  l jsonb := private.loyalty();
  v_bal int := private.points_balance(p_user);
  v_val numeric := coalesce((l->>'point_value')::numeric, 1);
  v_base numeric := (p_cart->'totals'->>'subtotal')::numeric - (p_cart->'totals'->>'coupon_discount')::numeric;
  v_max_pts int; v_use int; v_disc numeric;
begin
  v_max_pts := least(v_bal, floor(v_base * coalesce((l->>'max_redeem_percent')::numeric, 30) / 100 / v_val)::int);
  if not coalesce((l->>'enabled')::boolean, false) then v_max_pts := 0; end if;
  v_use := greatest(0, least(coalesce(p_points, 0), v_max_pts));
  if v_use < coalesce((l->>'min_redeem')::int, 0) then v_use := 0; end if;
  v_disc := round(v_use * v_val, 2);
  return jsonb_set(jsonb_set(jsonb_set(p_cart,
    '{totals,points_discount}', to_jsonb(v_disc)),
    '{totals,grand_total}', to_jsonb((p_cart->'totals'->>'grand_total')::numeric - v_disc)),
    '{points}', jsonb_build_object('balance', v_bal, 'max', greatest(v_max_pts, 0), 'used', v_use, 'discount', v_disc,
                                   'min', coalesce((l->>'min_redeem')::int, 0), 'value', v_val));
end $$;

-- مسار التنفيذ الفعلي لطلب «توصيل للمنزل» حسب إعداد المركز
create or replace function private.resolve_mode(p_choice text) returns text
language sql stable security definer set search_path = '' as $$
  select case when p_choice = 'pickup' then 'pickup'
              when private.setting('public_hub_enabled', 'false'::jsonb) = 'true'::jsonb then 'hub'
              else 'direct' end
$$;

drop function if exists public.get_cart(text, uuid);
create or replace function public.get_cart(p_coupon text default null, p_address uuid default null,
                                           p_delivery text default 'delivery', p_points int default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.require_user(); v_gov smallint;
begin
  if p_address is not null then
    select c.governorate_id into v_gov from public.addresses a join public.cities c on c.id = a.city_id
    where a.id = p_address and a.user_id = v_uid and a.archived_at is null;
  end if;
  if v_gov is null then
    select c.governorate_id into v_gov from public.addresses a join public.cities c on c.id = a.city_id
    where a.user_id = v_uid and a.archived_at is null order by a.is_default desc, a.created_at desc limit 1;
  end if;
  return private.apply_points(private.compute_cart(v_uid, p_coupon, v_gov, private.resolve_mode(p_delivery)), v_uid, p_points);
end $$;

-- ---------- مصفوفة الانتقالات ----------
create or replace function private.sub_transition_ok(f public.sub_order_status, t public.sub_order_status)
returns boolean language sql immutable set search_path = '' as $$
  select (f, t) in (
    ('awaiting_payment','pending_merchant'), ('awaiting_payment','cancelled'),
    ('pending_merchant','accepted'), ('pending_merchant','cancelled'),
    ('accepted','preparing'), ('accepted','cancelled'),
    ('preparing','ready'), ('preparing','cancelled'),
    ('ready','handed_over'), ('handed_over','in_transit'), ('handed_over','at_hub'),
    ('at_hub','in_transit'),
    ('in_transit','delivered'), ('in_transit','delivery_failed'),
    ('delivery_failed','in_transit'), ('delivery_failed','return_in_progress'),
    ('delivered','return_in_progress'), ('return_in_progress','returned'))
$$;

-- ---------- دفعات التجهيز: يُضاف الطلب الفرعي الجاهز إلى دفعة المتجر المفتوحة ----------
create or replace function private.add_to_batch(p_sub public.sub_orders) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_batch uuid; v_loc int; v_no int;
begin
  select location_id into v_loc from public.orders where id = p_sub.order_id;
  select id into v_batch from public.merchant_batches
   where store_id = p_sub.store_id and status = 'open' and location_id is not distinct from v_loc
   order by created_at limit 1 for update;
  if v_batch is null then
    select store_no into v_no from public.stores where id = p_sub.store_id;
    insert into public.merchant_batches (batch_no, store_id, location_id)
    values ('BAT-ST' || v_no || '-' || lpad(nextval('public.batch_seq')::text, 5, '0'), p_sub.store_id, v_loc)
    returning id into v_batch;
  end if;
  update public.sub_orders set batch_id = v_batch where id = p_sub.id;
  return v_batch;
end $$;

-- ---------- اشتقاق حالة الطلب الرئيسي ----------
create or replace function private.refresh_order(p_order uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.orders; v_total int; v_canc int; v_del int; v_ret int; v_prog int; v_await int; v_hub int; v_transit int;
        v_active int; v_new public.order_status; v_pay public.payment_status;
begin
  select * into o from public.orders where id = p_order for update;
  select count(*), count(*) filter (where status = 'cancelled'), count(*) filter (where status = 'delivered'),
         count(*) filter (where status = 'returned'),
         count(*) filter (where status not in ('awaiting_payment','pending_merchant','cancelled')),
         count(*) filter (where status = 'awaiting_payment'), count(*) filter (where status = 'at_hub'),
         count(*) filter (where status = 'in_transit')
    into v_total, v_canc, v_del, v_ret, v_prog, v_await, v_hub, v_transit
  from public.sub_orders where order_id = p_order;
  v_active := v_total - v_canc;
  v_pay := o.payment_status;

  v_new := case
    when v_canc = v_total then (case when o.status = 'pending_payment' and o.payment_status = 'unpaid' and o.payment_due_at < now()
                                     then 'expired' else 'cancelled' end)::public.order_status
    when v_await > 0 then 'pending_payment'::public.order_status
    when v_del > 0 and v_del + v_ret + v_canc = v_total then 'delivered'::public.order_status
    when v_del > 0 then 'partially_delivered'::public.order_status
    when o.fulfillment <> 'direct' and v_active > 0 and v_transit = v_active then 'out_for_delivery'::public.order_status
    when o.fulfillment <> 'direct' and v_active > 0 and v_hub = v_active and o.packed_at is not null then 'packed'::public.order_status
    when v_prog > 0 then 'in_progress'::public.order_status
    else 'confirmed'::public.order_status end;

  if v_new in ('cancelled','expired') then
    if v_pay in ('unpaid','cod_pending') then v_pay := 'unpaid'; end if;
  elsif v_new = 'delivered' and v_pay = 'cod_pending' then v_pay := 'cod_collected'; end if;

  if v_new is distinct from o.status then
    update public.orders set status = v_new, payment_status = v_pay,
      delivered_at = case when v_new = 'delivered' then now() else delivered_at end
    where id = p_order;
    insert into public.order_status_history (order_id, from_status, to_status, actor_id)
    values (p_order, o.status::text, v_new::text, auth.uid());
    if v_new in ('cancelled','expired') then
      update public.coupons c set used_count = greatest(c.used_count - 1, 0)
      from public.coupon_redemptions r where r.order_id = p_order and r.coupon_id = c.id and not r.reverted;
      update public.coupon_redemptions set reverted = true where order_id = p_order;
      if o.points_used > 0 and not exists (select 1 from public.points_transactions
                                           where ref_id = p_order and kind = 'refund_order') then
        insert into public.points_transactions (user_id, amount, kind, status, ref_id, note)
        values (o.user_id, o.points_used, 'refund_order', 'available', p_order, 'استرجاع نقاط طلب ملغي');
      end if;
    end if;
  elsif v_pay is distinct from o.payment_status then
    update public.orders set payment_status = v_pay where id = p_order;
  end if;
end $$;

create or replace function private.apply_sub_status(p_sub public.sub_orders, p_to public.sub_order_status, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.orders; v_n int;
begin
  select * into o from public.orders where id = p_sub.order_id;
  update public.sub_orders set status = p_to,
    cancel_reason = case when p_to = 'cancelled' then left(p_reason, 300) else cancel_reason end,
    delivered_at = case when p_to = 'delivered' then now() else delivered_at end,
    ready_at = case when p_to = 'ready' then now() else ready_at end
  where id = p_sub.id;
  insert into public.order_status_history (order_id, sub_order_id, from_status, to_status, actor_id, reason)
  values (p_sub.order_id, p_sub.id, p_sub.status::text, p_to::text, auth.uid(), left(p_reason, 300));

  if p_to = 'cancelled' then perform private.restock_sub_order(p_sub.id, 'order_cancel'); end if;
  if p_to = 'returned' and p_sub.status = 'return_in_progress'
     and not exists (select 1 from public.returns where sub_order_id = p_sub.id) then
    perform private.restock_sub_order(p_sub.id, 'return_restock');
  end if;
  if p_to = 'ready' and o.fulfillment <> 'direct' then perform private.add_to_batch(p_sub); end if;
  if p_to = 'delivered' and o.payment_method = 'cod' then
    insert into public.payments (order_id, sub_order_id, method, amount, status, recorded_by)
    values (p_sub.order_id, p_sub.id, 'cod', p_sub.total, 'collected', auth.uid())
    on conflict do nothing;
  end if;

  perform private.refresh_order(p_sub.order_id);
  -- إشعار العميل داخل المنصة (بدون اسم المتجر)
  select count(*) into v_n from public.sub_orders where order_id = p_sub.order_id;
  if o.fulfillment = 'direct' or p_to in ('cancelled','delivered') then
    perform private.notify(o.user_id, 'تحديث على طلبك ' || o.order_no,
      case when v_n > 1 then 'إحدى شحنات طلبك: ' else '' end || private.sub_status_label(p_to),
      '/account/orders/' || p_sub.order_id, 'order');
  end if;
end $$;

-- ---------- إنشاء الطلب ----------
drop function if exists public.place_order(uuid, text, text, uuid);
create or replace function public.place_order(
  p_address uuid, p_coupon text default null, p_notes text default null, p_idempotency uuid default null,
  p_payment text default 'cod', p_delivery text default 'delivery', p_pickup int default null,
  p_points int default 0, p_currency text default 'YER')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_user();
  v_addr record; v_cart jsonb; v_order public.orders; v_sub_id uuid; v_item_id uuid;
  s jsonb; it jsonb; v_i int := 0; v_coupon_id uuid; v_issuer text;
  v_mode text := private.resolve_mode(p_delivery); v_loc int; v_pickup int;
  v_cod boolean := p_payment = 'cod'; v_rate numeric; v_store_no int;
  v_pts int; v_pdisc numeric; v_pbase numeric; v_pleft numeric; v_share numeric; v_nstores int; v_k int := 0;
  v_cod_max numeric := (private.setting('cod_max_amount', '0'::jsonb))::text::numeric;
  v_window int := (private.setting('payment_window_minutes', '120'::jsonb))::text::int;
begin
  if p_idempotency is null then raise exception 'مفتاح الطلب مفقود'; end if;
  select * into v_order from public.orders where user_id = v_uid and idempotency_key = p_idempotency;
  if found then return jsonb_build_object('order_id', v_order.id, 'order_no', v_order.order_no, 'duplicate', true); end if;
  if (select count(*) from public.orders where user_id = v_uid and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'محاولات كثيرة، يرجى الانتظار قليلًا' using errcode = 'P0001';
  end if;

  if not private.payment_method_ok(p_payment) then raise exception 'طريقة الدفع غير متاحة'; end if;
  select rate into v_rate from public.currencies where code = upper(coalesce(p_currency, 'YER')) and is_active;
  if v_rate is null then raise exception 'العملة غير متاحة'; end if;

  select a.*, c.name_ar as city_name, c.governorate_id, g.name_ar as gov_name into v_addr
  from public.addresses a join public.cities c on c.id = a.city_id join public.governorates g on g.id = c.governorate_id
  where a.id = p_address and a.user_id = v_uid and a.archived_at is null;
  if not found then raise exception 'العنوان غير صالح'; end if;

  -- مسار التنفيذ ونقطة المعالجة
  if v_mode = 'pickup' then
    if private.setting('public_pickup_enabled', 'false'::jsonb) <> 'true'::jsonb then raise exception 'الاستلام من نقطة غير متاح حاليًا'; end if;
    select id into v_pickup from public.locations where id = p_pickup and type = 'pickup' and is_active;
    if v_pickup is null then raise exception 'اختر نقطة استلام صالحة'; end if;
  end if;
  if v_mode in ('hub','pickup') then
    select id into v_loc from public.locations where type = 'branch' and is_active and governorate_id = v_addr.governorate_id order by id limit 1;
    if v_loc is not null and v_mode = 'hub' then v_mode := 'branch'; end if;
    if v_loc is null then select id into v_loc from public.locations where type = 'hub' and is_active order by id limit 1; end if;
    if v_loc is null then raise exception 'لا يوجد مركز تجميع مفعّل، تواصل مع الإدارة'; end if;
  end if;

  perform 1 from public.carts where user_id = v_uid for update;
  v_cart := private.apply_points(private.compute_cart(v_uid, p_coupon, v_addr.governorate_id, v_mode), v_uid, p_points);

  if (v_cart->>'count')::int = 0 then raise exception 'السلة فارغة'; end if;
  if (v_cart->>'has_issues')::boolean then
    raise exception 'بعض المنتجات في سلتك لم تعد متاحة بالكمية المطلوبة، راجع السلة' using errcode = 'P0001';
  end if;
  if v_cart->'coupon' is not null and v_cart->'coupon' <> 'null'::jsonb and not (v_cart->'coupon'->>'valid')::boolean then
    raise exception '%', v_cart->'coupon'->>'message';
  end if;
  if v_cod then
    if (select cod_blocked from public.profiles where id = v_uid) then
      raise exception 'الدفع عند الاستلام غير متاح لحسابك، اختر طريقة دفع أخرى';
    end if;
    if v_cod_max > 0 and (v_cart->'totals'->>'grand_total')::numeric > v_cod_max then
      raise exception 'الدفع عند الاستلام متاح للطلبات حتى % ر.ي، اختر طريقة دفع أخرى', v_cod_max;
    end if;
  end if;

  v_coupon_id := nullif(v_cart->'coupon'->>'id', '')::uuid;
  v_issuer := v_cart->'coupon'->>'issuer';
  v_pts := (v_cart->'points'->>'used')::int;
  v_pdisc := (v_cart->'points'->>'discount')::numeric;

  insert into public.orders (user_id, address_snapshot, governorate_id, status, payment_method, payment_status, payment_channel,
                             payment_due_at, subtotal, discount_total, shipping_total, grand_total, currency, fx_rate,
                             coupon_id, notes, idempotency_key, fulfillment, location_id, pickup_location_id,
                             points_used, points_discount)
  values (v_uid,
          jsonb_build_object('recipient_name', v_addr.recipient_name, 'phone', v_addr.phone,
                             'governorate', v_addr.gov_name, 'city', v_addr.city_name,
                             'district', v_addr.district, 'street', v_addr.street, 'details', v_addr.details),
          v_addr.governorate_id,
          (case when v_cod then 'confirmed' else 'pending_payment' end)::public.order_status,
          (case when v_cod then 'cod' when p_payment = 'transfer' then 'transfer' else 'wallet' end)::public.payment_method,
          (case when v_cod then 'cod_pending' else 'unpaid' end)::public.payment_status,
          p_payment,
          case when v_cod then null else now() + make_interval(mins => v_window) end,
          (v_cart->'totals'->>'original_subtotal')::numeric,
          (v_cart->'totals'->>'merchant_discount')::numeric + (v_cart->'totals'->>'coupon_discount')::numeric + v_pdisc,
          (v_cart->'totals'->>'shipping')::numeric,
          (v_cart->'totals'->>'grand_total')::numeric,
          upper(coalesce(p_currency, 'YER')), v_rate,
          v_coupon_id, left(p_notes, 500), p_idempotency, v_mode, v_loc, v_pickup, v_pts, v_pdisc)
  returning * into v_order;

  insert into public.order_status_history (order_id, from_status, to_status, actor_id, reason)
  values (v_order.id, null, v_order.status::text, v_uid,
          case when v_cod then 'الدفع عند الاستلام' else 'بانتظار تأكيد الدفع عبر واتساب' end);

  if v_pts > 0 then
    insert into public.points_transactions (user_id, amount, kind, status, ref_id, note)
    values (v_uid, -v_pts, 'redeem_order', 'available', v_order.id, 'استبدال نقاط في الطلب ' || v_order.order_no);
  end if;
  if v_mode <> 'direct' then
    insert into public.order_delivery_codes (order_id, code) values (v_order.id, private.random_otp());
  end if;

  -- توزيع خصم النقاط على الطلبات الفرعية بنسبة قيمتها (تتحمله المنصة)
  v_pbase := (v_cart->'totals'->>'subtotal')::numeric - (v_cart->'totals'->>'coupon_discount')::numeric;
  v_pleft := v_pdisc;
  select count(*) into v_nstores from jsonb_array_elements(v_cart->'stores') e where (e->>'any_ok')::boolean;

  for s in select * from jsonb_array_elements(v_cart->'stores') e where (e->>'any_ok')::boolean loop
    v_i := v_i + 1; v_k := v_k + 1;
    v_share := case when v_pdisc = 0 or v_pbase <= 0 then 0
                    when v_k = v_nstores then v_pleft
                    else round(v_pdisc * ((s->>'subtotal')::numeric - (s->>'store_coupon')::numeric - (s->>'platform_coupon')::numeric) / v_pbase, 2) end;
    v_pleft := v_pleft - v_share;
    select store_no into v_store_no from public.stores where id = (s->>'store_id')::uuid;

    insert into public.sub_orders (order_id, store_id, sub_no, status, subtotal, store_coupon_discount, platform_coupon_discount,
                                   points_discount, shipping_fee, total, commission_rate, commission_amount, merchant_net)
    values (v_order.id, (s->>'store_id')::uuid,
            'SUB-ST' || v_store_no || '-' || lpad(nextval('public.sub_no_seq')::text, 5, '0'),
            (case when v_cod then 'pending_merchant' else 'awaiting_payment' end)::public.sub_order_status,
            (s->>'subtotal')::numeric, (s->>'store_coupon')::numeric, (s->>'platform_coupon')::numeric, v_share,
            (s->>'shipping')::numeric, (s->>'total')::numeric - v_share, (s->>'commission_rate')::numeric,
            (s->>'commission')::numeric, (s->>'merchant_net')::numeric)
    returning id into v_sub_id;

    if v_mode = 'direct' then
      insert into public.delivery_codes (sub_order_id, code) values (v_sub_id, private.random_otp());
    end if;
    insert into public.order_status_history (order_id, sub_order_id, from_status, to_status, actor_id)
    values (v_order.id, v_sub_id, null, case when v_cod then 'pending_merchant' else 'awaiting_payment' end, v_uid);
    insert into public.order_price_components (sub_order_id, type, amount, borne_by)
    values (v_sub_id, 'shipping', (s->>'shipping')::numeric, 'customer'),
           (v_sub_id, 'commission', (s->>'commission')::numeric, 'store');
    if v_share > 0 then
      insert into public.order_price_components (sub_order_id, type, amount, borne_by) values (v_sub_id, 'points', -v_share, 'platform');
    end if;

    for it in select * from jsonb_array_elements(v_cart->'items') e where e->>'store_id' = s->>'store_id' loop
      update public.inventory_levels
         set qty_on_hand = qty_on_hand - (it->>'qty')::int, updated_at = now()
       where offer_id = (it->>'offer_id')::uuid and qty_available >= (it->>'qty')::int;
      if not found then raise exception 'نفدت كمية "%" أثناء إتمام الطلب', it->>'name' using errcode = 'P0001'; end if;
      insert into public.inventory_movements (offer_id, delta_on_hand, reason, ref_id, actor_id)
      values ((it->>'offer_id')::uuid, -(it->>'qty')::int, 'order_commit', v_order.id, v_uid);

      insert into public.order_items (order_id, sub_order_id, offer_id, product_id, product_name, variant_name, image_url,
                                      unit_price, merchant_discount_unit, coupon_discount, qty, line_total)
      values (v_order.id, v_sub_id, (it->>'offer_id')::uuid, (it->>'product_id')::uuid, it->>'name',
              nullif(it->>'variant', 'افتراضي'), it->>'image',
              (it->>'unit_price')::numeric, (it->>'unit_discount')::numeric, (it->>'coupon_share')::numeric,
              (it->>'qty')::int, (it->>'line_total')::numeric - (it->>'coupon_share')::numeric)
      returning id into v_item_id;

      insert into public.order_price_components (sub_order_id, order_item_id, type, amount, borne_by)
      values (v_sub_id, v_item_id, 'base', (it->>'unit_price')::numeric * (it->>'qty')::int, 'customer');
      if (it->>'unit_discount')::numeric > 0 then
        insert into public.order_price_components (sub_order_id, order_item_id, type, amount, borne_by)
        values (v_sub_id, v_item_id, 'merchant_discount', -(it->>'unit_discount')::numeric * (it->>'qty')::int, 'store');
      end if;
      if (it->>'coupon_share')::numeric > 0 then
        insert into public.order_price_components (sub_order_id, order_item_id, type, source_id, amount, borne_by)
        values (v_sub_id, v_item_id, case when v_issuer = 'store' then 'store_coupon' else 'platform_coupon' end,
                v_coupon_id, -(it->>'coupon_share')::numeric, case when v_issuer = 'store' then 'store' else 'platform' end);
      end if;
      insert into public.activity_events (user_id, event, product_id) values (v_uid, 'purchase', (it->>'product_id')::uuid);
    end loop;

    if v_cod then
      perform private.notify_store((s->>'store_id')::uuid, 'طلب جديد',
        'لديك طلب فرعي جديد بقيمة ' || (s->>'subtotal'), '/merchant/orders/' || v_sub_id);
    end if;
  end loop;

  if v_coupon_id is not null then
    update public.coupons set used_count = used_count + 1
     where id = v_coupon_id and (usage_limit is null or used_count < usage_limit);
    if not found then raise exception 'تم استنفاد هذا الكوبون'; end if;
    insert into public.coupon_redemptions (coupon_id, order_id, user_id, amount)
    values (v_coupon_id, v_order.id, v_uid, (v_cart->'totals'->>'coupon_discount')::numeric);
  end if;

  delete from public.cart_items where cart_id = (select id from public.carts where user_id = v_uid);

  perform private.notify(v_uid, 'تم استلام طلبك ' || v_order.order_no,
    case when v_cod then 'سيتم تجهيز طلبك. الدفع عند الاستلام.'
         else 'أكمل الدفع عبر واتساب خلال ' || v_window || ' دقيقة ليبدأ تجهيز طلبك.' end,
    '/account/orders/' || v_order.id, 'order');

  return jsonb_build_object('order_id', v_order.id, 'order_no', v_order.order_no, 'invoice_no', v_order.invoice_no,
                            'payment', p_payment, 'grand_total', v_order.grand_total, 'currency', v_order.currency,
                            'fx_rate', v_rate, 'due_at', v_order.payment_due_at, 'duplicate', false);
end $$;

-- ---------- تأكيد الدفع من الإدارة (بعد استلام إثبات الدفع عبر واتساب) ----------
create or replace function public.admin_confirm_payment(p_order uuid, p_ref text, p_amount numeric default null)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.orders; r public.sub_orders;
begin
  if not private.is_finance() then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'الطلب غير موجود'; end if;
  if o.payment_status <> 'unpaid' or o.payment_method = 'cod' then raise exception 'الطلب لا ينتظر دفعًا'; end if;
  if o.status = 'expired' then raise exception 'انتهت مهلة الدفع وأُلغي الطلب. أنشئ طلبًا جديدًا أو أعد المبلغ للعميل'; end if;
  if o.status <> 'pending_payment' then raise exception 'حالة الطلب لا تسمح بتأكيد الدفع'; end if;
  if coalesce(trim(p_ref), '') = '' then raise exception 'أدخل رقم مرجع الحوالة أو العملية'; end if;
  if p_amount is not null and p_amount <= 0 then raise exception 'المبلغ غير صالح'; end if;

  insert into public.order_payments (order_id, channel, amount, status, ref, recorded_by)
  values (p_order, o.payment_channel, coalesce(p_amount, o.grand_total), 'confirmed', left(trim(p_ref), 120), auth.uid());
  update public.orders set payment_status = 'paid', paid_at = now(), payment_ref = left(trim(p_ref), 120) where id = p_order;

  for r in select * from public.sub_orders where order_id = p_order and status = 'awaiting_payment' for update loop
    perform private.apply_sub_status(r, 'pending_merchant', 'تم تأكيد الدفع');
    perform private.notify_store(r.store_id, 'طلب جديد', 'لديك طلب فرعي جديد بقيمة ' || r.subtotal, '/merchant/orders/' || r.id);
  end loop;
  perform private.notify(o.user_id, 'تم تأكيد الدفع ' || o.order_no, 'بدأ تجهيز طلبك.', '/account/orders/' || p_order, 'order');
end $$;

-- إعادة مبلغ طلب مدفوع أُلغي
create or replace function public.admin_refund_payment(p_order uuid, p_ref text)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.orders; v_paid numeric;
begin
  if not private.is_finance() then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found or o.payment_status <> 'paid' or o.status not in ('cancelled','expired') then
    raise exception 'الاسترداد متاح للطلبات المدفوعة والملغاة فقط';
  end if;
  if coalesce(trim(p_ref), '') = '' then raise exception 'أدخل مرجع إعادة المبلغ'; end if;
  select coalesce(sum(amount), 0) into v_paid from public.order_payments where order_id = p_order and status = 'confirmed';
  if v_paid <= 0 then raise exception 'لا توجد دفعات مؤكدة'; end if;
  insert into public.order_payments (order_id, channel, amount, status, ref, recorded_by)
  values (p_order, o.payment_channel, v_paid, 'refunded', left(trim(p_ref), 120), auth.uid());
  update public.orders set payment_status = 'refunded' where id = p_order;
  perform private.notify(o.user_id, 'تمت إعادة المبلغ', 'أُعيد مبلغ الطلب ' || o.order_no, '/account/orders/' || p_order, 'order');
end $$;

-- ---------- انتهاء مهلة الدفع (تعمل دوريًا) ----------
create or replace function private.expire_unpaid_orders() returns int
language plpgsql security definer set search_path = '' as $$
declare o record; r public.sub_orders; v_n int := 0;
begin
  for o in select id, user_id, order_no from public.orders
           where status = 'pending_payment' and payment_status = 'unpaid' and payment_due_at < now()
           order by payment_due_at limit 200 for update skip locked loop
    for r in select * from public.sub_orders where order_id = o.id and status = 'awaiting_payment' for update loop
      perform private.apply_sub_status(r, 'cancelled', 'انتهت مهلة الدفع');
    end loop;
    perform private.notify(o.user_id, 'أُلغي الطلب ' || o.order_no, 'انتهت مهلة الدفع دون تأكيد.', '/account/orders/' || o.id, 'order');
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function private.expire_unpaid_orders() from public, anon, authenticated;

-- ---------- إلغاء العميل ----------
create or replace function public.cancel_order(p_order uuid, p_reason text default 'إلغاء من العميل')
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_user(); r public.sub_orders; v_n int := 0;
begin
  if not exists (select 1 from public.orders where id = p_order and user_id = v_uid) then
    raise exception 'الطلب غير موجود' using errcode = 'P0002';
  end if;
  for r in select * from public.sub_orders where order_id = p_order and status in ('awaiting_payment','pending_merchant','accepted') for update loop
    perform private.apply_sub_status(r, 'cancelled', coalesce(nullif(trim(p_reason), ''), 'إلغاء من العميل'));
    if r.status <> 'awaiting_payment' then
      perform private.notify_store(r.store_id, 'أُلغي الطلب ' || r.sub_no, 'ألغى العميل الطلب قبل التجهيز', '/merchant/orders/' || r.id);
    end if;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'لا يمكن إلغاء الطلب بعد بدء التجهيز'; end if;
end $$;

-- ---------- تغيير حالة طلب فرعي ----------
create or replace function public.update_sub_order_status(p_sub uuid, p_to public.sub_order_status,
                                                          p_reason text default null, p_otp text default null)
returns public.sub_order_status language plpgsql security definer set search_path = '' as $$
declare v public.sub_orders; v_merchant boolean; v_ops boolean; v_direct boolean;
begin
  perform private.require_user();
  select * into v from public.sub_orders where id = p_sub for update;
  if not found then raise exception 'الطلب غير موجود' using errcode = 'P0002'; end if;
  if not private.sub_transition_ok(v.status, p_to) then
    raise exception 'لا يمكن نقل الطلب من "%" إلى "%"', private.sub_status_label(v.status), private.sub_status_label(p_to);
  end if;
  if v.status = 'awaiting_payment' and p_to = 'pending_merchant' then raise exception 'استخدم تأكيد الدفع'; end if;
  select fulfillment = 'direct' into v_direct from public.orders where id = v.order_id;
  v_merchant := private.store_perm(v.store_id, 'orders');
  v_ops := (private.has_role('operations') and private.mfa_ok()) or private.is_admin();
  if not (v_ops or (v_merchant and ((v.status, p_to) in (
      ('pending_merchant','accepted'), ('pending_merchant','cancelled'), ('accepted','preparing'),
      ('accepted','cancelled'), ('preparing','ready'), ('preparing','cancelled'))
      or (v_direct and (v.status, p_to) = ('ready','handed_over'))))) then
    raise exception 'لا تملك صلاحية تنفيذ هذا الإجراء' using errcode = '42501';
  end if;
  if p_to in ('cancelled','delivery_failed') and coalesce(trim(p_reason), '') = '' then raise exception 'يرجى ذكر السبب'; end if;
  if p_to = 'delivered' then
    if p_otp is not null then raise exception 'استخدم تأكيد التسليم برمز OTP'; end if;
    if not private.is_admin() or coalesce(trim(p_reason), '') = '' then
      raise exception 'التسليم يتطلب رمز OTP من العميل، أو تسليمًا استثنائيًا من الإدارة مع ذكر السبب';
    end if;
  end if;
  perform private.apply_sub_status(v, p_to, p_reason);
  return p_to;
end $$;

create or replace function private.sub_status_label(s public.sub_order_status) returns text
language sql immutable set search_path = '' as $$
  select case s
    when 'awaiting_payment' then 'بانتظار الدفع'
    when 'pending_merchant' then 'بانتظار المتجر' when 'accepted' then 'مقبول'
    when 'preparing' then 'قيد التجهيز' when 'ready' then 'جاهز للاستلام'
    when 'handed_over' then 'استلمها المندوب' when 'at_hub' then 'في مركز سوقي'
    when 'in_transit' then 'في الطريق إليك'
    when 'delivered' then 'تم التسليم' when 'delivery_failed' then 'تعذّر التسليم'
    when 'cancelled' then 'ملغي' when 'return_in_progress' then 'قيد الإرجاع'
    when 'returned' then 'مُرجَع' end
$$;

-- ---------- تفاصيل الطلب الفرعي للتاجر: بلا بيانات العميل إلا في الشحن المباشر ----------
create or replace function public.merchant_sub_order(p_sub uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v public.sub_orders; o public.orders; v_staff boolean := private.is_staff();
begin
  select * into v from public.sub_orders where id = p_sub;
  if not found or not (private.store_perm(v.store_id, 'orders') or v_staff) then
    raise exception 'الطلب غير موجود' using errcode = 'P0002';
  end if;
  select * into o from public.orders where id = v.order_id;
  return jsonb_build_object(
    'sub', to_jsonb(v) - 'merchant_net' - 'commission_amount' - 'points_discount' - 'courier_id'
           || case when private.store_perm(v.store_id, 'finance') or v_staff
                   then jsonb_build_object('merchant_net', v.merchant_net, 'commission_amount', v.commission_amount) else '{}'::jsonb end,
    'order', jsonb_build_object('order_no', o.order_no, 'payment_method', o.payment_method, 'created_at', o.created_at,
               'fulfillment', o.fulfillment,
               'notes', case when o.fulfillment = 'direct' or v_staff then o.notes end,
               'ship_to', case when o.fulfillment = 'direct' or v_staff then o.address_snapshot end),
    'batch', (select jsonb_build_object('id', b.id, 'batch_no', b.batch_no, 'status', b.status) from public.merchant_batches b where b.id = v.batch_id),
    'store', (select jsonb_build_object('name', name, 'slug', slug) from public.stores where id = v.store_id),
    'items', (select jsonb_agg(to_jsonb(i) - 'order_id' order by i.product_name) from public.order_items i where i.sub_order_id = v.id),
    'history', (select jsonb_agg(jsonb_build_object('from', h.from_status, 'to', h.to_status, 'reason', h.reason, 'at', h.created_at) order by h.created_at)
                from public.order_status_history h where h.sub_order_id = v.id));
end $$;

-- ---------- سياق المستخدم ----------
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
               'enrolled', exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified'),
               'required', private.setting('admin_mfa_required', 'false'::jsonb) = 'true'::jsonb),
    'points', private.points_balance(auth.uid()),
    'unread', (select count(*) from public.notifications where user_id = auth.uid() and read_at is null)
  ) end
$$;

-- لا يُفعَّل إلزام التحقق الثنائي إلا من مدير فعّله لنفسه (يمنع قفل لوحة الإدارة)
create or replace function private.guard_settings() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.key = 'admin_mfa_required' and new.value = 'true'::jsonb and auth.uid() is not null
     and not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified') then
    raise exception 'فعّل التحقق الثنائي لحسابك أولًا من «حسابي ← الأمان» قبل إلزامه على الإدارة';
  end if;
  return new;
end $$;
create trigger trg_app_settings_guard before insert or update on public.app_settings
  for each row execute function private.guard_settings();

-- ---------- أدوات الإدارة ----------
create or replace function public.admin_upsert_currency(p_code text, p_name text, p_symbol text, p_rate numeric,
                                                        p_decimals int, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if upper(p_code) = 'YER' and (p_rate <> 1 or not p_active) then raise exception 'الريال اليمني هو عملة الأساس'; end if;
  insert into public.currencies (code, name_ar, symbol, rate, decimals, is_active, updated_at)
  values (upper(p_code), p_name, p_symbol, p_rate, p_decimals, p_active, now())
  on conflict (code) do update set name_ar = excluded.name_ar, symbol = excluded.symbol, rate = excluded.rate,
    decimals = excluded.decimals, is_active = excluded.is_active, updated_at = now();
end $$;

create or replace function public.admin_set_cod_block(p_user uuid, p_blocked boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  update public.profiles set cod_blocked = p_blocked where id = p_user;
end $$;

create or replace function public.admin_save_location(p_id int, p_type text, p_name text, p_gov int, p_city int,
                                                      p_address text, p_phone text, p_hours text, p_active boolean)
returns int language plpgsql security definer set search_path = '' as $$
declare v_id int;
begin
  perform private.require_admin();
  if p_id is null then
    insert into public.locations (type, name, governorate_id, city_id, address, phone, hours, is_active)
    values (p_type, p_name, p_gov, p_city, nullif(p_address, ''), nullif(p_phone, ''), nullif(p_hours, ''), coalesce(p_active, true))
    returning id into v_id;
  else
    update public.locations set type = p_type, name = p_name, governorate_id = p_gov, city_id = p_city,
      address = nullif(p_address, ''), phone = nullif(p_phone, ''), hours = nullif(p_hours, ''), is_active = coalesce(p_active, true)
    where id = p_id returning id into v_id;
  end if;
  return v_id;
end $$;

revoke execute on function public.place_order(uuid, text, text, uuid, text, text, int, int, text),
  public.get_cart(text, uuid, text, int), public.admin_confirm_payment(uuid, text, numeric),
  public.admin_refund_payment(uuid, text), public.admin_upsert_currency(text, text, text, numeric, int, boolean),
  public.admin_set_cod_block(uuid, boolean), public.admin_save_location(int, text, text, int, int, text, text, text, boolean)
  from public, anon;
grant execute on function public.place_order(uuid, text, text, uuid, text, text, int, int, text),
  public.get_cart(text, uuid, text, int), public.admin_confirm_payment(uuid, text, numeric),
  public.admin_refund_payment(uuid, text), public.admin_upsert_currency(text, text, text, numeric, int, boolean),
  public.admin_set_cod_block(uuid, boolean), public.admin_save_location(int, text, text, int, int, text, text, text, boolean)
  to authenticated;
