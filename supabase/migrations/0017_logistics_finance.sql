-- =====================================================================
-- 0017 — اللوجستيات (المندوب / المركز / الطرد الموحد) والمالية (قيد مزدوج، رسوم، اشتراكات، توريد نقدي)
-- =====================================================================

-- ---------- اللوجستيات ----------
create table public.courier_remittances (
  id          uuid primary key default gen_random_uuid(),
  courier_id  uuid not null references public.profiles(id) on delete restrict,
  amount      numeric(14,2) not null check (amount > 0),
  ref         text check (char_length(ref) <= 120),
  received_by uuid not null references public.profiles(id) on delete restrict,
  created_at  timestamptz not null default now()
);
create index courier_remittances_courier_idx on public.courier_remittances(courier_id);
create index courier_remittances_received_idx on public.courier_remittances(received_by);

alter table public.payments add column if not exists courier_id uuid references public.profiles(id) on delete restrict;
create index if not exists payments_courier_idx on public.payments(courier_id);

-- مؤقت: يُستبدل في 0018 بصندوق الرسائل الصادرة (واتساب / SMS)
create or replace function private.enqueue_event(p_event text, p_user uuid, p_order uuid, p_data jsonb)
returns void language plpgsql security definer set search_path = '' as $$ begin return; end $$;

-- المندوب المسند فقط يرى بيانات التوصيل المرتبطة به (عبر الدوال أدناه، لا عبر الجداول مباشرة)

-- إغلاق دفعة التاجر وتوليد رمز الاستلام الذي يعطيه التاجر للمندوب
create or replace function public.merchant_close_batch(p_batch uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare b public.merchant_batches; v_code text := private.random_otp();
begin
  perform private.require_user();
  select * into b from public.merchant_batches where id = p_batch for update;
  if not found or not private.store_perm(b.store_id, 'orders') then raise exception 'الدفعة غير موجودة' using errcode = 'P0002'; end if;
  if b.status <> 'open' then raise exception 'الدفعة مغلقة مسبقًا'; end if;
  if not exists (select 1 from public.sub_orders where batch_id = p_batch and status = 'ready') then raise exception 'الدفعة فارغة'; end if;
  update public.merchant_batches set status = 'closed', closed_at = now(), pickup_code = v_code where id = p_batch;
  return jsonb_build_object('batch_no', b.batch_no, 'pickup_code', v_code);
end $$;

create or replace function public.merchant_batches_list(p_store uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.store_perm(p_store, 'orders') then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', b.id, 'batch_no', b.batch_no, 'status', b.status, 'pickup_code', b.pickup_code,
      'created_at', b.created_at, 'closed_at', b.closed_at, 'picked_up_at', b.picked_up_at,
      'location', (select name from public.locations l where l.id = b.location_id),
      'subs', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'sub_no', s.sub_no, 'status', s.status,
                 'items', (select coalesce(jsonb_agg(jsonb_build_object('name', i.product_name, 'variant', i.variant_name,
                             'qty', i.qty, 'line_code', i.line_code)), '[]'::jsonb) from public.order_items i where i.sub_order_id = s.id))
               order by s.sub_no), '[]'::jsonb) from public.sub_orders s where s.batch_id = b.id))
    order by b.created_at desc) from (select * from public.merchant_batches where store_id = p_store order by created_at desc limit 60) b), '[]'::jsonb);
end $$;

-- إغلاق تلقائي للدفعات المفتوحة حسب دورة التجميع
create or replace function private.close_due_batches() returns int
language plpgsql security definer set search_path = '' as $$
declare v_min int := (private.setting('batch_cycle_minutes', '0'::jsonb))::text::int; v_n int;
begin
  if v_min <= 0 then return 0; end if;
  update public.merchant_batches b set status = 'closed', closed_at = now(), pickup_code = private.random_otp()
  where b.status = 'open' and b.created_at < now() - make_interval(mins => v_min)
    and exists (select 1 from public.sub_orders s where s.batch_id = b.id and s.status = 'ready');
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- المندوب يستلم الدفعة من التاجر بالرمز
create or replace function public.courier_pickup_batch(p_batch_no text, p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare b public.merchant_batches; r public.sub_orders; v_n int := 0;
begin
  if not (private.is_courier() or private.is_hub()) then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  select * into b from public.merchant_batches where batch_no = upper(trim(p_batch_no)) for update;
  if not found or b.status <> 'closed' then raise exception 'الدفعة غير جاهزة للاستلام'; end if;
  if coalesce(trim(p_code), '') <> b.pickup_code then raise exception 'رمز الاستلام غير صحيح'; end if;
  update public.merchant_batches set status = 'picked_up', picked_up_at = now(), picked_up_by = auth.uid() where id = b.id;
  for r in select * from public.sub_orders where batch_id = b.id and status = 'ready' for update loop
    perform private.apply_sub_status(r, 'handed_over', 'استلام الدفعة ' || b.batch_no);
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('batch_no', b.batch_no, 'subs', v_n);
end $$;

-- المركز يستلم الدفعة
create or replace function public.hub_receive_batch(p_batch_no text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare b public.merchant_batches; r public.sub_orders; v_n int := 0;
begin
  if not private.is_hub() then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  select * into b from public.merchant_batches where batch_no = upper(trim(p_batch_no)) for update;
  if not found or b.status not in ('picked_up','closed') then raise exception 'الدفعة غير قابلة للاستلام في المركز'; end if;
  if b.status = 'closed' then
    for r in select * from public.sub_orders where batch_id = b.id and status = 'ready' for update loop
      perform private.apply_sub_status(r, 'handed_over', 'تسليم مباشر للمركز');
    end loop;
  end if;
  update public.merchant_batches set status = 'received', received_at = now(), received_by = auth.uid() where id = b.id;
  for r in select * from public.sub_orders where batch_id = b.id and status = 'handed_over' for update loop
    perform private.apply_sub_status(r, 'at_hub', 'وصل مركز التجميع');
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('batch_no', b.batch_no, 'subs', v_n);
end $$;

-- تغليف الطرد الموحد
create or replace function public.hub_pack_order(p_order uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.orders; v_box text; v_wait int;
begin
  if not private.is_hub() then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found or o.fulfillment = 'direct' then raise exception 'الطلب لا يمر بالمركز'; end if;
  if o.packed_at is not null then raise exception 'تم تغليف الطلب مسبقًا'; end if;
  select count(*) into v_wait from public.sub_orders where order_id = p_order and status not in ('at_hub','cancelled');
  if v_wait > 0 and private.setting('hub_allow_partial', 'false'::jsonb) <> 'true'::jsonb then
    raise exception 'لم تصل جميع شحنات الطلب إلى المركز بعد (% متبقية)', v_wait;
  end if;
  if not exists (select 1 from public.sub_orders where order_id = p_order and status = 'at_hub') then raise exception 'لا توجد شحنات في المركز'; end if;
  v_box := 'BOX-' || private.yr() || '-' || lpad(nextval('public.box_seq')::text, 6, '0');
  update public.orders set box_code = v_box, packed_at = now() where id = p_order;
  perform private.refresh_order(p_order);
  return jsonb_build_object('box_code', v_box);
end $$;

-- إخراج الطرد للتوصيل وإسناده لمندوب (أو جاهز للاستلام من النقطة)
create or replace function public.hub_dispatch_order(p_order uuid, p_courier uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.orders; r public.sub_orders; v_code text;
begin
  if not private.is_hub() then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found or o.packed_at is null then raise exception 'يجب تغليف الطلب أولًا'; end if;
  if o.fulfillment <> 'pickup' then
    if p_courier is null or not exists (select 1 from public.user_roles where user_id = p_courier and role = 'courier') then
      raise exception 'اختر مندوبًا صالحًا';
    end if;
  end if;
  update public.orders set courier_id = p_courier, out_for_delivery_at = now() where id = p_order;
  for r in select * from public.sub_orders where order_id = p_order and status = 'at_hub' for update loop
    update public.sub_orders set courier_id = p_courier where id = r.id;
    perform private.apply_sub_status(r, 'in_transit', case when o.fulfillment = 'pickup' then 'جاهز في نقطة الاستلام' else 'خرج للتوصيل' end);
  end loop;
  select code into v_code from public.order_delivery_codes where order_id = p_order;
  perform private.notify(o.user_id,
    case when o.fulfillment = 'pickup' then 'طلبك جاهز للاستلام ' else 'طلبك في الطريق ' end || o.order_no,
    'رمز التسليم: ' || v_code || ' — لا تشاركه إلا عند الاستلام.', '/account/orders/' || p_order, 'order');
  perform private.enqueue_event('out_for_delivery', o.user_id, p_order,
    jsonb_build_object('order_no', o.order_no, 'otp', v_code, 'pickup', o.fulfillment = 'pickup'));
end $$;

-- تأكيد تسليم الطرد الموحد برمز الطلب
create or replace function public.confirm_order_delivery(p_order uuid, p_otp text, p_cash numeric default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.orders; c public.order_delivery_codes; r public.sub_orders;
begin
  perform private.require_user();
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'الطلب غير موجود'; end if;
  if not (o.courier_id = auth.uid() and private.is_courier()) and not private.is_hub() then
    raise exception 'لا تملك صلاحية' using errcode = '42501';
  end if;
  if not exists (select 1 from public.sub_orders where order_id = p_order and status = 'in_transit') then
    raise exception 'الطلب ليس في مرحلة التسليم';
  end if;
  select * into c from public.order_delivery_codes where order_id = p_order for update;
  if c.attempts >= 5 then return jsonb_build_object('ok', false, 'message', 'تم تجاوز عدد المحاولات، يلزم تدخل الإدارة'); end if;
  if coalesce(trim(p_otp), '') <> c.code then
    update public.order_delivery_codes set attempts = attempts + 1 where order_id = p_order;
    return jsonb_build_object('ok', false, 'message', 'رمز التسليم غير صحيح', 'remaining', 4 - c.attempts);
  end if;
  for r in select * from public.sub_orders where order_id = p_order and status = 'in_transit' for update loop
    perform private.apply_sub_status(r, 'delivered', 'تأكيد برمز OTP');
  end loop;
  update public.payments set courier_id = o.courier_id where order_id = p_order and method = 'cod' and courier_id is null;
  return jsonb_build_object('ok', true, 'message', 'تم تأكيد التسليم');
end $$;

-- التوصيل المباشر: الإدارة تسند المندوب، والمندوب يبدأ التوصيل ويؤكد بالرمز
create or replace function public.ops_assign_courier(p_sub uuid, p_courier uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not ((private.has_role('operations') and private.mfa_ok()) or private.is_admin()) then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  if not exists (select 1 from public.user_roles where user_id = p_courier and role = 'courier') then raise exception 'المستخدم ليس مندوبًا'; end if;
  update public.sub_orders set courier_id = p_courier where id = p_sub and status in ('ready','handed_over','delivery_failed');
  if not found then raise exception 'الطلب غير قابل للإسناد'; end if;
end $$;

create or replace function public.courier_update_sub(p_sub uuid, p_to public.sub_order_status, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.sub_orders;
begin
  if not private.is_courier() then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  select * into v from public.sub_orders where id = p_sub for update;
  if not found or v.courier_id is distinct from auth.uid() then raise exception 'الطلب غير مسند إليك'; end if;
  if (v.status, p_to) not in (('ready','handed_over'), ('handed_over','in_transit'), ('in_transit','delivery_failed'), ('delivery_failed','in_transit')) then
    raise exception 'إجراء غير مسموح';
  end if;
  if p_to = 'delivery_failed' and coalesce(trim(p_reason), '') = '' then raise exception 'اذكر سبب التعذّر'; end if;
  perform private.apply_sub_status(v, p_to, p_reason);
  if p_to = 'in_transit' then
    perform private.enqueue_event('out_for_delivery', (select user_id from public.orders where id = v.order_id), v.order_id,
      jsonb_build_object('order_no', (select order_no from public.orders where id = v.order_id),
                         'otp', (select code from public.delivery_codes where sub_order_id = v.id), 'pickup', false));
  end if;
end $$;

create or replace function public.confirm_delivery(p_sub uuid, p_otp text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.sub_orders; v_code public.delivery_codes;
begin
  perform private.require_user();
  select * into v from public.sub_orders where id = p_sub for update;
  if not found then raise exception 'الطلب غير موجود'; end if;
  if not ((private.has_role('operations') and private.mfa_ok()) or private.is_admin()
          or (private.is_courier() and v.courier_id = auth.uid())) then
    raise exception 'لا تملك صلاحية' using errcode = '42501';
  end if;
  if v.status <> 'in_transit' then raise exception 'الطلب ليس في مرحلة التوصيل'; end if;
  select * into v_code from public.delivery_codes where sub_order_id = p_sub for update;
  if v_code.attempts >= 5 then
    return jsonb_build_object('ok', false, 'message', 'تم تجاوز عدد المحاولات، يلزم تسليم استثنائي من الإدارة');
  end if;
  if coalesce(trim(p_otp), '') <> v_code.code then
    update public.delivery_codes set attempts = attempts + 1 where sub_order_id = p_sub;
    return jsonb_build_object('ok', false, 'message', 'رمز التسليم غير صحيح', 'remaining', 4 - v_code.attempts);
  end if;
  perform private.apply_sub_status(v, 'delivered', 'تأكيد برمز OTP');
  update public.payments set courier_id = v.courier_id where sub_order_id = p_sub and method = 'cod' and courier_id is null;
  return jsonb_build_object('ok', true, 'message', 'تم تأكيد التسليم');
end $$;

-- مهام المندوب: الحد الأدنى من بيانات العميل وللطلبات المسندة إليه فقط
create or replace function public.courier_tasks()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if not private.is_courier() then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  return jsonb_build_object(
    'batches', coalesce((select jsonb_agg(jsonb_build_object('batch_no', b.batch_no, 'store', s.name, 'store_phone', s.phone,
                 'subs', (select count(*) from public.sub_orders x where x.batch_id = b.id), 'closed_at', b.closed_at,
                 'location', (select name from public.locations l where l.id = b.location_id)) order by b.closed_at)
               from public.merchant_batches b join public.stores s on s.id = b.store_id where b.status = 'closed'), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'order_no', o.order_no, 'box_code', o.box_code,
                 'name', o.address_snapshot->>'recipient_name', 'phone', o.address_snapshot->>'phone',
                 'address', concat_ws('، ', o.address_snapshot->>'city', o.address_snapshot->>'district', o.address_snapshot->>'street', o.address_snapshot->>'details'),
                 'cod', case when o.payment_method = 'cod' then o.grand_total else 0 end) order by o.out_for_delivery_at)
               from public.orders o where o.courier_id = v_uid and o.status = 'out_for_delivery'), '[]'::jsonb),
    'subs', coalesce((select jsonb_agg(jsonb_build_object('id', so.id, 'sub_no', so.sub_no, 'status', so.status,
                 'store', st.name, 'store_phone', st.phone,
                 'name', o.address_snapshot->>'recipient_name', 'phone', o.address_snapshot->>'phone',
                 'address', concat_ws('، ', o.address_snapshot->>'city', o.address_snapshot->>'district', o.address_snapshot->>'street', o.address_snapshot->>'details'),
                 'cod', case when o.payment_method = 'cod' then so.total else 0 end) order by so.created_at)
               from public.sub_orders so join public.orders o on o.id = so.order_id join public.stores st on st.id = so.store_id
               where so.courier_id = v_uid and o.fulfillment = 'direct' and so.status in ('ready','handed_over','in_transit','delivery_failed')), '[]'::jsonb),
    'cash', jsonb_build_object(
      'collected', (select coalesce(sum(amount), 0) from public.payments where courier_id = v_uid and method = 'cod' and status = 'collected'),
      'remitted', (select coalesce(sum(amount), 0) from public.courier_remittances where courier_id = v_uid)));
end $$;

create or replace function public.hub_queue()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_hub() then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  return jsonb_build_object(
    'incoming', coalesce((select jsonb_agg(jsonb_build_object('batch_no', b.batch_no, 'status', b.status, 'store', s.name,
                  'subs', (select count(*) from public.sub_orders x where x.batch_id = b.id), 'at', coalesce(b.picked_up_at, b.closed_at)) order by b.closed_at)
                from public.merchant_batches b join public.stores s on s.id = b.store_id where b.status in ('closed','picked_up')), '[]'::jsonb),
    'to_pack', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'order_no', o.order_no, 'fulfillment', o.fulfillment,
                  'total_subs', (select count(*) from public.sub_orders x where x.order_id = o.id and x.status <> 'cancelled'),
                  'at_hub', (select count(*) from public.sub_orders x where x.order_id = o.id and x.status = 'at_hub'),
                  'subs', (select jsonb_agg(jsonb_build_object('sub_no', x.sub_no, 'status', x.status) order by x.sub_no) from public.sub_orders x where x.order_id = o.id and x.status <> 'cancelled'),
                  'created_at', o.created_at) order by o.created_at)
                from public.orders o where o.fulfillment <> 'direct' and o.packed_at is null and o.status in ('confirmed','in_progress')
                  and exists (select 1 from public.sub_orders x where x.order_id = o.id and x.status = 'at_hub')), '[]'::jsonb),
    'to_dispatch', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'order_no', o.order_no, 'box_code', o.box_code,
                  'fulfillment', o.fulfillment, 'city', o.address_snapshot->>'city',
                  'pickup', (select name from public.locations l where l.id = o.pickup_location_id)) order by o.packed_at)
                from public.orders o where o.status = 'packed'), '[]'::jsonb),
    'pickup_ready', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'order_no', o.order_no, 'box_code', o.box_code,
                  'name', o.address_snapshot->>'recipient_name', 'pickup', (select name from public.locations l where l.id = o.pickup_location_id)))
                from public.orders o where o.status = 'out_for_delivery' and o.fulfillment = 'pickup'), '[]'::jsonb),
    'couriers', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'phone', p.phone))
                from public.user_roles ur join public.profiles p on p.id = ur.user_id where ur.role = 'courier' and p.status = 'active'), '[]'::jsonb));
end $$;

-- ---------- المالية: دفتر الأستاذ (قيد مزدوج، إلحاقي فقط) ----------
create table public.ledger_accounts (
  code  text primary key check (code ~ '^[a-z_]{2,40}$'),
  name  text not null,
  type  text not null check (type in ('asset','liability','revenue','expense','equity'))
);
insert into public.ledger_accounts (code, name, type) values
  ('cash', 'النقدية والمحافظ', 'asset'),
  ('courier_cash', 'نقد لدى المندوبين', 'asset'),
  ('customer_deposits', 'مدفوعات العملاء المقدمة', 'liability'),
  ('merchant_payable', 'مستحقات التجار', 'liability'),
  ('merchant_receivable', 'رسوم مستحقة على التجار', 'asset'),
  ('commission_revenue', 'إيراد العمولات', 'revenue'),
  ('shipping_revenue', 'إيراد الشحن', 'revenue'),
  ('fees_revenue', 'إيراد الاشتراكات والإعلانات', 'revenue'),
  ('promo_expense', 'مصروف الكوبونات والنقاط', 'expense'),
  ('refunds_payable', 'مبالغ مستردة للعملاء', 'liability')
on conflict (code) do nothing;

create table public.journal_entries (
  id         bigint generated always as identity primary key,
  ref_type   text not null check (ref_type ~ '^[a-z_]{2,30}$'),
  ref_id     uuid,
  memo       text check (char_length(memo) <= 300),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index journal_entries_ref_uidx on public.journal_entries(ref_type, ref_id) where ref_id is not null;
create index journal_entries_created_by_idx on public.journal_entries(created_by);

create table public.journal_lines (
  id       bigint generated always as identity primary key,
  entry_id bigint not null references public.journal_entries(id) on delete restrict,
  account  text not null references public.ledger_accounts(code) on delete restrict,
  store_id uuid references public.stores(id) on delete restrict,
  debit    numeric(14,2) not null default 0 check (debit >= 0),
  credit   numeric(14,2) not null default 0 check (credit >= 0),
  check (debit = 0 or credit = 0)
);
create index journal_lines_entry_idx on public.journal_lines(entry_id);
create index journal_lines_account_idx on public.journal_lines(account, store_id);
create index journal_lines_store_idx on public.journal_lines(store_id);

create or replace function private.ledger_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'السجلات المحاسبية غير قابلة للتعديل أو الحذف؛ استخدم قيدًا عكسيًا'; end $$;
create trigger trg_journal_entries_ro before update or delete on public.journal_entries for each row execute function private.ledger_immutable();
create trigger trg_journal_lines_ro before update or delete on public.journal_lines for each row execute function private.ledger_immutable();

create or replace function private.ledger_balanced() returns trigger
language plpgsql set search_path = '' as $$
declare v numeric;
begin
  select coalesce(sum(debit) - sum(credit), 0) into v from public.journal_lines where entry_id = new.entry_id;
  if v <> 0 then raise exception 'قيد غير متوازن (الفرق %)', v; end if;
  return null;
end $$;
create constraint trigger trg_journal_balanced after insert on public.journal_lines
  deferrable initially deferred for each row execute function private.ledger_balanced();

-- p_lines: [{"account":"cash","debit":100,"store_id":null}, {"account":"merchant_payable","credit":100,"store_id":"..."}]
create or replace function private.post_entry(p_ref_type text, p_ref uuid, p_memo text, p_lines jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_id bigint; l jsonb;
begin
  if p_ref is not null and exists (select 1 from public.journal_entries where ref_type = p_ref_type and ref_id = p_ref) then return null; end if;
  insert into public.journal_entries (ref_type, ref_id, memo, created_by) values (p_ref_type, p_ref, left(p_memo, 300), auth.uid())
  returning id into v_id;
  for l in select * from jsonb_array_elements(p_lines) loop
    if coalesce((l->>'debit')::numeric, 0) = 0 and coalesce((l->>'credit')::numeric, 0) = 0 then continue; end if;
    insert into public.journal_lines (entry_id, account, store_id, debit, credit)
    values (v_id, l->>'account', nullif(l->>'store_id', '')::uuid,
            greatest(coalesce((l->>'debit')::numeric, 0), 0), greatest(coalesce((l->>'credit')::numeric, 0), 0));
  end loop;
  return v_id;
end $$;

-- القيود التلقائية
create or replace function private.ledger_on_sub() returns trigger
language plpgsql security definer set search_path = '' as $$
declare o public.orders; v_promo numeric; v_src text;
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    select * into o from public.orders where id = new.order_id;
    v_src := case when o.payment_method = 'cod' then 'courier_cash' else 'customer_deposits' end;
    v_promo := new.platform_coupon_discount + new.points_discount;
    perform private.post_entry('sub_delivered', new.id, 'تسليم ' || new.sub_no, jsonb_build_array(
      jsonb_build_object('account', v_src, 'debit', new.total),
      jsonb_build_object('account', 'promo_expense', 'debit', v_promo),
      jsonb_build_object('account', 'merchant_payable', 'credit', new.merchant_net, 'store_id', new.store_id),
      jsonb_build_object('account', 'commission_revenue', 'credit', new.commission_amount, 'store_id', new.store_id),
      jsonb_build_object('account', 'shipping_revenue', 'credit', new.shipping_fee)));
  end if;
  return null;
end $$;
create trigger trg_ledger_sub after update of status on public.sub_orders for each row execute function private.ledger_on_sub();

create or replace function private.ledger_on_order_payment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'confirmed' then
    perform private.post_entry('order_payment', new.id, 'دفعة عميل ' || new.channel, jsonb_build_array(
      jsonb_build_object('account', 'cash', 'debit', new.amount),
      jsonb_build_object('account', 'customer_deposits', 'credit', new.amount)));
  else
    perform private.post_entry('order_refund', new.id, 'استرداد للعميل', jsonb_build_array(
      jsonb_build_object('account', 'customer_deposits', 'debit', new.amount),
      jsonb_build_object('account', 'cash', 'credit', new.amount)));
  end if;
  return null;
end $$;
create trigger trg_ledger_order_payment after insert on public.order_payments for each row execute function private.ledger_on_order_payment();

create or replace function private.ledger_on_remittance() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.post_entry('remittance', new.id, 'توريد نقدي من مندوب', jsonb_build_array(
    jsonb_build_object('account', 'cash', 'debit', new.amount),
    jsonb_build_object('account', 'courier_cash', 'credit', new.amount)));
  return null;
end $$;
create trigger trg_ledger_remittance after insert on public.courier_remittances for each row execute function private.ledger_on_remittance();

-- ---------- رسوم التجار والاشتراكات ----------
create table public.subscription_plans (
  id            int generated always as identity primary key,
  name          text not null check (char_length(name) between 2 and 60),
  price         numeric(14,2) not null check (price >= 0),
  period_days   smallint not null check (period_days between 1 and 366),
  commission_rate numeric(5,2) check (commission_rate between 0 and 50),
  max_products  int check (max_products > 0),
  story_included boolean not null default false,
  features      jsonb not null default '[]'::jsonb,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table public.store_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores(id) on delete restrict,
  plan_id    int not null references public.subscription_plans(id) on delete restrict,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  charge_id  uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index store_subscriptions_store_idx on public.store_subscriptions(store_id, ends_at desc);
create index store_subscriptions_plan_idx on public.store_subscriptions(plan_id);

create table public.store_charges (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores(id) on delete restrict,
  kind          text not null check (kind in ('subscription','story','ad','adjustment','return_fee','penalty')),
  amount        numeric(14,2) not null check (amount > 0),
  prepaid       boolean not null default false,   -- مدفوع مسبقًا = لا يُخصم من التسوية
  status        text not null default 'pending' check (status in ('pending','settled','paid','void')),
  ref_id        uuid,
  note          text check (char_length(note) <= 200),
  settlement_id uuid references public.settlements(id) on delete restrict,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index store_charges_store_idx on public.store_charges(store_id, status);
create index store_charges_settlement_idx on public.store_charges(settlement_id);

alter table public.settlements add column if not exists charges numeric(14,2) not null default 0;
alter table public.settlements add column if not exists refunds numeric(14,2) not null default 0;

create or replace function private.add_store_charge(p_store uuid, p_kind text, p_amount numeric, p_prepaid boolean,
                                                    p_ref uuid, p_note text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if coalesce(p_amount, 0) <= 0 then return null; end if;
  insert into public.store_charges (store_id, kind, amount, prepaid, status, ref_id, note, created_by)
  values (p_store, p_kind, p_amount, p_prepaid, case when p_prepaid then 'paid' else 'pending' end, p_ref, left(p_note, 200), auth.uid())
  returning id into v_id;
  perform private.post_entry('store_charge', v_id, 'رسوم ' || p_kind, jsonb_build_array(
    jsonb_build_object('account', case when p_prepaid then 'cash' else 'merchant_receivable' end, 'debit', p_amount, 'store_id', p_store),
    jsonb_build_object('account', 'fees_revenue', 'credit', p_amount, 'store_id', p_store)));
  perform private.notify_store(p_store, 'رسوم جديدة على متجرك', p_amount || ' — ' || coalesce(p_note, p_kind)
    || case when p_prepaid then ' (مدفوعة)' else ' (تُخصم من التسوية)' end, '/merchant/finance');
  return v_id;
end $$;

create or replace function public.admin_add_charge(p_store uuid, p_kind text, p_amount numeric, p_prepaid boolean, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_finance() then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  if p_kind not in ('subscription','story','ad','adjustment','return_fee','penalty') then raise exception 'نوع غير صالح'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'المبلغ غير صالح'; end if;
  return private.add_store_charge(p_store, p_kind, p_amount, coalesce(p_prepaid, false), null, coalesce(nullif(trim(p_note), ''), p_kind));
end $$;

create or replace function public.admin_void_charge(p_charge uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.store_charges;
begin
  if not private.is_finance() then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  select * into c from public.store_charges where id = p_charge for update;
  if not found or c.status not in ('pending','paid') or c.settlement_id is not null then raise exception 'لا يمكن إلغاء هذه الرسوم'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'اذكر السبب'; end if;
  update public.store_charges set status = 'void', note = left(coalesce(note, '') || ' | ملغاة: ' || p_reason, 200) where id = p_charge;
  perform private.post_entry('charge_void', c.id, 'إلغاء رسوم: ' || p_reason, jsonb_build_array(
    jsonb_build_object('account', 'fees_revenue', 'debit', c.amount, 'store_id', c.store_id),
    jsonb_build_object('account', case when c.prepaid then 'cash' else 'merchant_receivable' end, 'credit', c.amount, 'store_id', c.store_id)));
end $$;

create or replace function public.admin_save_plan(p_id int, p_name text, p_price numeric, p_days int, p_commission numeric,
                                                  p_max_products int, p_story boolean, p_features jsonb, p_active boolean)
returns int language plpgsql security definer set search_path = '' as $$
declare v_id int;
begin
  perform private.require_admin();
  if jsonb_typeof(coalesce(p_features, '[]'::jsonb)) <> 'array' then raise exception 'المزايا يجب أن تكون قائمة'; end if;
  if p_id is null then
    insert into public.subscription_plans (name, price, period_days, commission_rate, max_products, story_included, features, is_active)
    values (p_name, p_price, p_days, p_commission, p_max_products, coalesce(p_story, false), coalesce(p_features, '[]'::jsonb), coalesce(p_active, true))
    returning id into v_id;
  else
    update public.subscription_plans set name = p_name, price = p_price, period_days = p_days, commission_rate = p_commission,
      max_products = p_max_products, story_included = coalesce(p_story, false), features = coalesce(p_features, '[]'::jsonb),
      is_active = coalesce(p_active, true) where id = p_id returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.admin_subscribe_store(p_store uuid, p_plan int, p_prepaid boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare pl public.subscription_plans; v_start timestamptz; v_end timestamptz; v_sub uuid; v_charge uuid;
begin
  if not private.is_finance() then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  select * into pl from public.subscription_plans where id = p_plan and is_active;
  if not found then raise exception 'الباقة غير متاحة'; end if;
  select greatest(now(), coalesce(max(ends_at), now())) into v_start from public.store_subscriptions where store_id = p_store;
  v_end := v_start + make_interval(days => pl.period_days);
  insert into public.store_subscriptions (store_id, plan_id, starts_at, ends_at, created_by)
  values (p_store, p_plan, v_start, v_end, auth.uid()) returning id into v_sub;
  v_charge := private.add_store_charge(p_store, 'subscription', pl.price, coalesce(p_prepaid, false), v_sub, 'اشتراك ' || pl.name);
  update public.store_subscriptions set charge_id = v_charge where id = v_sub;
  if pl.commission_rate is not null then update public.stores set commission_rate = pl.commission_rate where id = p_store; end if;
  if pl.story_included then
    insert into public.store_story_plans (store_id, starts_at, ends_at, days, note, granted_by)
    values (p_store, v_start, v_end, least(pl.period_days, 366), 'ضمن باقة ' || pl.name, auth.uid());
  end if;
  return jsonb_build_object('starts_at', v_start, 'ends_at', v_end);
end $$;

-- تفعيل الاستوري مع رسوم اختيارية
drop function if exists public.admin_grant_story(uuid, int, text);
create or replace function public.admin_grant_story(p_store uuid, p_days int default 30, p_note text default null,
                                                    p_fee numeric default 0, p_prepaid boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_store public.stores; v_start timestamptz; v_end timestamptz; v_id bigint;
begin
  perform private.require_admin();
  select * into v_store from public.stores where id = p_store;
  if not found then raise exception 'المتجر غير موجود'; end if;
  if v_store.status <> 'active' then raise exception 'لا يمكن تفعيل الاستوري لمتجر غير نشط'; end if;
  if p_days is null or p_days not between 1 and 366 then raise exception 'مدة غير صالحة'; end if;
  if coalesce(p_fee, 0) < 0 then raise exception 'رسوم غير صالحة'; end if;
  v_start := greatest(now(), coalesce(private.story_plan_end(p_store), now()));
  v_end := v_start + make_interval(days => p_days);
  insert into public.store_story_plans (store_id, starts_at, ends_at, days, note, granted_by)
  values (p_store, v_start, v_end, p_days, nullif(left(trim(p_note), 200), ''), auth.uid()) returning id into v_id;
  if coalesce(p_fee, 0) > 0 then
    perform private.add_store_charge(p_store, 'story', p_fee, coalesce(p_prepaid, false), null, 'اشتراك الاستوري ' || p_days || ' يوم');
  end if;
  perform private.notify(v_store.owner_id, 'تم تفعيل الاستوري لمتجرك',
    'يمكنك نشر الحالات والعروض حتى ' || to_char(v_end at time zone 'Asia/Aden', 'YYYY-MM-DD'), '/merchant/stories', 'store');
  return jsonb_build_object('starts_at', v_start, 'ends_at', v_end);
end $$;

-- ---------- التسويات: الصافي = المستحق − المرتجعات − الرسوم غير المدفوعة، بعد فترة الحجز ----------
create or replace function public.admin_generate_settlement(p_store uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_days int := greatest((private.setting('public_return_days', '7'::jsonb))::text::int,
                                          (private.setting('settlement_hold_days', '7'::jsonb))::text::int);
        v_net numeric; v_charges numeric; v_refunds numeric;
begin
  if not private.is_finance() then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  insert into public.settlements (store_id, created_by) values (p_store, auth.uid()) returning id into v_id;
  update public.sub_orders so set settlement_id = v_id
  where so.store_id = p_store and so.status = 'delivered' and so.settlement_id is null
    and so.delivered_at < now() - make_interval(days => v_days)
    and not exists (select 1 from public.returns r where r.sub_order_id = so.id and r.status in ('requested','approved','received'));
  update public.store_charges set settlement_id = v_id, status = 'settled'
  where store_id = p_store and status = 'pending' and not prepaid;
  if not exists (select 1 from public.sub_orders where settlement_id = v_id)
     and not exists (select 1 from public.store_charges where settlement_id = v_id) then
    raise exception 'لا توجد طلبات أو رسوم مؤهلة للتسوية';
  end if;
  select coalesce(sum(i.line_total / i.qty * r.qty * (1 - so.commission_rate / 100)), 0) into v_refunds
  from public.returns r join public.sub_orders so on so.id = r.sub_order_id join public.order_items i on i.id = r.order_item_id
  where so.settlement_id = v_id and r.status = 'refunded';
  select coalesce(sum(amount), 0) into v_charges from public.store_charges where settlement_id = v_id;
  select coalesce(sum(merchant_net), 0) into v_net from public.sub_orders where settlement_id = v_id;
  update public.settlements st set
    gross = (select coalesce(sum(subtotal - store_coupon_discount), 0) from public.sub_orders where settlement_id = v_id),
    commission = (select coalesce(sum(commission_amount), 0) from public.sub_orders where settlement_id = v_id),
    refunds = round(v_refunds, 2), charges = v_charges,
    net = round(v_net - v_refunds - v_charges, 2)
  where st.id = v_id;
  return v_id;
end $$;

create or replace function public.admin_set_settlement_status(p_id uuid, p_status public.settlement_status, p_ref text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.settlements;
begin
  if not private.is_finance() then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  select * into v from public.settlements where id = p_id for update;
  if not found or not ((v.status, p_status) in (('draft','approved'), ('approved','paid'), ('draft','cancelled'), ('approved','cancelled'))) then
    raise exception 'انتقال غير مسموح';
  end if;
  if p_status = 'paid' and coalesce(trim(p_ref), '') = '' then raise exception 'أدخل مرجع التحويل'; end if;
  if p_status = 'paid' and v.net < 0 then raise exception 'صافي التسوية سالب؛ يلزم تحصيل الرسوم من التاجر بدل التحويل'; end if;
  update public.settlements set status = p_status,
    approved_by = case when p_status = 'approved' then auth.uid() else approved_by end,
    paid_at = case when p_status = 'paid' then now() else paid_at end,
    bank_ref = coalesce(left(p_ref, 120), bank_ref)
  where id = p_id;
  if p_status = 'cancelled' then
    update public.sub_orders set settlement_id = null where settlement_id = p_id;
    update public.store_charges set settlement_id = null, status = 'pending' where settlement_id = p_id;
  end if;
  if p_status = 'paid' then
    perform private.post_entry('settlement_paid', p_id, 'تسوية تاجر ' || coalesce(p_ref, ''), jsonb_build_array(
      jsonb_build_object('account', 'merchant_payable', 'debit', v.net + v.charges + v.refunds, 'store_id', v.store_id),
      jsonb_build_object('account', 'merchant_receivable', 'credit', v.charges, 'store_id', v.store_id),
      jsonb_build_object('account', 'refunds_payable', 'credit', v.refunds, 'store_id', v.store_id),
      jsonb_build_object('account', 'cash', 'credit', v.net)));
    perform private.notify_store(v.store_id, 'تم تحويل مستحقاتك', 'المبلغ: ' || v.net || ' — المرجع: ' || p_ref, '/merchant/finance');
  end if;
end $$;

-- كشف حساب التاجر
create or replace function public.merchant_statement(p_store uuid, p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_from timestamptz := coalesce(p_from, (now() - interval '90 days')::date); v_to timestamptz := coalesce(p_to, now()::date) + 1;
begin
  if not (private.store_perm(p_store, 'finance') or private.is_finance()) then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  return jsonb_build_object(
    'rows', coalesce((select jsonb_agg(x order by x->>'at') from (
       select jsonb_build_object('at', so.delivered_at, 'type', 'sale', 'ref', so.sub_no, 'gross', so.subtotal - so.store_coupon_discount,
                                 'commission', so.commission_amount, 'amount', so.merchant_net, 'settled', so.settlement_id is not null) x
       from public.sub_orders so where so.store_id = p_store and so.delivered_at >= v_from and so.delivered_at < v_to
       union all
       select jsonb_build_object('at', c.created_at, 'type', 'charge_' || c.kind, 'ref', coalesce(c.note, c.kind), 'gross', 0,
                                 'commission', 0, 'amount', -c.amount, 'settled', c.status in ('settled','paid'), 'prepaid', c.prepaid, 'status', c.status)
       from public.store_charges c where c.store_id = p_store and c.created_at >= v_from and c.created_at < v_to and c.status <> 'void'
       union all
       select jsonb_build_object('at', s.paid_at, 'type', 'payout', 'ref', s.bank_ref, 'gross', 0, 'commission', 0, 'amount', s.net, 'settled', true)
       from public.settlements s where s.store_id = p_store and s.status = 'paid' and s.paid_at >= v_from and s.paid_at < v_to) t), '[]'::jsonb),
    'summary', jsonb_build_object(
       'pending_net', (select coalesce(sum(merchant_net), 0) from public.sub_orders where store_id = p_store and status = 'delivered' and settlement_id is null),
       'pending_charges', (select coalesce(sum(amount), 0) from public.store_charges where store_id = p_store and status = 'pending' and not prepaid),
       'paid_total', (select coalesce(sum(net), 0) from public.settlements where store_id = p_store and status = 'paid'),
       'subscription', (select jsonb_build_object('plan', p.name, 'ends_at', ss.ends_at) from public.store_subscriptions ss
                        join public.subscription_plans p on p.id = ss.plan_id where ss.store_id = p_store and ss.ends_at > now()
                        order by ss.ends_at desc limit 1)));
end $$;

-- توريد نقد المندوب
create or replace function public.admin_record_remittance(p_courier uuid, p_amount numeric, p_ref text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_due numeric;
begin
  if not private.is_finance() then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'المبلغ غير صالح'; end if;
  select (select coalesce(sum(amount), 0) from public.payments where courier_id = p_courier and method = 'cod' and status = 'collected')
       - (select coalesce(sum(amount), 0) from public.courier_remittances where courier_id = p_courier) into v_due;
  if p_amount > v_due then raise exception 'المبلغ أكبر من النقد المستحق على المندوب (%)', v_due; end if;
  insert into public.courier_remittances (courier_id, amount, ref, received_by) values (p_courier, p_amount, left(p_ref, 120), auth.uid());
end $$;

create or replace function public.admin_finance_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_finance() then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  return jsonb_build_object(
    'balances', coalesce((select jsonb_agg(jsonb_build_object('code', a.code, 'name', a.name, 'type', a.type,
        'balance', (select coalesce(sum(l.debit - l.credit), 0) from public.journal_lines l where l.account = a.code)) order by a.code)
      from public.ledger_accounts a), '[]'::jsonb),
    'pending_payments', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'order_no', o.order_no, 'channel', o.payment_channel,
        'total', o.grand_total, 'currency', o.currency, 'fx_rate', o.fx_rate, 'due_at', o.payment_due_at, 'created_at', o.created_at,
        'customer', o.address_snapshot->>'recipient_name', 'phone', o.address_snapshot->>'phone') order by o.created_at)
      from public.orders o where o.status = 'pending_payment' and o.payment_status = 'unpaid'), '[]'::jsonb),
    'refunds_due', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'order_no', o.order_no, 'total', o.grand_total,
        'channel', o.payment_channel, 'phone', o.address_snapshot->>'phone'))
      from public.orders o where o.payment_status = 'paid' and o.status in ('cancelled','expired')), '[]'::jsonb),
    'couriers', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name,
        'collected', (select coalesce(sum(amount), 0) from public.payments x where x.courier_id = p.id and x.method = 'cod' and x.status = 'collected'),
        'remitted', (select coalesce(sum(amount), 0) from public.courier_remittances r where r.courier_id = p.id)))
      from public.user_roles ur join public.profiles p on p.id = ur.user_id where ur.role = 'courier'), '[]'::jsonb),
    'charges', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'store', s.name, 'kind', c.kind, 'amount', c.amount,
        'prepaid', c.prepaid, 'status', c.status, 'note', c.note, 'created_at', c.created_at) order by c.created_at desc)
      from (select * from public.store_charges order by created_at desc limit 100) c join public.stores s on s.id = c.store_id), '[]'::jsonb),
    'plans', coalesce((select jsonb_agg(to_jsonb(p) order by p.price) from public.subscription_plans p), '[]'::jsonb),
    'journal', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'ref_type', e.ref_type, 'memo', e.memo, 'at', e.created_at,
        'lines', (select jsonb_agg(jsonb_build_object('account', l.account, 'debit', l.debit, 'credit', l.credit)) from public.journal_lines l where l.entry_id = e.id))
        order by e.id desc) from (select * from public.journal_entries order by id desc limit 50) e), '[]'::jsonb));
end $$;

-- تذكير التجار المتأخرين (SLA)
create or replace function private.sla_reminders() returns int
language plpgsql security definer set search_path = '' as $$
declare v_h int := (private.setting('merchant_sla_hours', '4'::jsonb))::text::int; r record; v_n int := 0;
begin
  if v_h <= 0 then return 0; end if;
  for r in select so.id, so.store_id, so.sub_no from public.sub_orders so
           where so.status = 'pending_merchant' and so.updated_at < now() - make_interval(hours => v_h)
             and not exists (select 1 from public.notifications n where n.dedupe_key = 'sla:' || so.id::text) limit 200 loop
    perform private.notify((select owner_id from public.stores where id = r.store_id), 'طلب متأخر ' || r.sub_no,
      'لم يتم قبول الطلب خلال ' || v_h || ' ساعات', '/merchant/orders/' || r.id, 'order', 'sla:' || r.id::text);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ---------- RLS ----------
alter table public.courier_remittances enable row level security; alter table public.courier_remittances force row level security;
alter table public.ledger_accounts enable row level security;     alter table public.ledger_accounts force row level security;
alter table public.journal_entries enable row level security;     alter table public.journal_entries force row level security;
alter table public.journal_lines enable row level security;       alter table public.journal_lines force row level security;
alter table public.subscription_plans enable row level security;  alter table public.subscription_plans force row level security;
alter table public.store_subscriptions enable row level security; alter table public.store_subscriptions force row level security;
alter table public.store_charges enable row level security;       alter table public.store_charges force row level security;
revoke all on public.courier_remittances, public.ledger_accounts, public.journal_entries, public.journal_lines,
              public.subscription_plans, public.store_subscriptions, public.store_charges from anon, authenticated;

grant select on public.courier_remittances, public.ledger_accounts, public.journal_entries, public.journal_lines to authenticated;
create policy finance_or_self on public.courier_remittances for select to authenticated using (courier_id = (select auth.uid()) or (select private.is_finance()));
create policy finance on public.ledger_accounts for select to authenticated using ((select private.is_finance()));
create policy finance on public.journal_entries for select to authenticated using ((select private.is_finance()));
create policy finance on public.journal_lines for select to authenticated using ((select private.is_finance()));

grant select on public.subscription_plans to anon, authenticated;
create policy read_active on public.subscription_plans for select using (is_active or (select private.is_finance()));
grant select on public.store_subscriptions, public.store_charges to authenticated;
create policy scoped on public.store_subscriptions for select to authenticated using ((select private.store_perm(store_id, 'finance')) or (select private.is_finance()));
create policy scoped on public.store_charges for select to authenticated using ((select private.store_perm(store_id, 'finance')) or (select private.is_finance()));

create trigger trg_store_charges_audit after insert or update on public.store_charges for each row execute function private.audit_row();
create trigger trg_plans_audit after insert or update or delete on public.subscription_plans for each row execute function private.audit_row();

-- ---------- الصلاحيات ----------
revoke execute on function private.enqueue_event(text, uuid, uuid, jsonb), private.post_entry(text, uuid, text, jsonb),
  private.add_store_charge(uuid, text, numeric, boolean, uuid, text), private.close_due_batches(), private.sla_reminders(),
  private.add_to_batch(public.sub_orders), private.apply_points(jsonb, uuid, int), private.compute_cart(uuid, text, smallint, text),
  private.expire_unpaid_orders()
  from public, anon, authenticated;

do $$ declare f text; begin
  foreach f in array array[
    'public.merchant_close_batch(uuid)', 'public.merchant_batches_list(uuid)', 'public.courier_pickup_batch(text, text)',
    'public.hub_receive_batch(text)', 'public.hub_pack_order(uuid)', 'public.hub_dispatch_order(uuid, uuid)',
    'public.confirm_order_delivery(uuid, text, numeric)', 'public.ops_assign_courier(uuid, uuid)',
    'public.courier_update_sub(uuid, public.sub_order_status, text)', 'public.confirm_delivery(uuid, text)',
    'public.courier_tasks()', 'public.hub_queue()', 'public.admin_add_charge(uuid, text, numeric, boolean, text)',
    'public.admin_void_charge(uuid, text)', 'public.admin_save_plan(int, text, numeric, int, numeric, int, boolean, jsonb, boolean)',
    'public.admin_subscribe_store(uuid, int, boolean)', 'public.admin_grant_story(uuid, int, text, numeric, boolean)',
    'public.admin_generate_settlement(uuid)', 'public.admin_set_settlement_status(uuid, public.settlement_status, text)',
    'public.merchant_statement(uuid, date, date)', 'public.admin_record_remittance(uuid, numeric, text)', 'public.admin_finance_overview()']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
