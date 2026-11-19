-- =====================================================================
-- 0018 — الولاء (نقاط، تسجيل يومي، إحالات، مكافآت، باقات كوبونات، هدايا، سحوبات، حملات)،
--        الإعلانات الممولة، أسئلة المنتجات، الدعم الفني، التحليلات، لوحة التشغيل،
--        وإشعارات واتساب (أساسي) و SMS (اختياري) عبر صندوق رسائل صادرة
-- =====================================================================

create extension if not exists pg_net with schema extensions;
create sequence if not exists public.ticket_seq start 10001;

-- ---------- الإحالات والتسجيل اليومي ----------
alter table public.profiles add column if not exists referral_code text unique
  default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
alter table public.profiles add column if not exists referred_by uuid references public.profiles(id) on delete set null;
update public.profiles set referral_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) where referral_code is null;
create index if not exists profiles_referred_by_idx on public.profiles(referred_by);

create table public.user_checkins (
  user_id uuid not null references public.profiles(id) on delete restrict,
  day     date not null,
  streak  int not null default 1,
  primary key (user_id, day)
);

create table public.loyalty_campaigns (
  id            int generated always as identity primary key,
  name          text not null check (char_length(name) between 2 and 80),
  multiplier    numeric(4,2) not null default 1 check (multiplier between 1 and 10),
  bonus_points  int not null default 0 check (bonus_points >= 0),
  min_order     numeric(14,2) not null default 0,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  budget_points int check (budget_points > 0),
  used_points   int not null default 0,
  is_active     boolean not null default true,
  check (ends_at > starts_at)
);

create table public.points_rewards (
  id          int generated always as identity primary key,
  title       text not null check (char_length(title) between 2 and 80),
  description text check (char_length(description) <= 300),
  cost        int not null check (cost > 0),
  type        text not null check (type in ('coupon_fixed','coupon_percent')),
  value       numeric(14,2) not null check (value > 0),
  min_cart    numeric(14,2) not null default 0,
  valid_days  smallint not null default 30 check (valid_days between 1 and 365),
  stock       int check (stock >= 0),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create table public.reward_claims (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete restrict,
  reward_id  int not null references public.points_rewards(id) on delete restrict,
  coupon_id  uuid references public.coupons(id) on delete restrict,
  points     int not null,
  created_at timestamptz not null default now()
);
create index reward_claims_user_idx on public.reward_claims(user_id);
create index reward_claims_reward_idx on public.reward_claims(reward_id);
create index reward_claims_coupon_idx on public.reward_claims(coupon_id);

-- باقة كوبونات: قائمة كوبونات تصاعدية تُمنح مرة واحدة للمستخدم
create table public.coupon_packs (
  id          int generated always as identity primary key,
  title       text not null check (char_length(title) between 2 and 80),
  description text check (char_length(description) <= 300),
  coupons     jsonb not null check (jsonb_typeof(coupons) = 'array'),  -- [{"value":50,"min_cart":500}]
  valid_days  smallint not null default 60 check (valid_days between 1 and 365),
  new_users_only boolean not null default false,
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,
  is_active   boolean not null default false,
  created_at  timestamptz not null default now()
);
create table public.coupon_pack_claims (
  pack_id    int not null references public.coupon_packs(id) on delete restrict,
  user_id    uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (pack_id, user_id)
);
create index coupon_pack_claims_user_idx on public.coupon_pack_claims(user_id);

-- حملة هدايا: يختار العميل عددًا محددًا من الخيارات
create table public.gift_campaigns (
  id         int generated always as identity primary key,
  title      text not null check (char_length(title) between 2 and 80),
  description text check (char_length(description) <= 300),
  options    jsonb not null check (jsonb_typeof(options) = 'array'),  -- [{"key":"a","title":"","type":"points|coupon_fixed|coupon_percent","value":100,"min_cart":0}]
  pick_count smallint not null default 3 check (pick_count between 1 and 10),
  min_orders smallint not null default 0,
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz,
  is_active  boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.gift_claims (
  campaign_id int not null references public.gift_campaigns(id) on delete restrict,
  user_id     uuid not null references public.profiles(id) on delete restrict,
  choices     jsonb not null,
  created_at  timestamptz not null default now(),
  primary key (campaign_id, user_id)
);
create index gift_claims_user_idx on public.gift_claims(user_id);

create table public.raffles (
  id            int generated always as identity primary key,
  title         text not null check (char_length(title) between 2 and 80),
  description   text check (char_length(description) <= 500),
  prize         text not null check (char_length(prize) <= 200),
  image_url     text check (image_url ~ '^https://'),
  entry_cost    int not null default 0 check (entry_cost >= 0),
  winners_count smallint not null default 1 check (winners_count between 1 and 100),
  starts_at     timestamptz not null default now(),
  ends_at       timestamptz not null,
  status        text not null default 'open' check (status in ('open','drawn','cancelled')),
  drawn_at      timestamptz,
  created_at    timestamptz not null default now()
);
create table public.raffle_entries (
  raffle_id  int not null references public.raffles(id) on delete restrict,
  user_id    uuid not null references public.profiles(id) on delete restrict,
  is_winner  boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (raffle_id, user_id)
);
create index raffle_entries_user_idx on public.raffle_entries(user_id);

-- ---------- منح النقاط ----------
create or replace function private.award_points(p_user uuid, p_amount int, p_kind text, p_status text, p_ref uuid,
                                                p_note text, p_available_at timestamptz default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_amount is null or p_amount <= 0 or not coalesce((private.loyalty()->>'enabled')::boolean, false) then return; end if;
  if p_ref is not null and exists (select 1 from public.points_transactions where user_id = p_user and kind = p_kind and ref_id = p_ref) then return; end if;
  insert into public.points_transactions (user_id, amount, kind, status, ref_id, note, available_at)
  values (p_user, p_amount, p_kind, p_status, p_ref, left(p_note, 200), p_available_at);
end $$;

create or replace function private.points_on_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.award_points(new.id, (private.loyalty()->>'signup_points')::int, 'signup', 'available', new.id, 'مكافأة التسجيل');
  return null;
end $$;
create trigger trg_points_signup after insert on public.profiles for each row execute function private.points_on_signup();

-- نقاط الشراء: معلّقة حتى انتهاء فترة الإرجاع، مع الحملات الموسمية
create or replace function private.points_on_order() returns trigger
language plpgsql security definer set search_path = '' as $$
declare l jsonb := private.loyalty(); v_base numeric; v_pts int; c public.loyalty_campaigns; v_extra int := 0;
        v_days int := (private.setting('public_return_days', '7'::jsonb))::text::int;
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    v_base := new.grand_total - new.shipping_total;
    v_pts := floor(v_base * coalesce((l->>'purchase_percent')::numeric, 0) / 100 / greatest(coalesce((l->>'point_value')::numeric, 1), 0.01))::int;
    select * into c from public.loyalty_campaigns
     where is_active and now() between starts_at and ends_at and v_base >= min_order
       and (budget_points is null or used_points < budget_points)
     order by multiplier desc, bonus_points desc limit 1 for update;
    if c.id is not null then
      v_extra := floor(v_pts * (c.multiplier - 1))::int + c.bonus_points;
      if c.budget_points is not null then v_extra := least(v_extra, c.budget_points - c.used_points); end if;
      update public.loyalty_campaigns set used_points = used_points + v_extra where id = c.id;
    end if;
    perform private.award_points(new.user_id, v_pts + v_extra, 'purchase', 'pending', new.id,
      'نقاط الطلب ' || new.order_no || case when v_extra > 0 then ' + ' || c.name else '' end, now() + make_interval(days => v_days));
  end if;
  return null;
end $$;
create trigger trg_points_order after update of status on public.orders for each row execute function private.points_on_order();

create or replace function private.points_on_review() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'published' then
    perform private.award_points(new.user_id, (private.loyalty()->>'review_points')::int, 'review', 'available', new.id, 'مكافأة تقييم منتج');
  end if;
  return null;
end $$;
create trigger trg_points_review after insert on public.reviews for each row execute function private.points_on_review();

-- إطلاق النقاط المعلّقة ونقاط المُحيل بعد أول طلب مُسلَّم للمدعو
create or replace function private.release_points() returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  update public.points_transactions t set status = 'available'
  where t.status = 'pending' and t.kind = 'purchase' and t.available_at <= now()
    and exists (select 1 from public.orders o where o.id = t.ref_id and o.status = 'delivered');
  get diagnostics v_n = row_count;
  update public.points_transactions t set status = 'available', available_at = now()
  where t.status = 'pending' and t.kind = 'referral'
    and exists (select 1 from public.orders o where o.user_id = t.ref_id and o.status = 'delivered');
  return v_n;
end $$;

create or replace function public.daily_checkin()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_user(); l jsonb := private.loyalty(); v_today date := (now() at time zone 'Asia/Aden')::date;
        v_prev int; v_streak int; v_pts int; v_bonus int := 0; v_every int;
begin
  if not coalesce((l->>'enabled')::boolean, false) then raise exception 'برنامج النقاط غير مفعّل'; end if;
  if exists (select 1 from public.user_checkins where user_id = v_uid and day = v_today) then
    raise exception 'سجّلت حضورك اليوم، عد غدًا';
  end if;
  select streak into v_prev from public.user_checkins where user_id = v_uid and day = v_today - 1;
  v_streak := coalesce(v_prev, 0) + 1;
  insert into public.user_checkins (user_id, day, streak) values (v_uid, v_today, v_streak);
  v_pts := coalesce((l->>'daily_points')::int, 0);
  v_every := greatest(coalesce((l->>'streak_days')::int, 7), 2);
  if v_streak % v_every = 0 then v_bonus := coalesce((l->>'streak_bonus')::int, 0); end if;
  insert into public.points_transactions (user_id, amount, kind, status, note)
  select v_uid, v_pts, 'daily', 'available', 'تسجيل يومي' where v_pts > 0;
  insert into public.points_transactions (user_id, amount, kind, status, note)
  select v_uid, v_bonus, 'streak', 'available', 'مكافأة ' || v_streak || ' أيام متتالية' where v_bonus > 0;
  return jsonb_build_object('streak', v_streak, 'points', v_pts, 'bonus', v_bonus, 'balance', private.points_balance(v_uid));
end $$;

create or replace function public.apply_referral(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_user(); me public.profiles; v_inviter uuid; l jsonb := private.loyalty();
begin
  select * into me from public.profiles where id = v_uid for update;
  if me.referred_by is not null then raise exception 'تم استخدام كود دعوة مسبقًا'; end if;
  if me.created_at < now() - interval '14 days' then raise exception 'كود الدعوة متاح للحسابات الجديدة فقط'; end if;
  if exists (select 1 from public.orders where user_id = v_uid and status = 'delivered') then raise exception 'كود الدعوة متاح قبل أول طلب فقط'; end if;
  select id into v_inviter from public.profiles where referral_code = upper(trim(p_code)) and status = 'active';
  if v_inviter is null or v_inviter = v_uid then raise exception 'كود الدعوة غير صحيح'; end if;
  update public.profiles set referred_by = v_inviter where id = v_uid;
  perform private.award_points(v_uid, (l->>'referral_invitee')::int, 'referral', 'available', v_inviter, 'مكافأة الانضمام بدعوة');
  perform private.award_points(v_inviter, (l->>'referral_inviter')::int, 'referral', 'pending', v_uid, 'دعوة صديق (تُفعّل بعد أول طلب له)');
  perform private.notify(v_inviter, 'انضم صديقك إلى سوقي', 'ستحصل على نقاط الدعوة بعد استلام أول طلب له', '/account/rewards', 'system');
  return jsonb_build_object('ok', true);
end $$;

-- كوبون شخصي
create or replace function private.personal_coupon(p_user uuid, p_type text, p_value numeric, p_min numeric, p_days int, p_prefix text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.coupons (code, issuer, type, value, max_discount, min_cart_value, usage_limit, per_user_limit, starts_at, ends_at,
                              is_active, assigned_user_id)
  values (p_prefix || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)), 'platform',
          case when p_type like '%percent' then 'percent' else 'fixed' end, p_value, null, coalesce(p_min, 0), 1, 1,
          now(), now() + make_interval(days => p_days), true, p_user)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.redeem_reward(p_reward int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_user(); r public.points_rewards; v_coupon uuid; v_code text;
begin
  select * into r from public.points_rewards where id = p_reward and is_active for update;
  if not found then raise exception 'المكافأة غير متاحة'; end if;
  if r.stock is not null and r.stock <= 0 then raise exception 'نفدت هذه المكافأة'; end if;
  perform 1 from public.profiles where id = v_uid for update;
  if private.points_balance(v_uid) < r.cost then raise exception 'رصيد النقاط غير كافٍ'; end if;
  v_coupon := private.personal_coupon(v_uid, r.type, r.value, r.min_cart, r.valid_days, 'PTS');
  insert into public.points_transactions (user_id, amount, kind, status, ref_id, note)
  values (v_uid, -r.cost, 'redeem_reward', 'available', v_coupon, 'استبدال: ' || r.title);
  insert into public.reward_claims (user_id, reward_id, coupon_id, points) values (v_uid, r.id, v_coupon, r.cost);
  if r.stock is not null then update public.points_rewards set stock = stock - 1 where id = r.id; end if;
  select code into v_code from public.coupons where id = v_coupon;
  return jsonb_build_object('code', v_code, 'balance', private.points_balance(v_uid));
end $$;

create or replace function public.claim_coupon_pack(p_pack int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_user(); p public.coupon_packs; c jsonb; v_codes jsonb := '[]'::jsonb; v_id uuid;
begin
  select * into p from public.coupon_packs where id = p_pack and is_active and starts_at <= now() and (ends_at is null or ends_at > now());
  if not found then raise exception 'الباقة غير متاحة'; end if;
  if p.new_users_only and exists (select 1 from public.orders where user_id = v_uid and status not in ('cancelled','expired')) then
    raise exception 'هذه الباقة للعملاء الجدد فقط';
  end if;
  insert into public.coupon_pack_claims (pack_id, user_id) values (p_pack, v_uid) on conflict do nothing;
  if not found then raise exception 'حصلت على هذه الباقة مسبقًا'; end if;
  for c in select * from jsonb_array_elements(p.coupons) loop
    if coalesce((c->>'value')::numeric, 0) <= 0 then continue; end if;
    v_id := private.personal_coupon(v_uid, coalesce(c->>'type', 'fixed'), (c->>'value')::numeric, (c->>'min_cart')::numeric, p.valid_days, 'PK');
    v_codes := v_codes || jsonb_build_array((select code from public.coupons where id = v_id));
  end loop;
  return jsonb_build_object('codes', v_codes);
end $$;

create or replace function public.claim_gifts(p_campaign int, p_keys text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_user(); g public.gift_campaigns; o jsonb; v_out jsonb := '[]'::jsonb; v_id uuid; v_orders int;
begin
  select * into g from public.gift_campaigns where id = p_campaign and is_active and starts_at <= now() and (ends_at is null or ends_at > now());
  if not found then raise exception 'الحملة غير متاحة'; end if;
  if p_keys is null or cardinality(p_keys) <> g.pick_count or (select count(distinct k) from unnest(p_keys) k) <> g.pick_count then
    raise exception 'اختر % هدايا مختلفة', g.pick_count;
  end if;
  select count(*) into v_orders from public.orders where user_id = v_uid and status = 'delivered';
  if v_orders < g.min_orders then raise exception 'الحملة متاحة بعد % طلبات مكتملة', g.min_orders; end if;
  insert into public.gift_claims (campaign_id, user_id, choices) values (p_campaign, v_uid, to_jsonb(p_keys)) on conflict do nothing;
  if not found then raise exception 'استلمت هدايا هذه الحملة مسبقًا'; end if;
  for o in select e from jsonb_array_elements(g.options) e where e->>'key' = any(p_keys) loop
    if o->>'type' = 'points' then
      perform private.award_points(v_uid, (o->>'value')::int, 'campaign', 'available', null, 'هدية: ' || (o->>'title'));
      v_out := v_out || jsonb_build_array(jsonb_build_object('title', o->>'title', 'points', (o->>'value')::int));
    else
      v_id := private.personal_coupon(v_uid, o->>'type', (o->>'value')::numeric, (o->>'min_cart')::numeric, 30, 'GFT');
      v_out := v_out || jsonb_build_array(jsonb_build_object('title', o->>'title', 'code', (select code from public.coupons where id = v_id)));
    end if;
  end loop;
  if jsonb_array_length(v_out) <> g.pick_count then raise exception 'خيار غير صالح'; end if;
  return jsonb_build_object('gifts', v_out);
end $$;

create or replace function public.enter_raffle(p_raffle int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_user(); r public.raffles;
begin
  select * into r from public.raffles where id = p_raffle;
  if not found or r.status <> 'open' or now() not between r.starts_at and r.ends_at then raise exception 'السحب غير متاح'; end if;
  perform 1 from public.profiles where id = v_uid for update;
  insert into public.raffle_entries (raffle_id, user_id) values (p_raffle, v_uid) on conflict do nothing;
  if not found then raise exception 'أنت مشترك في هذا السحب'; end if;
  if r.entry_cost > 0 then
    if private.points_balance(v_uid) < r.entry_cost then raise exception 'رصيد النقاط غير كافٍ'; end if;
    insert into public.points_transactions (user_id, amount, kind, status, note)
    values (v_uid, -r.entry_cost, 'raffle', 'available', 'الاشتراك في سحب: ' || r.title);
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_draw_raffle(p_raffle int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.raffles; w record; v_out jsonb := '[]'::jsonb;
begin
  perform private.require_admin();
  select * into r from public.raffles where id = p_raffle for update;
  if not found or r.status <> 'open' then raise exception 'السحب غير مفتوح'; end if;
  for w in select e.user_id, p.full_name from public.raffle_entries e join public.profiles p on p.id = e.user_id
           where e.raffle_id = p_raffle and p.status = 'active'
           order by gen_random_uuid() limit r.winners_count loop
    update public.raffle_entries set is_winner = true where raffle_id = p_raffle and user_id = w.user_id;
    perform private.notify(w.user_id, 'مبروك! فزت في السحب', r.title || ' — الجائزة: ' || r.prize, '/account/rewards', 'system');
    v_out := v_out || jsonb_build_array(jsonb_build_object('user_id', w.user_id, 'name', w.full_name));
  end loop;
  update public.raffles set status = 'drawn', drawn_at = now() where id = p_raffle;
  return jsonb_build_object('winners', v_out);
end $$;

create or replace function public.loyalty_center()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.require_user(); v_today date := (now() at time zone 'Asia/Aden')::date;
begin
  return jsonb_build_object(
    'settings', private.loyalty(),
    'balance', private.points_balance(v_uid),
    'pending', (select coalesce(sum(amount), 0) from public.points_transactions where user_id = v_uid and status = 'pending'),
    'history', coalesce((select jsonb_agg(jsonb_build_object('amount', amount, 'kind', kind, 'status', status, 'note', note,
                 'at', created_at, 'available_at', available_at) order by created_at desc)
               from (select * from public.points_transactions where user_id = v_uid order by created_at desc limit 50) t), '[]'::jsonb),
    'checkin', jsonb_build_object('today', exists (select 1 from public.user_checkins where user_id = v_uid and day = v_today),
               'streak', coalesce((select streak from public.user_checkins where user_id = v_uid and day in (v_today, v_today - 1) order by day desc limit 1), 0)),
    'referral', jsonb_build_object('code', (select referral_code from public.profiles where id = v_uid),
               'used', (select referred_by is not null from public.profiles where id = v_uid),
               'invited', (select count(*) from public.profiles where referred_by = v_uid)),
    'rewards', coalesce((select jsonb_agg(to_jsonb(r) - 'created_at' order by r.cost) from public.points_rewards r where r.is_active and (r.stock is null or r.stock > 0)), '[]'::jsonb),
    'packs', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'description', p.description, 'coupons', p.coupons,
               'valid_days', p.valid_days, 'claimed', exists (select 1 from public.coupon_pack_claims c where c.pack_id = p.id and c.user_id = v_uid)))
             from public.coupon_packs p where p.is_active and p.starts_at <= now() and (p.ends_at is null or p.ends_at > now())), '[]'::jsonb),
    'gifts', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'title', g.title, 'description', g.description, 'options', g.options,
               'pick_count', g.pick_count, 'min_orders', g.min_orders, 'ends_at', g.ends_at,
               'claimed', exists (select 1 from public.gift_claims c where c.campaign_id = g.id and c.user_id = v_uid)))
             from public.gift_campaigns g where g.is_active and g.starts_at <= now() and (g.ends_at is null or g.ends_at > now())), '[]'::jsonb),
    'raffles', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title, 'description', r.description, 'prize', r.prize,
               'image_url', r.image_url, 'entry_cost', r.entry_cost, 'ends_at', r.ends_at, 'status', r.status,
               'entered', exists (select 1 from public.raffle_entries e where e.raffle_id = r.id and e.user_id = v_uid),
               'won', exists (select 1 from public.raffle_entries e where e.raffle_id = r.id and e.user_id = v_uid and e.is_winner),
               'entries', (select count(*) from public.raffle_entries e where e.raffle_id = r.id)) order by r.ends_at)
             from public.raffles r where r.status = 'open' or (r.status = 'drawn' and r.drawn_at > now() - interval '14 days')), '[]'::jsonb),
    'coupons', coalesce((select jsonb_agg(jsonb_build_object('code', c.code, 'type', c.type, 'value', c.value, 'min_cart', c.min_cart_value,
               'ends_at', c.ends_at, 'used', c.used_count >= coalesce(c.usage_limit, 1)) order by c.ends_at)
             from public.coupons c where c.assigned_user_id = v_uid and c.is_active and (c.ends_at is null or c.ends_at > now() - interval '7 days')), '[]'::jsonb));
end $$;

-- أدوات الإدارة للولاء (حفظ عام عبر JSON مع تحقق صارم)
create or replace function public.admin_save_loyalty_item(p_kind text, p_id int, p_data jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare v_id int; d jsonb := p_data;
begin
  perform private.require_admin();
  if p_kind = 'reward' then
    if p_id is null then
      insert into public.points_rewards (title, description, cost, type, value, min_cart, valid_days, stock, is_active)
      values (d->>'title', d->>'description', (d->>'cost')::int, d->>'type', (d->>'value')::numeric, coalesce((d->>'min_cart')::numeric, 0),
              coalesce((d->>'valid_days')::int, 30), (d->>'stock')::int, coalesce((d->>'is_active')::boolean, true)) returning id into v_id;
    else
      update public.points_rewards set title = d->>'title', description = d->>'description', cost = (d->>'cost')::int, type = d->>'type',
        value = (d->>'value')::numeric, min_cart = coalesce((d->>'min_cart')::numeric, 0), valid_days = coalesce((d->>'valid_days')::int, 30),
        stock = (d->>'stock')::int, is_active = coalesce((d->>'is_active')::boolean, true) where id = p_id returning id into v_id;
    end if;
  elsif p_kind = 'pack' then
    if jsonb_typeof(d->'coupons') <> 'array' or jsonb_array_length(d->'coupons') > 20 then raise exception 'قائمة كوبونات غير صالحة'; end if;
    if p_id is null then
      insert into public.coupon_packs (title, description, coupons, valid_days, new_users_only, ends_at, is_active)
      values (d->>'title', d->>'description', d->'coupons', coalesce((d->>'valid_days')::int, 60), coalesce((d->>'new_users_only')::boolean, false),
              (d->>'ends_at')::timestamptz, coalesce((d->>'is_active')::boolean, false)) returning id into v_id;
    else
      update public.coupon_packs set title = d->>'title', description = d->>'description', coupons = d->'coupons',
        valid_days = coalesce((d->>'valid_days')::int, 60), new_users_only = coalesce((d->>'new_users_only')::boolean, false),
        ends_at = (d->>'ends_at')::timestamptz, is_active = coalesce((d->>'is_active')::boolean, false) where id = p_id returning id into v_id;
    end if;
  elsif p_kind = 'gift' then
    if jsonb_typeof(d->'options') <> 'array' or jsonb_array_length(d->'options') > 20
       or jsonb_array_length(d->'options') < coalesce((d->>'pick_count')::int, 3) then raise exception 'خيارات غير صالحة'; end if;
    if exists (select 1 from jsonb_array_elements(d->'options') o where o->>'type' not in ('points','coupon_fixed','coupon_percent')
               or coalesce((o->>'value')::numeric, 0) <= 0 or coalesce(o->>'key', '') = '') then raise exception 'خيار غير صالح'; end if;
    if p_id is null then
      insert into public.gift_campaigns (title, description, options, pick_count, min_orders, ends_at, is_active)
      values (d->>'title', d->>'description', d->'options', coalesce((d->>'pick_count')::int, 3), coalesce((d->>'min_orders')::int, 0),
              (d->>'ends_at')::timestamptz, coalesce((d->>'is_active')::boolean, false)) returning id into v_id;
    else
      update public.gift_campaigns set title = d->>'title', description = d->>'description', options = d->'options',
        pick_count = coalesce((d->>'pick_count')::int, 3), min_orders = coalesce((d->>'min_orders')::int, 0),
        ends_at = (d->>'ends_at')::timestamptz, is_active = coalesce((d->>'is_active')::boolean, false) where id = p_id returning id into v_id;
    end if;
  elsif p_kind = 'raffle' then
    if p_id is null then
      insert into public.raffles (title, description, prize, image_url, entry_cost, winners_count, ends_at)
      values (d->>'title', d->>'description', d->>'prize', nullif(d->>'image_url', ''), coalesce((d->>'entry_cost')::int, 0),
              coalesce((d->>'winners_count')::int, 1), (d->>'ends_at')::timestamptz) returning id into v_id;
    else
      update public.raffles set title = d->>'title', description = d->>'description', prize = d->>'prize', image_url = nullif(d->>'image_url', ''),
        entry_cost = coalesce((d->>'entry_cost')::int, 0), winners_count = coalesce((d->>'winners_count')::int, 1),
        ends_at = (d->>'ends_at')::timestamptz, status = case when d->>'status' = 'cancelled' then 'cancelled' else status end
      where id = p_id and status = 'open' returning id into v_id;
    end if;
  elsif p_kind = 'campaign' then
    if p_id is null then
      insert into public.loyalty_campaigns (name, multiplier, bonus_points, min_order, starts_at, ends_at, budget_points, is_active)
      values (d->>'name', coalesce((d->>'multiplier')::numeric, 1), coalesce((d->>'bonus_points')::int, 0), coalesce((d->>'min_order')::numeric, 0),
              (d->>'starts_at')::timestamptz, (d->>'ends_at')::timestamptz, (d->>'budget_points')::int, coalesce((d->>'is_active')::boolean, true)) returning id into v_id;
    else
      update public.loyalty_campaigns set name = d->>'name', multiplier = coalesce((d->>'multiplier')::numeric, 1),
        bonus_points = coalesce((d->>'bonus_points')::int, 0), min_order = coalesce((d->>'min_order')::numeric, 0),
        starts_at = (d->>'starts_at')::timestamptz, ends_at = (d->>'ends_at')::timestamptz, budget_points = (d->>'budget_points')::int,
        is_active = coalesce((d->>'is_active')::boolean, true) where id = p_id returning id into v_id;
    end if;
  else
    raise exception 'نوع غير معروف';
  end if;
  if v_id is null then raise exception 'العنصر غير موجود أو غير قابل للتعديل'; end if;
  return v_id;
end $$;

create or replace function public.admin_adjust_points(p_user uuid, p_amount int, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if coalesce(p_amount, 0) = 0 or coalesce(trim(p_note), '') = '' then raise exception 'أدخل الكمية والسبب'; end if;
  if p_amount < 0 and private.points_balance(p_user) + p_amount < 0 then raise exception 'الرصيد لا يكفي للخصم'; end if;
  insert into public.points_transactions (user_id, amount, kind, status, note) values (p_user, p_amount, 'admin', 'available', left(p_note, 200));
end $$;

create or replace function public.admin_loyalty_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'settings', private.loyalty(),
    'stats', jsonb_build_object(
      'issued', (select coalesce(sum(amount), 0) from public.points_transactions where amount > 0 and status <> 'void'),
      'redeemed', (select coalesce(-sum(amount), 0) from public.points_transactions where amount < 0),
      'pending', (select coalesce(sum(amount), 0) from public.points_transactions where status = 'pending'),
      'checkins_today', (select count(*) from public.user_checkins where day = (now() at time zone 'Asia/Aden')::date)),
    'rewards', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.points_rewards r), '[]'::jsonb),
    'packs', coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object('claims', (select count(*) from public.coupon_pack_claims c where c.pack_id = p.id)) order by p.id) from public.coupon_packs p), '[]'::jsonb),
    'gifts', coalesce((select jsonb_agg(to_jsonb(g) || jsonb_build_object('claims', (select count(*) from public.gift_claims c where c.campaign_id = g.id)) order by g.id) from public.gift_campaigns g), '[]'::jsonb),
    'raffles', coalesce((select jsonb_agg(to_jsonb(r) || jsonb_build_object('entries', (select count(*) from public.raffle_entries e where e.raffle_id = r.id),
                 'winners', (select jsonb_agg(p.full_name) from public.raffle_entries e join public.profiles p on p.id = e.user_id where e.raffle_id = r.id and e.is_winner)) order by r.id desc) from public.raffles r), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(to_jsonb(c) order by c.id desc) from public.loyalty_campaigns c), '[]'::jsonb));
end $$;

-- باقة ترحيب افتراضية: 10 كوبونات تصاعدية مجموعها 1000 ر.ي (غير مفعّلة حتى تقرر الإدارة)
insert into public.coupon_packs (title, description, coupons, valid_days, new_users_only, is_active)
select 'باقة الترحيب', 'عشرة كوبونات تصاعدية بقيمة إجمالية 1000 ر.ي',
  '[{"value":50,"min_cart":1000},{"value":60,"min_cart":1500},{"value":70,"min_cart":2000},{"value":80,"min_cart":2500},
    {"value":90,"min_cart":3000},{"value":100,"min_cart":3500},{"value":110,"min_cart":4000},{"value":120,"min_cart":4500},
    {"value":150,"min_cart":5000},{"value":170,"min_cart":6000}]'::jsonb, 90, true, false
where not exists (select 1 from public.coupon_packs);

