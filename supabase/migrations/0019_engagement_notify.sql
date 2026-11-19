-- 0019 — الإعلانات، الأسئلة، الدعم، التحليلات، الإشعارات الخارجية، المهام الدورية، RLS

-- ---------- الإعلانات الممولة ----------
create table public.ad_packages (
  id         int generated always as identity primary key,
  name       text not null check (char_length(name) between 2 and 60),
  placement  text not null check (placement in ('feed','search','home')),
  days       smallint not null check (days between 1 and 90),
  price      numeric(14,2) not null check (price >= 0),
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.ad_campaigns (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete restrict,
  product_id  uuid not null references public.products(id) on delete restrict,
  package_id  int not null references public.ad_packages(id) on delete restrict,
  placement   text not null,
  status      text not null default 'requested' check (status in ('requested','active','rejected','ended','cancelled')),
  starts_at   timestamptz,
  ends_at     timestamptz,
  impressions int not null default 0,
  clicks      int not null default 0,
  charge_id   uuid references public.store_charges(id) on delete restrict,
  note        text check (char_length(note) <= 200),
  created_by  uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index ad_campaigns_active_idx on public.ad_campaigns(placement, ends_at) where status = 'active';
create index ad_campaigns_store_idx on public.ad_campaigns(store_id);
create index ad_campaigns_product_idx on public.ad_campaigns(product_id);
create index ad_campaigns_package_idx on public.ad_campaigns(package_id);
create index ad_campaigns_charge_idx on public.ad_campaigns(charge_id);

insert into public.ad_packages (name, placement, days, price) values
  ('ظهور في الواجهة — أسبوع', 'feed', 7, 5000), ('ظهور في البحث — أسبوع', 'search', 7, 4000), ('ظهور في الواجهة — شهر', 'feed', 30, 15000);

create or replace function public.merchant_request_ad(p_store uuid, p_product uuid, p_package int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare pk public.ad_packages; v_id uuid;
begin
  if not private.store_perm(p_store, 'products') then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  select * into pk from public.ad_packages where id = p_package and is_active;
  if not found then raise exception 'الباقة غير متاحة'; end if;
  if not exists (select 1 from public.seller_offers so join public.product_variants pv on pv.id = so.variant_id
                 join public.products p on p.id = pv.product_id
                 where so.store_id = p_store and pv.product_id = p_product and so.status = 'active' and p.status = 'active') then
    raise exception 'المنتج غير متاح في متجرك';
  end if;
  if exists (select 1 from public.ad_campaigns where store_id = p_store and product_id = p_product and status in ('requested','active')) then
    raise exception 'يوجد طلب إعلان قائم لهذا المنتج';
  end if;
  insert into public.ad_campaigns (store_id, product_id, package_id, placement, created_by)
  values (p_store, p_product, p_package, pk.placement, auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.admin_review_ad(p_id uuid, p_approve boolean, p_prepaid boolean default false, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.ad_campaigns; pk public.ad_packages; v_charge uuid;
begin
  perform private.require_admin();
  select * into a from public.ad_campaigns where id = p_id for update;
  if not found or a.status <> 'requested' then raise exception 'الطلب غير قابل للمراجعة'; end if;
  select * into pk from public.ad_packages where id = a.package_id;
  if p_approve then
    v_charge := private.add_store_charge(a.store_id, 'ad', pk.price, coalesce(p_prepaid, false), a.id, 'إعلان: ' || pk.name);
    update public.ad_campaigns set status = 'active', starts_at = now(), ends_at = now() + make_interval(days => pk.days),
      charge_id = v_charge, reviewed_by = auth.uid(), note = left(p_note, 200) where id = p_id;
    perform private.notify_store(a.store_id, 'تم تفعيل إعلانك', pk.name, '/merchant/ads');
  else
    update public.ad_campaigns set status = 'rejected', reviewed_by = auth.uid(), note = left(coalesce(p_note, 'مرفوض'), 200) where id = p_id;
    perform private.notify_store(a.store_id, 'تم رفض طلب الإعلان', coalesce(p_note, ''), '/merchant/ads');
  end if;
end $$;

create or replace function public.get_sponsored(p_placement text default 'feed', p_limit int default 4)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select jsonb_build_object('campaign_id', a.id, 'id', p.id, 'slug', p.slug, 'name', p.name,
      'image', (select url from public.product_images i where i.product_id = p.id order by sort limit 1),
      'price', so.price - private.offer_discount(so.id, so.store_id, so.price),
      'original_price', case when greatest(so.price, coalesce(so.compare_at_price, 0)) > so.price - private.offer_discount(so.id, so.store_id, so.price)
                             then greatest(so.price, coalesce(so.compare_at_price, 0)) end,
      'rating', p.rating_avg, 'rating_count', p.rating_count, 'offer_id', so.id, 'in_stock', true, 'sponsored', true) x
    from public.ad_campaigns a
    join public.products p on p.id = a.product_id and p.status = 'active'
    join lateral (select so.* from public.seller_offers so join public.product_variants pv on pv.id = so.variant_id
                  left join public.inventory_levels il on il.offer_id = so.id
                  where pv.product_id = p.id and so.store_id = a.store_id and so.status = 'active' and coalesce(il.qty_available, 0) > 0
                  order by so.price limit 1) so on true
    join public.stores s on s.id = a.store_id and s.status = 'active'
    where a.status = 'active' and a.placement = p_placement and now() between a.starts_at and a.ends_at
    order by random() limit least(greatest(coalesce(p_limit, 4), 1), 12)) t
$$;

create or replace function public.ad_track(p_campaign uuid, p_event text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_event = 'click' then
    update public.ad_campaigns set clicks = clicks + 1 where id = p_campaign and status = 'active';
  elsif p_event = 'view' then
    update public.ad_campaigns set impressions = impressions + 1 where id = p_campaign and status = 'active';
  end if;
end $$;

create or replace function private.end_ads() returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  update public.ad_campaigns set status = 'ended' where status = 'active' and ends_at < now();
  get diagnostics v_n = row_count; return v_n;
end $$;

-- ---------- أسئلة المنتجات ----------
create table public.product_questions (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete restrict,
  user_id     uuid not null references public.profiles(id) on delete restrict,
  question    text not null check (char_length(question) between 5 and 500),
  answer      text check (char_length(answer) <= 1000),
  answered_by uuid references public.profiles(id) on delete set null,
  status      text not null default 'pending' check (status in ('pending','published','hidden')),
  created_at  timestamptz not null default now(),
  answered_at timestamptz
);
create index product_questions_product_idx on public.product_questions(product_id, status);
create index product_questions_user_idx on public.product_questions(user_id);
create index product_questions_answered_idx on public.product_questions(answered_by);

create or replace function private.can_answer(p_product uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_staff() or exists (
    select 1 from public.seller_offers so join public.product_variants pv on pv.id = so.variant_id
    where pv.product_id = p_product and so.status in ('active','out_of_stock') and private.store_perm(so.store_id, 'products'))
$$;
grant execute on function private.can_answer(uuid) to authenticated;

create or replace function public.ask_question(p_product uuid, p_question text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_user(); v_id uuid;
begin
  if (select count(*) from public.product_questions where user_id = v_uid and created_at > now() - interval '1 day') >= 5 then
    raise exception 'وصلت للحد اليومي من الأسئلة';
  end if;
  if not exists (select 1 from public.products where id = p_product and status in ('active','out_of_stock')) then raise exception 'المنتج غير موجود'; end if;
  insert into public.product_questions (product_id, user_id, question) values (p_product, v_uid, trim(p_question)) returning id into v_id;
  perform private.notify_store(so.store_id, 'سؤال جديد عن منتج', left(trim(p_question), 80), '/merchant/questions')
  from (select distinct so.store_id from public.seller_offers so join public.product_variants pv on pv.id = so.variant_id
        where pv.product_id = p_product and so.status = 'active') so;
  return v_id;
end $$;

create or replace function public.answer_question(p_id uuid, p_answer text)
returns void language plpgsql security definer set search_path = '' as $$
declare q public.product_questions;
begin
  perform private.require_user();
  select * into q from public.product_questions where id = p_id for update;
  if not found or not private.can_answer(q.product_id) then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_answer, ''))) < 2 then raise exception 'اكتب الإجابة'; end if;
  update public.product_questions set answer = trim(p_answer), answered_by = auth.uid(), answered_at = now(),
    status = case when status = 'hidden' then 'hidden' else 'published' end where id = p_id;
  perform private.notify(q.user_id, 'تمت الإجابة على سؤالك', left(trim(p_answer), 80),
    '/products/' || (select slug from public.products where id = q.product_id), 'system');
end $$;

create or replace function public.admin_moderate_question(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_staff() then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  if p_status not in ('published','hidden') then raise exception 'حالة غير صالحة'; end if;
  update public.product_questions set status = p_status where id = p_id;
end $$;

create or replace function public.get_product_questions(p_product uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'question', q.question, 'answer', q.answer, 'at', q.created_at,
           'answered_at', q.answered_at, 'mine', q.user_id = auth.uid(),
           'asker', coalesce(nullif(split_part(p.full_name, ' ', 1), ''), 'عميل')) order by q.answered_at desc nulls last, q.created_at desc), '[]'::jsonb)
  from (select * from public.product_questions where product_id = p_product
          and ((status = 'published' and answer is not null) or user_id = auth.uid()) order by created_at desc limit 30) q
  join public.profiles p on p.id = q.user_id
$$;

create or replace function public.merchant_questions(p_store uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.store_perm(p_store, 'products') then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'question', q.question, 'answer', q.answer, 'status', q.status,
            'at', q.created_at, 'product', pr.name, 'product_slug', pr.slug) order by (q.answer is null) desc, q.created_at desc)
    from public.product_questions q join public.products pr on pr.id = q.product_id
    where q.status <> 'hidden' and exists (select 1 from public.seller_offers so join public.product_variants pv on pv.id = so.variant_id
                  where pv.product_id = q.product_id and so.store_id = p_store)
      and q.created_at > now() - interval '120 days'), '[]'::jsonb);
end $$;

-- ---------- الدعم الفني ----------
create table public.support_tickets (
  id         uuid primary key default gen_random_uuid(),
  ticket_no  text not null unique default ('TCK-' || lpad(nextval('public.ticket_seq')::text, 6, '0')),
  user_id    uuid not null references public.profiles(id) on delete restrict,
  order_id   uuid references public.orders(id) on delete restrict,
  category   text not null check (category in ('order','payment','delivery','return','account','merchant','other')),
  subject    text not null check (char_length(subject) between 3 and 120),
  status     text not null default 'open' check (status in ('open','pending','resolved','closed')),
  priority   text not null default 'normal' check (priority in ('low','normal','high')),
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_tickets_user_idx on public.support_tickets(user_id);
create index support_tickets_status_idx on public.support_tickets(status, updated_at desc);
create index support_tickets_order_idx on public.support_tickets(order_id);
create index support_tickets_assigned_idx on public.support_tickets(assigned_to);

create table public.support_messages (
  id         bigint generated always as identity primary key,
  ticket_id  uuid not null references public.support_tickets(id) on delete restrict,
  author_id  uuid not null references public.profiles(id) on delete restrict,
  is_staff   boolean not null default false,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index support_messages_ticket_idx on public.support_messages(ticket_id, created_at);
create index support_messages_author_idx on public.support_messages(author_id);

create or replace function private.is_support() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin() or ((private.has_role('support') or private.has_role('operations')) and private.mfa_ok())
$$;
grant execute on function private.is_support() to authenticated;

create or replace function public.open_ticket(p_category text, p_subject text, p_body text, p_order uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_user(); t public.support_tickets;
begin
  if (select count(*) from public.support_tickets where user_id = v_uid and created_at > now() - interval '1 day') >= 5 then
    raise exception 'وصلت للحد اليومي من التذاكر';
  end if;
  if p_order is not null and not exists (select 1 from public.orders where id = p_order and user_id = v_uid) then raise exception 'الطلب غير موجود'; end if;
  insert into public.support_tickets (user_id, order_id, category, subject) values (v_uid, p_order, p_category, trim(p_subject)) returning * into t;
  insert into public.support_messages (ticket_id, author_id, body) values (t.id, v_uid, trim(p_body));
  return jsonb_build_object('id', t.id, 'ticket_no', t.ticket_no);
end $$;

create or replace function public.reply_ticket(p_ticket uuid, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_user(); t public.support_tickets; v_staff boolean := private.is_support();
begin
  select * into t from public.support_tickets where id = p_ticket for update;
  if not found or not (t.user_id = v_uid or v_staff) then raise exception 'التذكرة غير موجودة' using errcode = 'P0002'; end if;
  if t.status = 'closed' then raise exception 'التذكرة مغلقة'; end if;
  insert into public.support_messages (ticket_id, author_id, is_staff, body) values (p_ticket, v_uid, v_staff and t.user_id <> v_uid, trim(p_body));
  update public.support_tickets set updated_at = now(),
    status = case when v_staff and t.user_id <> v_uid then 'pending' else 'open' end,
    assigned_to = case when v_staff and t.user_id <> v_uid then coalesce(assigned_to, v_uid) else assigned_to end where id = p_ticket;
  if v_staff and t.user_id <> v_uid then
    perform private.notify(t.user_id, 'رد على تذكرتك ' || t.ticket_no, left(trim(p_body), 80), '/account/support/' || p_ticket, 'system');
  end if;
end $$;

create or replace function public.set_ticket_status(p_ticket uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_user(); t public.support_tickets;
begin
  select * into t from public.support_tickets where id = p_ticket for update;
  if not found then raise exception 'التذكرة غير موجودة'; end if;
  if private.is_support() then
    if p_status not in ('open','pending','resolved','closed') then raise exception 'حالة غير صالحة'; end if;
  elsif t.user_id = v_uid then
    if p_status <> 'closed' then raise exception 'يمكنك إغلاق التذكرة فقط'; end if;
  else raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  update public.support_tickets set status = p_status, updated_at = now() where id = p_ticket;
end $$;

-- ---------- التحليلات ولوحة التشغيل ----------
create or replace function public.merchant_analytics(p_store uuid, p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_from timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365));
begin
  if not (private.store_perm(p_store, 'orders') or private.is_staff()) then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  return jsonb_build_object(
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'orders', n, 'revenue', rev) order by d) from (
        select (created_at at time zone 'Asia/Aden')::date d, count(*) n, sum(subtotal - store_coupon_discount) rev
        from public.sub_orders where store_id = p_store and created_at >= v_from and status not in ('cancelled','awaiting_payment') group by 1) t), '[]'::jsonb),
    'totals', (select jsonb_build_object('orders', count(*) filter (where status not in ('cancelled','awaiting_payment')),
        'cancelled', count(*) filter (where status = 'cancelled'),
        'delivered', count(*) filter (where status = 'delivered'),
        'revenue', coalesce(sum(subtotal - store_coupon_discount) filter (where status not in ('cancelled','awaiting_payment')), 0),
        'net', coalesce(sum(merchant_net) filter (where status = 'delivered'), 0),
        'avg_order', coalesce(round(avg(subtotal) filter (where status not in ('cancelled','awaiting_payment')), 0), 0),
        'avg_accept_minutes', (select round(avg(extract(epoch from h.created_at - so2.created_at) / 60)) from public.order_status_history h
                               join public.sub_orders so2 on so2.id = h.sub_order_id
                               where so2.store_id = p_store and h.to_status = 'accepted' and so2.created_at >= v_from))
      from public.sub_orders where store_id = p_store and created_at >= v_from),
    'top_products', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'qty', q, 'revenue', r) order by q desc) from (
        select i.product_name name, sum(i.qty) q, sum(i.line_total) r from public.order_items i join public.sub_orders so on so.id = i.sub_order_id
        where so.store_id = p_store and so.created_at >= v_from and so.status not in ('cancelled','awaiting_payment')
        group by 1 order by 2 desc limit 10) t), '[]'::jsonb),
    'views', (select count(*) from public.activity_events e where e.event = 'view' and e.created_at >= v_from
              and e.product_id in (select pv.product_id from public.seller_offers so join public.product_variants pv on pv.id = so.variant_id where so.store_id = p_store)),
    'low_stock', coalesce((select jsonb_agg(jsonb_build_object('product', p.name, 'variant', pv.name, 'qty', il.qty_available) order by il.qty_available) from (
        select * from public.seller_offers where store_id = p_store and status = 'active') so
        join public.inventory_levels il on il.offer_id = so.id join public.product_variants pv on pv.id = so.variant_id
        join public.products p on p.id = pv.product_id where il.qty_available <= 3), '[]'::jsonb),
    'rating', (select jsonb_build_object('avg', rating_avg, 'count', rating_count) from public.stores where id = p_store));
end $$;

create or replace function public.admin_ops()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_sla int := (private.setting('merchant_sla_hours', '4'::jsonb))::text::int; v_today timestamptz := date_trunc('day', now() at time zone 'Asia/Aden') at time zone 'Asia/Aden';
begin
  if not private.is_staff() then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  return jsonb_build_object(
    'pending_payments', (select count(*) from public.orders where status = 'pending_payment' and payment_status = 'unpaid'),
    'sla_late', (select count(*) from public.sub_orders where status = 'pending_merchant' and updated_at < now() - make_interval(hours => v_sla)),
    'preparing', (select count(*) from public.sub_orders where status in ('accepted','preparing')),
    'ready', (select count(*) from public.sub_orders where status = 'ready'),
    'batches_waiting', (select count(*) from public.merchant_batches where status in ('closed','picked_up')),
    'at_hub', (select count(*) from public.orders where fulfillment <> 'direct' and status in ('confirmed','in_progress','packed')
                and exists (select 1 from public.sub_orders s where s.order_id = orders.id and s.status = 'at_hub')),
    'out_for_delivery', (select count(*) from public.sub_orders where status = 'in_transit'),
    'failed', (select count(*) from public.sub_orders where status = 'delivery_failed'),
    'returns', (select count(*) from public.returns where status in ('requested','approved','received')),
    'tickets', (select count(*) from public.support_tickets where status = 'open'),
    'questions', (select count(*) from public.product_questions where answer is null and status <> 'hidden' and created_at < now() - interval '24 hours'),
    'ads', (select count(*) from public.ad_campaigns where status = 'requested'),
    'outbox_failed', (select count(*) from public.message_outbox where status = 'failed' and created_at > now() - interval '3 days'),
    'gmv_today', (select coalesce(sum(grand_total), 0) from public.orders where created_at >= v_today and status not in ('cancelled','expired','pending_payment')),
    'orders_today', (select count(*) from public.orders where created_at >= v_today),
    'gmv_7d', (select coalesce(sum(grand_total), 0) from public.orders where created_at >= now() - interval '7 days' and status not in ('cancelled','expired','pending_payment')),
    'late_list', coalesce((select jsonb_agg(jsonb_build_object('id', so.id, 'sub_no', so.sub_no, 'store', s.name, 'phone', s.phone, 'since', so.updated_at) order by so.updated_at)
                 from (select * from public.sub_orders where status = 'pending_merchant' and updated_at < now() - make_interval(hours => v_sla) order by updated_at limit 20) so
                 join public.stores s on s.id = so.store_id), '[]'::jsonb),
    'failed_list', coalesce((select jsonb_agg(jsonb_build_object('id', so.id, 'sub_no', so.sub_no, 'reason', so.cancel_reason, 'since', so.updated_at))
                 from (select * from public.sub_orders where status = 'delivery_failed' order by updated_at limit 20) so), '[]'::jsonb));
end $$;

-- ---------- الإشعارات الخارجية: واتساب أساسي، SMS اختياري ----------
insert into public.app_settings (key, value) values
  ('notify', '{
    "events": {"order_placed": true, "payment_pending": true, "payment_confirmed": true, "out_for_delivery": true, "delivered": true, "cancelled": true},
    "whatsapp": {"enabled": false, "phone_number_id": "", "api_version": "v21.0", "lang": "ar",
                 "templates": {"order_placed": "", "payment_pending": "", "payment_confirmed": "", "out_for_delivery": "", "delivered": "", "cancelled": ""}},
    "sms": {"enabled": false, "url": "", "auth_header": "Authorization", "auth_prefix": "Bearer ", "sender": "Sawqy",
            "body_template": "{\"to\":\"{{to}}\",\"from\":\"{{sender}}\",\"text\":\"{{text}}\"}"}
  }'::jsonb)
on conflict (key) do nothing;

create table public.message_outbox (
  id         bigint generated always as identity primary key,
  event      text not null check (event ~ '^[a-z_]{2,30}$'),
  channel    text not null check (channel in ('whatsapp','sms')),
  user_id    uuid references public.profiles(id) on delete set null,
  order_id   uuid references public.orders(id) on delete restrict,
  to_phone   text not null check (to_phone ~ '^[0-9]{8,15}$'),
  text_body  text not null check (char_length(text_body) <= 1000),
  params     jsonb not null default '[]'::jsonb,
  status     text not null default 'queued' check (status in ('queued','sending','sent','failed','skipped')),
  attempts   smallint not null default 0,
  request_id bigint,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);
create index message_outbox_status_idx on public.message_outbox(status, created_at);
create index message_outbox_user_idx on public.message_outbox(user_id);
create index message_outbox_order_idx on public.message_outbox(order_id);

create or replace function private.event_text(p_event text, d jsonb) returns text
language sql immutable set search_path = '' as $$
  select case p_event
    when 'order_placed' then 'سوقي: تم استلام طلبك ' || (d->>'order_no') || ' بقيمة ' || (d->>'total') || ' ر.ي. الدفع عند الاستلام.'
    when 'payment_pending' then 'سوقي: طلبك ' || (d->>'order_no') || ' بانتظار الدفع (' || (d->>'total') || ' ر.ي). أرسل إثبات الدفع عبر واتساب ليبدأ التجهيز.'
    when 'payment_confirmed' then 'سوقي: تم تأكيد دفع طلبك ' || (d->>'order_no') || ' وبدأ التجهيز.'
    when 'out_for_delivery' then 'سوقي: طلبك ' || (d->>'order_no') ||
         case when (d->>'pickup')::boolean then ' جاهز في نقطة الاستلام.' else ' في الطريق إليك.' end ||
         ' رمز التسليم: ' || (d->>'otp') || ' (لا تشاركه إلا عند الاستلام).'
    when 'delivered' then 'سوقي: تم تسليم طلبك ' || (d->>'order_no') || '. شكرًا لتسوقك معنا!'
    when 'cancelled' then 'سوقي: أُلغي طلبك ' || (d->>'order_no') || '.'
    else 'سوقي: تحديث على طلبك ' || coalesce(d->>'order_no', '') end
$$;

create or replace function private.event_params(p_event text, d jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case p_event
    when 'out_for_delivery' then jsonb_build_array(d->>'order_no', d->>'otp')
    when 'order_placed' then jsonb_build_array(d->>'order_no', d->>'total')
    when 'payment_pending' then jsonb_build_array(d->>'order_no', d->>'total')
    else jsonb_build_array(d->>'order_no') end
$$;

create or replace function private.enqueue_event(p_event text, p_user uuid, p_order uuid, p_data jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare cfg jsonb := private.setting('notify', '{}'::jsonb); v_phone text; v_text text;
begin
  if not coalesce((cfg->'events'->>p_event)::boolean, false) then return; end if;
  if not coalesce((cfg->'whatsapp'->>'enabled')::boolean, false) and not coalesce((cfg->'sms'->>'enabled')::boolean, false) then return; end if;
  if p_order is not null then select private.phone_e164(address_snapshot->>'phone') into v_phone from public.orders where id = p_order; end if;
  if v_phone is null then select private.phone_e164(phone) into v_phone from public.profiles where id = p_user; end if;
  if v_phone is null then return; end if;
  v_text := private.event_text(p_event, p_data);
  if coalesce((cfg->'whatsapp'->>'enabled')::boolean, false) then
    insert into public.message_outbox (event, channel, user_id, order_id, to_phone, text_body, params)
    values (p_event, 'whatsapp', p_user, p_order, v_phone, v_text, private.event_params(p_event, p_data));
  end if;
  if coalesce((cfg->'sms'->>'enabled')::boolean, false) then
    insert into public.message_outbox (event, channel, user_id, order_id, to_phone, text_body)
    values (p_event, 'sms', p_user, p_order, v_phone, v_text);
  end if;
end $$;

-- أحداث الطلب المركزية
create or replace function private.order_events() returns trigger
language plpgsql security definer set search_path = '' as $$
declare d jsonb := jsonb_build_object('order_no', new.order_no, 'total', round(new.grand_total)::text);
begin
  if tg_op = 'INSERT' then
    perform private.enqueue_event(case when new.status = 'pending_payment' then 'payment_pending' else 'order_placed' end, new.user_id, new.id, d);
  else
    if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' then
      perform private.enqueue_event('payment_confirmed', new.user_id, new.id, d);
    end if;
    if new.status is distinct from old.status then
      if new.status = 'delivered' then perform private.enqueue_event('delivered', new.user_id, new.id, d);
      elsif new.status in ('cancelled','expired') then perform private.enqueue_event('cancelled', new.user_id, new.id, d);
      end if;
    end if;
  end if;
  return null;
end $$;
create trigger trg_order_events after insert or update of status, payment_status on public.orders
  for each row execute function private.order_events();

-- الأسرار في Vault: كتابة فقط من الإدارة، ولا تُقرأ أبدًا عبر الواجهة
create or replace function public.admin_set_secret(p_name text, p_value text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.require_admin();
  if p_name not in ('whatsapp_token','sms_token') then raise exception 'اسم سر غير مسموح'; end if;
  if coalesce(trim(p_value), '') = '' or char_length(p_value) > 2000 then raise exception 'قيمة غير صالحة'; end if;
  select id into v_id from vault.secrets where name = 'sawqy_' || p_name;
  if v_id is null then perform vault.create_secret(trim(p_value), 'sawqy_' || p_name, 'Sawqy notifications');
  else perform vault.update_secret(v_id, trim(p_value)); end if;
  insert into public.audit_logs (actor_id, action, entity, entity_id) values (auth.uid(), 'secret_set', 'vault', p_name);
end $$;

create or replace function public.admin_secret_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'whatsapp_token', exists (select 1 from vault.secrets where name = 'sawqy_whatsapp_token'),
    'sms_token', exists (select 1 from vault.secrets where name = 'sawqy_sms_token'));
end $$;

create or replace function private.secret(p_name text) returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'sawqy_' || p_name limit 1
$$;

-- الإرسال الفعلي عبر pg_net (غير متزامن) ثم المطابقة مع الاستجابات
create or replace function private.dispatch_outbox() returns int
language plpgsql security definer set search_path = '' as $$
declare cfg jsonb := private.setting('notify', '{}'::jsonb); m public.message_outbox; v_req bigint; v_n int := 0;
        v_tok text; v_body jsonb; v_params jsonb; v_tpl text; v_url text; v_sms text;
begin
  for m in select * from public.message_outbox where status = 'queued' order by id limit 50 for update skip locked loop
    begin
      if m.channel = 'whatsapp' then
        v_tok := private.secret('whatsapp_token');
        if not coalesce((cfg->'whatsapp'->>'enabled')::boolean, false) or v_tok is null
           or coalesce(cfg->'whatsapp'->>'phone_number_id', '') !~ '^[0-9]{5,30}$' then
          update public.message_outbox set status = 'skipped', last_error = 'واتساب غير مُعدّ' where id = m.id; continue;
        end if;
        v_tpl := nullif(cfg->'whatsapp'->'templates'->>m.event, '');
        select coalesce(jsonb_agg(jsonb_build_object('type', 'text', 'text', coalesce(p #>> '{}', ''))), '[]'::jsonb)
          into v_params from jsonb_array_elements(m.params) p;
        v_body := case when v_tpl is not null then jsonb_build_object('messaging_product', 'whatsapp', 'to', m.to_phone, 'type', 'template',
                    'template', jsonb_build_object('name', v_tpl, 'language', jsonb_build_object('code', coalesce(cfg->'whatsapp'->>'lang', 'ar')),
                      'components', jsonb_build_array(jsonb_build_object('type', 'body', 'parameters', v_params))))
                  else jsonb_build_object('messaging_product', 'whatsapp', 'to', m.to_phone, 'type', 'text',
                    'text', jsonb_build_object('body', m.text_body, 'preview_url', false)) end;
        select net.http_post(
          url := 'https://graph.facebook.com/' || coalesce(nullif(cfg->'whatsapp'->>'api_version', ''), 'v21.0') || '/' || (cfg->'whatsapp'->>'phone_number_id') || '/messages',
          body := v_body,
          headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_tok),
          timeout_milliseconds := 8000) into v_req;
      else
        v_tok := private.secret('sms_token'); v_url := cfg->'sms'->>'url';
        if not coalesce((cfg->'sms'->>'enabled')::boolean, false) or coalesce(v_url, '') !~ '^https://' then
          update public.message_outbox set status = 'skipped', last_error = 'SMS غير مُعدّ' where id = m.id; continue;
        end if;
        -- القيم تُحقن كسلاسل JSON مُهرّبة بالكامل (القالب يضع "{{text}}" بين علامتي تنصيص)
        v_sms := replace(replace(replace(coalesce(cfg->'sms'->>'body_template', '{"to":"{{to}}","text":"{{text}}"}'),
                   '"{{to}}"', to_jsonb(m.to_phone)::text), '"{{sender}}"', to_jsonb(coalesce(cfg->'sms'->>'sender', ''))::text),
                   '"{{text}}"', to_jsonb(m.text_body)::text);
        select net.http_post(url := v_url, body := v_sms::jsonb,
          headers := jsonb_build_object('Content-Type', 'application/json') ||
                     case when v_tok is not null then jsonb_build_object(coalesce(nullif(cfg->'sms'->>'auth_header', ''), 'Authorization'),
                                                                         coalesce(cfg->'sms'->>'auth_prefix', '') || v_tok) else '{}'::jsonb end,
          timeout_milliseconds := 8000) into v_req;
      end if;
      update public.message_outbox set status = 'sending', request_id = v_req, attempts = attempts + 1 where id = m.id;
      v_n := v_n + 1;
    exception when others then
      update public.message_outbox set status = 'failed', attempts = attempts + 1, last_error = left(sqlerrm, 300) where id = m.id;
    end;
  end loop;
  return v_n;
end $$;

create or replace function private.reconcile_outbox() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; v_n int := 0;
begin
  for r in select m.id, m.attempts, h.status_code, h.content, h.error_msg, h.timed_out
           from public.message_outbox m join net._http_response h on h.id = m.request_id
           where m.status = 'sending' limit 200 loop
    if r.status_code between 200 and 299 then
      update public.message_outbox set status = 'sent', sent_at = now(), last_error = null where id = r.id;
    elsif r.attempts < 3 and (r.timed_out or r.status_code >= 500 or r.status_code is null) then
      update public.message_outbox set status = 'queued', last_error = left(coalesce(r.error_msg, r.content, 'timeout'), 300) where id = r.id;
    else
      update public.message_outbox set status = 'failed', last_error = left(coalesce(r.status_code::text || ': ', '') || coalesce(r.content, r.error_msg, ''), 300) where id = r.id;
    end if;
    v_n := v_n + 1;
  end loop;
  update public.message_outbox set status = 'failed', last_error = 'لا توجد استجابة'
  where status = 'sending' and created_at < now() - interval '30 minutes';
  return v_n;
end $$;

create or replace function public.admin_notify_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'settings', private.setting('notify', '{}'::jsonb),
    'secrets', public.admin_secret_status(),
    'stats', (select jsonb_object_agg(status, n) from (select status, count(*) n from public.message_outbox where created_at > now() - interval '7 days' group by status) t),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'event', event, 'channel', channel,
                 'to', '•••' || right(to_phone, 4), 'status', status, 'error', last_error, 'at', created_at) order by id desc)
               from (select * from public.message_outbox order by id desc limit 50) t), '[]'::jsonb));
end $$;

create or replace function public.admin_test_notify(p_phone text, p_channel text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_phone text := private.phone_e164(p_phone);
begin
  perform private.require_admin();
  if v_phone is null then raise exception 'رقم غير صالح'; end if;
  if p_channel not in ('whatsapp','sms') then raise exception 'قناة غير صالحة'; end if;
  insert into public.message_outbox (event, channel, user_id, to_phone, text_body, params)
  values ('test', p_channel, auth.uid(), v_phone, 'سوقي: رسالة تجريبية — الإشعارات تعمل بنجاح.', '[]'::jsonb);
end $$;

create or replace function public.admin_retry_message(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  update public.message_outbox set status = 'queued', attempts = 0, last_error = null where id = p_id and status in ('failed','skipped');
end $$;

-- ---------- المهام الدورية ----------
create or replace function private.cron_minutely() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.expire_unpaid_orders();
  perform private.reconcile_outbox();
  perform private.dispatch_outbox();
  if extract(minute from now())::int % 5 = 0 then
    perform private.close_due_batches();
    perform private.release_points();
    perform private.end_ads();
  end if;
  if extract(minute from now())::int % 15 = 0 then perform private.sla_reminders(); end if;
end $$;

do $$ begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'sawqy-minutely';
  perform cron.schedule('sawqy-minutely', '* * * * *', 'select private.cron_minutely()');
end $$;

-- ---------- RLS ----------
do $$ declare t text; begin
  foreach t in array array['user_checkins','loyalty_campaigns','points_rewards','reward_claims','coupon_packs','coupon_pack_claims',
    'gift_campaigns','gift_claims','raffles','raffle_entries','ad_packages','ad_campaigns','product_questions','support_tickets',
    'support_messages','message_outbox'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

grant select on public.user_checkins, public.reward_claims, public.coupon_pack_claims, public.gift_claims, public.raffle_entries to authenticated;
create policy own on public.user_checkins for select to authenticated using (user_id = (select auth.uid()) or (select private.is_staff()));
create policy own on public.reward_claims for select to authenticated using (user_id = (select auth.uid()) or (select private.is_staff()));
create policy own on public.coupon_pack_claims for select to authenticated using (user_id = (select auth.uid()) or (select private.is_staff()));
create policy own on public.gift_claims for select to authenticated using (user_id = (select auth.uid()) or (select private.is_staff()));
create policy own on public.raffle_entries for select to authenticated using (user_id = (select auth.uid()) or (select private.is_staff()));

grant select on public.loyalty_campaigns, public.points_rewards, public.coupon_packs, public.gift_campaigns, public.raffles, public.ad_packages to anon, authenticated;
create policy read_active on public.loyalty_campaigns for select using (is_active or (select private.is_staff()));
create policy read_active on public.points_rewards for select using (is_active or (select private.is_staff()));
create policy read_active on public.coupon_packs for select using (is_active or (select private.is_staff()));
create policy read_active on public.gift_campaigns for select using (is_active or (select private.is_staff()));
create policy read_all on public.raffles for select using (status <> 'cancelled' or (select private.is_staff()));
create policy read_active on public.ad_packages for select using (is_active or (select private.is_staff()));

grant select on public.ad_campaigns to authenticated;
create policy scoped on public.ad_campaigns for select to authenticated using ((select private.store_perm(store_id, 'products')) or (select private.is_staff()));

grant select on public.product_questions to anon, authenticated;
create policy visible on public.product_questions for select using (
  status = 'published' or user_id = (select auth.uid()) or (select private.can_answer(product_id)));

grant select on public.support_tickets, public.support_messages to authenticated;
create policy own_or_support on public.support_tickets for select to authenticated using (user_id = (select auth.uid()) or (select private.is_support()));
create policy own_or_support on public.support_messages for select to authenticated using (
  exists (select 1 from public.support_tickets t where t.id = ticket_id and (t.user_id = (select auth.uid()) or (select private.is_support()))));

grant select on public.message_outbox to authenticated;
create policy admin_only on public.message_outbox for select to authenticated using ((select private.is_admin()));

create trigger trg_ad_campaigns_audit after update on public.ad_campaigns for each row execute function private.audit_row();
create trigger trg_raffles_audit after insert or update on public.raffles for each row execute function private.audit_row();

-- ---------- صلاحيات الدوال ----------
revoke execute on function private.award_points(uuid, int, text, text, uuid, text, timestamptz), private.release_points(),
  private.personal_coupon(uuid, text, numeric, numeric, int, text), private.end_ads(), private.enqueue_event(text, uuid, uuid, jsonb),
  private.secret(text), private.dispatch_outbox(), private.reconcile_outbox(), private.cron_minutely()
  from public, anon, authenticated;

do $$ declare f text; begin
  foreach f in array array[
    'public.daily_checkin()', 'public.apply_referral(text)', 'public.redeem_reward(int)', 'public.claim_coupon_pack(int)',
    'public.claim_gifts(int, text[])', 'public.enter_raffle(int)', 'public.admin_draw_raffle(int)', 'public.loyalty_center()',
    'public.admin_save_loyalty_item(text, int, jsonb)', 'public.admin_adjust_points(uuid, int, text)', 'public.admin_loyalty_overview()',
    'public.merchant_request_ad(uuid, uuid, int)', 'public.admin_review_ad(uuid, boolean, boolean, text)',
    'public.ask_question(uuid, text)', 'public.answer_question(uuid, text)', 'public.admin_moderate_question(uuid, text)',
    'public.merchant_questions(uuid)', 'public.open_ticket(text, text, text, uuid)', 'public.reply_ticket(uuid, text)',
    'public.set_ticket_status(uuid, text)', 'public.merchant_analytics(uuid, int)', 'public.admin_ops()',
    'public.admin_set_secret(text, text)', 'public.admin_secret_status()', 'public.admin_notify_overview()',
    'public.admin_test_notify(text, text)', 'public.admin_retry_message(bigint)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
grant execute on function public.get_sponsored(text, int), public.ad_track(uuid, text), public.get_product_questions(uuid) to anon, authenticated;
