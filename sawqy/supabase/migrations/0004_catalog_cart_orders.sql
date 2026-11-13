-- =====================================================================
-- 0004 — الكتالوج، البحث العربي، السلة، التسعير من الخادم، إنشاء الطلب الذري
-- =====================================================================

-- أفضل خصم متجر فعّال على عرض (لا يُجمع خصمان للمتجر على المنتج نفسه)
create or replace function private.offer_discount(p_offer uuid, p_store uuid, p_price numeric)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(max(least(p_price,
           case when d.type = 'percent' then round(p_price * d.value / 100, 2) else d.value end)), 0)
  from public.merchant_discounts d
  where d.store_id = p_store and (d.offer_id = p_offer or d.offer_id is null) and d.is_active
    and d.starts_at <= now() and (d.ends_at is null or d.ends_at > now())
$$;

create or replace function private.escape_like(t text) returns text
language sql immutable set search_path = '' as $$
  select replace(replace(replace(coalesce(t,''), '\', '\\'), '%', '\%'), '_', '\_')
$$;

create or replace function private.require_user() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول' using errcode = '28000'; end if;
  if not private.is_active_user() then raise exception 'الحساب موقوف' using errcode = '42501'; end if;
  return auth.uid();
end $$;

-- ---------- البحث والاكتشاف ----------
create or replace function public.search_products(
  p_q text default null, p_category text default null, p_store text default null,
  p_brand int default null, p_min numeric default null, p_max numeric default null,
  p_in_stock boolean default false, p_sort text default 'relevance',
  p_limit int default 24, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_q text := nullif(trim(regexp_replace(private.normalize_ar(left(p_q, 120)), '\s+', ' ', 'g')), '');
  v_store uuid; v_cat_ids int[]; v_res jsonb;
begin
  p_limit  := least(greatest(coalesce(p_limit, 24), 1), 60);
  p_offset := least(greatest(coalesce(p_offset, 0), 0), 5000);
  if p_sort is null or p_sort not in ('relevance','newest','price_asc','price_desc','rating','trending','discount') then
    p_sort := case when v_q is null then 'newest' else 'relevance' end;
  end if;

  if p_store is not null then
    select id into v_store from public.stores where slug = p_store and status = 'active';
    if v_store is null then return jsonb_build_object('items', '[]'::jsonb, 'total', 0); end if;
  end if;
  if p_category is not null then
    with recursive t as (
      select id from public.categories where slug = p_category and is_active
      union all select c.id from public.categories c join t on c.parent_id = t.id where c.is_active)
    select array_agg(id) into v_cat_ids from t;
    if v_cat_ids is null then return jsonb_build_object('items', '[]'::jsonb, 'total', 0); end if;
  end if;

  with base as (
    select p.id, p.slug, p.name, p.rating_avg, p.rating_count, p.created_at,
           bo.offer_id, bo.price, bo.list_price, bo.final_price, bo.in_stock,
           case when v_q is null then 0
                else greatest(extensions.word_similarity(v_q, p.search_doc),
                     case when p.search_doc like '%' || private.escape_like(v_q) || '%' then 1 else 0 end) end as score
    from public.products p
    join lateral (
      select so.id as offer_id, so.price,
             greatest(so.price, coalesce(so.compare_at_price, 0)) as list_price,
             so.price - private.offer_discount(so.id, so.store_id, so.price) as final_price,
             (so.status = 'active' and coalesce(il.qty_available, 0) > 0) as in_stock
      from public.product_variants pv
      join public.seller_offers so on so.variant_id = pv.id
      join public.stores s on s.id = so.store_id and s.status = 'active'
      left join public.inventory_levels il on il.offer_id = so.id
      where pv.product_id = p.id and pv.is_active and so.status in ('active','out_of_stock')
        and (v_store is null or so.store_id = v_store)
      order by 5 desc, 4 asc, s.rating_avg desc
      limit 1) bo on true
    where p.status in ('active','out_of_stock')
      and (v_cat_ids is null or p.category_id = any(v_cat_ids))
      and (p_brand is null or p.brand_id = p_brand)
      and (v_q is null
           or not exists (select 1 from unnest(string_to_array(v_q, ' ')) w
                          where w <> '' and p.search_doc not like '%' || private.escape_like(w) || '%')
           or extensions.word_similarity(v_q, p.search_doc) > 0.45)
  ), filtered as (
    select b.*,
      case when p_sort = 'trending' then
        (select coalesce(sum(case e.event when 'purchase' then 5 when 'cart' then 3 when 'wishlist' then 2 else 1 end), 0)
         from public.activity_events e where e.product_id = b.id and e.created_at > now() - interval '7 days')
      else 0 end as heat
    from base b
    where (p_min is null or final_price >= p_min) and (p_max is null or final_price <= p_max)
      and (not coalesce(p_in_stock, false) or in_stock)
      and (p_sort <> 'discount' or list_price > final_price)
  ), page as (
    select * from filtered
    order by
      case when p_sort = 'price_asc'  then final_price end asc,
      case when p_sort = 'price_desc' then final_price end desc,
      case when p_sort = 'rating'     then rating_avg end desc,
      case when p_sort = 'trending'   then heat end desc,
      case when p_sort = 'discount'   then (list_price - final_price) / list_price end desc,
      case when p_sort = 'relevance'  then score end desc,
      in_stock desc, created_at desc
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', g.id, 'slug', g.slug, 'name', g.name,
        'image', (select url from public.product_images i where i.product_id = g.id order by sort limit 1),
        'price', g.final_price,
        'original_price', case when g.list_price > g.final_price then g.list_price end,
        'discount_percent', case when g.list_price > g.final_price
                                 then round(100 * (g.list_price - g.final_price) / g.list_price)::int end,
        'rating', g.rating_avg, 'rating_count', g.rating_count,
        'in_stock', g.in_stock, 'offer_id', g.offer_id) order by g.ord)
      from (select page.*, row_number() over () as ord from page) g), '[]'::jsonb))
  into v_res;
  return v_res;
end $$;

-- تسجيل البحث (للترند وتحسين النتائج) — للمستخدمين المسجلين فقط لمنع الإغراق
create or replace function public.log_search(p_q text, p_results int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or coalesce(trim(p_q), '') = '' then return; end if;
  if (select count(*) from public.search_queries where user_id = auth.uid() and created_at > now() - interval '1 minute') >= 20 then return; end if;
  insert into public.search_queries (user_id, query, results_count)
  values (auth.uid(), left(trim(p_q), 120), greatest(coalesce(p_results, 0), 0));
end $$;

create or replace function public.track_event(p_event text, p_product uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_event not in ('view','cart','wishlist') then return; end if;
  if exists (select 1 from public.activity_events where user_id = auth.uid() and product_id = p_product
             and event = p_event and created_at > now() - interval '30 minutes') then return; end if;
  if not exists (select 1 from public.products where id = p_product and status in ('active','out_of_stock')) then return; end if;
  insert into public.activity_events (user_id, event, product_id) values (auth.uid(), p_event, p_product);
end $$;

-- تفاصيل المنتج: العرض الفائز + «يُباع بواسطة» + المتغيرات
create or replace function public.get_product(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  with p as (
    select * from public.products where slug = p_slug and status in ('active','out_of_stock')
  ), offers as (
    select so.id, so.variant_id, so.price, so.compare_at_price, so.status, so.store_id,
           so.price - private.offer_discount(so.id, so.store_id, so.price) as final_price,
           greatest(so.price, coalesce(so.compare_at_price, 0)) as list_price,
           coalesce(il.qty_available, 0) as available,
           (so.status = 'active' and coalesce(il.qty_available, 0) > 0) as in_stock,
           coalesce(so.prep_time_hours, s.prep_time_hours) as prep_hours,
           s.name as store_name, s.slug as store_slug, s.logo_url as store_logo,
           s.rating_avg as store_rating, s.rating_count as store_rating_count
    from p join public.product_variants pv on pv.product_id = p.id and pv.is_active
    join public.seller_offers so on so.variant_id = pv.id and so.status in ('active','out_of_stock')
    join public.stores s on s.id = so.store_id and s.status = 'active'
    left join public.inventory_levels il on il.offer_id = so.id
  )
  select case when not exists (select 1 from p) then null else jsonb_build_object(
    'id', p.id, 'slug', p.slug, 'name', p.name, 'description', p.description, 'specs', p.specs,
    'rating', p.rating_avg, 'rating_count', p.rating_count, 'status', p.status,
    'category', (select jsonb_build_object('id', c.id, 'name', c.name_ar, 'slug', c.slug) from public.categories c where c.id = p.category_id),
    'brand', (select jsonb_build_object('id', b.id, 'name', b.name, 'slug', b.slug) from public.brands b where b.id = p.brand_id),
    'images', coalesce((select jsonb_agg(i.url order by i.sort) from public.product_images i where i.product_id = p.id), '[]'::jsonb),
    'variants', coalesce((select jsonb_agg(jsonb_build_object(
        'id', pv.id, 'name', pv.name, 'attributes', pv.attributes,
        'offers', coalesce((select jsonb_agg(jsonb_build_object(
            'offer_id', o.id, 'price', o.final_price,
            'original_price', case when o.list_price > o.final_price then o.list_price end,
            'discount_percent', case when o.list_price > o.final_price then round(100*(o.list_price-o.final_price)/o.list_price)::int end,
            'in_stock', o.in_stock, 'available', least(o.available, 20), 'prep_hours', o.prep_hours,
            'store', jsonb_build_object('name', o.store_name, 'slug', o.store_slug, 'logo', o.store_logo,
                                        'rating', o.store_rating, 'rating_count', o.store_rating_count))
          order by o.in_stock desc, o.final_price asc, o.store_rating desc)
          from offers o where o.variant_id = pv.id), '[]'::jsonb))
      order by pv.is_default desc, pv.created_at)
      from public.product_variants pv where pv.product_id = p.id and pv.is_active
        and exists (select 1 from offers o where o.variant_id = pv.id)), '[]'::jsonb)
  ) end
  from p
$$;

-- ---------- السلة ----------
create or replace function private.cart_lines(p_user uuid)
returns table (
  offer_id uuid, store_id uuid, store_name text, store_slug text, commission_rate numeric,
  product_id uuid, product_name text, product_slug text, variant_name text, image text,
  qty int, unit_price numeric, unit_discount numeric, available int, ok boolean, issue text)
language sql stable security definer set search_path = '' as $$
  select so.id, s.id, s.name, s.slug, s.commission_rate,
         p.id, p.name, p.slug, pv.name,
         (select url from public.product_images i where i.product_id = p.id order by sort limit 1),
         ci.qty, so.price, private.offer_discount(so.id, s.id, so.price),
         coalesce(il.qty_available, 0),
         (so.status = 'active' and s.status = 'active' and p.status = 'active' and pv.is_active
            and coalesce(il.qty_available, 0) >= ci.qty),
         case
           when s.status <> 'active' or p.status not in ('active','out_of_stock') or not pv.is_active
                or so.status in ('hidden','discontinued','archived') then 'المنتج لم يعد متاحًا للبيع'
           when coalesce(il.qty_available, 0) <= 0 then 'نفد المخزون'
           when coalesce(il.qty_available, 0) < ci.qty then 'الكمية المتاحة ' || il.qty_available || ' فقط'
         end
  from public.carts c
  join public.cart_items ci on ci.cart_id = c.id
  join public.seller_offers so on so.id = ci.offer_id
  join public.stores s on s.id = so.store_id
  join public.product_variants pv on pv.id = so.variant_id
  join public.products p on p.id = pv.product_id
  left join public.inventory_levels il on il.offer_id = so.id
  where c.user_id = p_user
$$;

-- التسعير الكامل من الخادم (القسم 13): خصم المتجر ← كوبون المتجر/المنصة ← الشحن
create or replace function private.compute_cart(p_user uuid, p_coupon text, p_gov smallint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_coupon public.coupons; v_coupon_ok boolean := false; v_coupon_msg text;
  v_elig numeric := 0; v_cdisc numeric := 0;
  v_fee numeric; v_eta_min int := 2; v_eta_max int := 5;
  v_free_min numeric := (private.setting('public_free_shipping_min', '0'::jsonb))::text::numeric;
  v_code text := upper(nullif(trim(p_coupon), ''));
  v_used int; v_result jsonb;
begin
  select fee, eta_days_min, eta_days_max into v_fee, v_eta_min, v_eta_max
  from public.shipping_rates where governorate_id = p_gov;
  if v_fee is null then
    v_fee := (private.setting('public_default_shipping', '1500'::jsonb))::text::numeric;
    v_eta_min := coalesce(v_eta_min, 2); v_eta_max := coalesce(v_eta_max, 5);
  end if;

  if v_code is not null then
    select * into v_coupon from public.coupons where code = v_code;
    if v_coupon.id is null or not v_coupon.is_active or v_coupon.starts_at > now()
       or (v_coupon.ends_at is not null and v_coupon.ends_at <= now()) then
      v_coupon_msg := 'الكوبون غير صالح أو منتهي';
    elsif v_coupon.usage_limit is not null and v_coupon.used_count >= v_coupon.usage_limit then
      v_coupon_msg := 'تم استنفاد هذا الكوبون';
    else
      select count(*) into v_used from public.coupon_redemptions
      where coupon_id = v_coupon.id and user_id = p_user and not reverted;
      if v_used >= v_coupon.per_user_limit then
        v_coupon_msg := 'استخدمت هذا الكوبون من قبل';
      else
        v_coupon_ok := true;
      end if;
    end if;
  end if;

  if v_coupon_ok then
    select coalesce(sum((l.unit_price - l.unit_discount) * l.qty), 0) into v_elig
    from private.cart_lines(p_user) l
    where l.ok and (v_coupon.issuer = 'platform' or l.store_id = v_coupon.store_id);
    if v_elig <= 0 then
      v_coupon_ok := false; v_coupon_msg := 'الكوبون لا ينطبق على منتجات سلتك';
    elsif v_elig < v_coupon.min_cart_value then
      v_coupon_ok := false; v_coupon_msg := 'الحد الأدنى للسلة لاستخدام الكوبون ' || v_coupon.min_cart_value;
    else
      v_cdisc := case when v_coupon.type = 'percent' then round(v_elig * v_coupon.value / 100, 2)
                      else least(v_coupon.value, v_elig) end;
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
    select lines.*,
      case when eligible then round(v_cdisc * line_total / v_elig, 2) else 0 end as share0
    from lines
  ), fixed as (
    select shares.*,
      share0 + case when eligible and rn = (select max(rn) from shares where eligible)
                    then v_cdisc - (select coalesce(sum(share0),0) from shares) else 0 end as coupon_share
    from shares
  ), stores as (
    select store_id, store_name, store_slug, commission_rate,
           sum(line_total) filter (where ok) as subtotal,
           sum(coupon_share) filter (where ok) as coupon_disc,
           count(*) as item_count, bool_or(ok) as any_ok
    from fixed group by store_id, store_name, store_slug, commission_rate
  ), stores2 as (
    select s.*,
      case when not s.any_ok then 0
           when v_free_min > 0 and coalesce(s.subtotal,0) >= v_free_min then 0 else v_fee end as shipping,
      case when v_coupon_ok and v_coupon.issuer = 'store' then coalesce(s.coupon_disc,0) else 0 end as store_coupon,
      case when v_coupon_ok and v_coupon.issuer = 'platform' then coalesce(s.coupon_disc,0) else 0 end as platform_coupon
    from stores s
  ), stores3 as (
    select s.*,
      round((coalesce(s.subtotal,0) - s.store_coupon) * s.commission_rate / 100, 2) as commission
    from stores2 s
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
        'shipping', s.shipping,
        'total', coalesce(s.subtotal,0) - s.store_coupon - s.platform_coupon + s.shipping,
        'commission_rate', s.commission_rate, 'commission', s.commission,
        'merchant_net', coalesce(s.subtotal,0) - s.store_coupon - s.commission,
        'eta_min', v_eta_min, 'eta_max', v_eta_max, 'item_count', s.item_count, 'any_ok', s.any_ok)
        order by s.store_name) from stores3 s), '[]'::jsonb),
    'totals', jsonb_build_object(
        'original_subtotal', (select coalesce(sum(unit_price * qty) filter (where ok), 0) from fixed),
        'merchant_discount', (select coalesce(sum(unit_discount * qty) filter (where ok), 0) from fixed),
        'subtotal', (select coalesce(sum(line_total) filter (where ok), 0) from fixed),
        'coupon_discount', v_cdisc,
        'shipping', (select coalesce(sum(shipping), 0) from stores3),
        'grand_total', (select coalesce(sum(line_total) filter (where ok), 0) from fixed) - v_cdisc
                       + (select coalesce(sum(shipping), 0) from stores3)),
    'coupon', case when v_code is null then null else jsonb_build_object(
        'code', v_code, 'valid', v_coupon_ok, 'message', v_coupon_msg,
        'issuer', v_coupon.issuer, 'id', case when v_coupon_ok then v_coupon.id end) end,
    'count', (select coalesce(sum(qty), 0) from fixed),
    'has_issues', (select coalesce(bool_or(not ok), false) from fixed),
    'free_shipping_min', v_free_min)
  into v_result;
  return v_result;
end $$;

create or replace function public.get_cart(p_coupon text default null, p_address uuid default null)
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
  return private.compute_cart(v_uid, p_coupon, v_gov);
end $$;

create or replace function public.cart_set_item(p_offer uuid, p_qty int)
returns int language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_user(); v_cart uuid; v_count int;
begin
  insert into public.carts (user_id) values (v_uid) on conflict (user_id) do update set updated_at = now()
  returning id into v_cart;
  if coalesce(p_qty, 0) <= 0 then
    delete from public.cart_items where cart_id = v_cart and offer_id = p_offer;
  else
    if not exists (select 1 from public.seller_offers so join public.stores s on s.id = so.store_id
                   where so.id = p_offer and so.status in ('active','out_of_stock') and s.status = 'active') then
      raise exception 'هذا المنتج غير متاح' using errcode = 'P0001';
    end if;
    select count(*) into v_count from public.cart_items where cart_id = v_cart;
    if v_count >= 50 and not exists (select 1 from public.cart_items where cart_id = v_cart and offer_id = p_offer) then
      raise exception 'السلة ممتلئة (50 منتجًا كحد أقصى)';
    end if;
    insert into public.cart_items (cart_id, offer_id, qty) values (v_cart, p_offer, least(p_qty, 99))
    on conflict (cart_id, offer_id) do update set qty = least(excluded.qty, 99);
    perform public.track_event('cart', (select pv.product_id from public.seller_offers so
                                        join public.product_variants pv on pv.id = so.variant_id where so.id = p_offer));
  end if;
  return (select coalesce(sum(qty), 0) from public.cart_items where cart_id = v_cart);
end $$;

-- دمج سلة الزائر بعد تسجيل الدخول
create or replace function public.cart_merge(p_items jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_user(); v_cart uuid; r record;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 50 then
    raise exception 'بيانات سلة غير صالحة';
  end if;
  insert into public.carts (user_id) values (v_uid) on conflict (user_id) do update set updated_at = now()
  returning id into v_cart;
  for r in select (e->>'offer_id')::uuid as offer_id, least(greatest((e->>'qty')::int, 1), 99) as qty
           from jsonb_array_elements(p_items) e loop
    if exists (select 1 from public.seller_offers so join public.stores s on s.id = so.store_id
               where so.id = r.offer_id and so.status in ('active','out_of_stock') and s.status = 'active') then
      insert into public.cart_items (cart_id, offer_id, qty) values (v_cart, r.offer_id, r.qty)
      on conflict (cart_id, offer_id) do update set qty = least(greatest(public.cart_items.qty, excluded.qty), 99);
    end if;
  end loop;
  return (select coalesce(sum(qty), 0) from public.cart_items where cart_id = v_cart);
end $$;

-- ---------- مساعدات الطلب ----------
create or replace function private.notify(p_user uuid, p_title text, p_body text, p_link text, p_kind text default 'info', p_dedupe text default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, title, body, link, kind, dedupe_key)
  values (p_user, p_title, p_body, p_link, p_kind, p_dedupe)
  on conflict (dedupe_key) do nothing
$$;

create or replace function private.notify_store(p_store uuid, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, title, body, link, kind)
  select sm.user_id, p_title, p_body, p_link, 'store' from public.store_members sm
  where sm.store_id = p_store and sm.is_active and (sm.role in ('owner','manager') or 'orders' = any(sm.permissions))
$$;

create or replace function private.sub_status_label(s public.sub_order_status) returns text
language sql immutable set search_path = '' as $$
  select case s
    when 'pending_merchant' then 'بانتظار المتجر' when 'accepted' then 'مقبول'
    when 'preparing' then 'قيد التجهيز' when 'ready' then 'جاهز للشحن'
    when 'handed_over' then 'سُلّم للتوصيل' when 'in_transit' then 'في الطريق إليك'
    when 'delivered' then 'تم التسليم' when 'delivery_failed' then 'تعذّر التسليم'
    when 'cancelled' then 'ملغي' when 'return_in_progress' then 'قيد الإرجاع'
    when 'returned' then 'مُرجَع' end
$$;

create or replace function private.random_otp() returns text
language sql volatile set search_path = '' as $$
  select lpad(((('x' || encode(extensions.gen_random_bytes(2), 'hex'))::bit(16)::int) % 10000)::text, 4, '0')
$$;

-- ---------- إنشاء الطلب (معاملة ذرية) ----------
create or replace function public.place_order(p_address uuid, p_coupon text default null,
                                              p_notes text default null, p_idempotency uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_user();
  v_addr record; v_cart jsonb; v_order public.orders; v_sub_id uuid; v_item_id uuid;
  s jsonb; it jsonb; v_i int := 0; v_coupon_id uuid; v_issuer text; v_otp text;
begin
  if p_idempotency is null then raise exception 'مفتاح الطلب مفقود'; end if;
  select * into v_order from public.orders where user_id = v_uid and idempotency_key = p_idempotency;
  if found then return jsonb_build_object('order_id', v_order.id, 'order_no', v_order.order_no, 'duplicate', true); end if;

  if (select count(*) from public.orders where user_id = v_uid and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'محاولات كثيرة، يرجى الانتظار قليلًا' using errcode = 'P0001';
  end if;

  select a.*, c.name_ar as city_name, c.governorate_id, g.name_ar as gov_name into v_addr
  from public.addresses a join public.cities c on c.id = a.city_id join public.governorates g on g.id = c.governorate_id
  where a.id = p_address and a.user_id = v_uid and a.archived_at is null;
  if not found then raise exception 'العنوان غير صالح'; end if;

  perform 1 from public.carts where user_id = v_uid for update;
  v_cart := private.compute_cart(v_uid, p_coupon, v_addr.governorate_id);

  if (v_cart->>'count')::int = 0 then raise exception 'السلة فارغة'; end if;
  if (v_cart->>'has_issues')::boolean then
    raise exception 'بعض المنتجات في سلتك لم تعد متاحة بالكمية المطلوبة، راجع السلة' using errcode = 'P0001';
  end if;
  if v_cart->'coupon' is not null and v_cart->'coupon' <> 'null'::jsonb and not (v_cart->'coupon'->>'valid')::boolean then
    raise exception '%', v_cart->'coupon'->>'message';
  end if;
  v_coupon_id := nullif(v_cart->'coupon'->>'id', '')::uuid;
  v_issuer := v_cart->'coupon'->>'issuer';

  insert into public.orders (user_id, address_snapshot, governorate_id, status, payment_method, payment_status,
                             subtotal, discount_total, shipping_total, grand_total, coupon_id, notes, idempotency_key)
  values (v_uid,
          jsonb_build_object('recipient_name', v_addr.recipient_name, 'phone', v_addr.phone,
                             'governorate', v_addr.gov_name, 'city', v_addr.city_name,
                             'district', v_addr.district, 'street', v_addr.street, 'details', v_addr.details),
          v_addr.governorate_id, 'confirmed', 'cod', 'cod_pending',
          (v_cart->'totals'->>'original_subtotal')::numeric,
          (v_cart->'totals'->>'merchant_discount')::numeric + (v_cart->'totals'->>'coupon_discount')::numeric,
          (v_cart->'totals'->>'shipping')::numeric,
          (v_cart->'totals'->>'grand_total')::numeric,
          v_coupon_id, left(p_notes, 500), p_idempotency)
  returning * into v_order;

  insert into public.order_status_history (order_id, from_status, to_status, actor_id, reason)
  values (v_order.id, null, 'confirmed', v_uid, 'الدفع عند الاستلام');

  for s in select * from jsonb_array_elements(v_cart->'stores') loop
    v_i := v_i + 1;
    insert into public.sub_orders (order_id, store_id, sub_no, subtotal, store_coupon_discount, platform_coupon_discount,
                                   shipping_fee, total, commission_rate, commission_amount, merchant_net)
    values (v_order.id, (s->>'store_id')::uuid, v_order.order_no || '-' || v_i,
            (s->>'subtotal')::numeric, (s->>'store_coupon')::numeric, (s->>'platform_coupon')::numeric,
            (s->>'shipping')::numeric, (s->>'total')::numeric, (s->>'commission_rate')::numeric,
            (s->>'commission')::numeric, (s->>'merchant_net')::numeric)
    returning id into v_sub_id;

    v_otp := private.random_otp();
    insert into public.delivery_codes (sub_order_id, code) values (v_sub_id, v_otp);
    insert into public.order_status_history (order_id, sub_order_id, from_status, to_status, actor_id)
    values (v_order.id, v_sub_id, null, 'pending_merchant', v_uid);
    insert into public.order_price_components (sub_order_id, type, amount, borne_by)
    values (v_sub_id, 'shipping', (s->>'shipping')::numeric, 'customer'),
           (v_sub_id, 'commission', (s->>'commission')::numeric, 'store');

    for it in select * from jsonb_array_elements(v_cart->'items') e where e->>'store_id' = s->>'store_id' loop
      -- خصم المخزون ذريًا: الشرط داخل UPDATE يمنع البيع الزائد
      update public.inventory_levels
         set qty_on_hand = qty_on_hand - (it->>'qty')::int, updated_at = now()
       where offer_id = (it->>'offer_id')::uuid and qty_available >= (it->>'qty')::int;
      if not found then
        raise exception 'نفدت كمية "%" أثناء إتمام الطلب', it->>'name' using errcode = 'P0001';
      end if;
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

    perform private.notify_store((s->>'store_id')::uuid, 'طلب جديد ' || v_order.order_no || '-' || v_i,
      'لديك طلب فرعي جديد بقيمة ' || (s->>'subtotal'), '/merchant/orders/' || v_sub_id);
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
    'سيتم تجهيز طلبك من ' || v_i || ' متجر. الدفع عند الاستلام.', '/account/orders/' || v_order.id, 'order');

  return jsonb_build_object('order_id', v_order.id, 'order_no', v_order.order_no, 'duplicate', false);
end $$;
