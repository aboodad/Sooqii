-- =====================================================================
-- 0002 — المخطط الأساسي لمنصة سوقي (MVP)
-- مبادئ: لا حذف فعلي للسجلات التاريخية (أرشفة)، قيود CHECK في الخادم،
-- RESTRICT على العلاقات التاريخية، CASCADE فقط للجداول التابعة.
-- =====================================================================

-- ---------- الأنواع ----------
create type public.app_role          as enum ('super_admin','admin','operations','finance','support');
create type public.store_member_role as enum ('owner','manager','staff');
create type public.store_status      as enum ('pending','active','suspended','rejected','closed');
create type public.product_status    as enum ('pending_review','active','out_of_stock','hidden','discontinued','rejected','archived');
create type public.offer_status      as enum ('active','out_of_stock','hidden','discontinued','archived');
create type public.order_status      as enum ('pending_payment','confirmed','in_progress','partially_delivered','delivered','cancelled','expired');
create type public.sub_order_status  as enum ('pending_merchant','accepted','preparing','ready','handed_over','in_transit','delivered','delivery_failed','cancelled','return_in_progress','returned');
create type public.payment_status    as enum ('unpaid','paid','failed','cod_pending','cod_collected','partially_refunded','refunded');
create type public.payment_method    as enum ('cod','card');
create type public.return_status     as enum ('requested','approved','rejected','received','refunded');
create type public.discount_type     as enum ('percent','fixed');
create type public.coupon_issuer     as enum ('store','platform');
create type public.settlement_status as enum ('draft','approved','paid','cancelled');

-- ---------- الهوية والأدوار ----------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text check (char_length(full_name) <= 120),
  phone       text check (phone ~ '^[0-9+ ]{7,20}$'),
  avatar_url  text check (char_length(avatar_url) <= 500),
  status      text not null default 'active' check (status in ('active','suspended')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.user_roles (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        public.app_role not null,
  granted_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (user_id, role)
);

-- ---------- الجغرافيا ----------
create table public.governorates (
  id        smallint generated always as identity primary key,
  name_ar   text not null unique,
  sort      smallint not null default 0,
  is_active boolean not null default true
);
create table public.cities (
  id             int generated always as identity primary key,
  governorate_id smallint not null references public.governorates(id) on delete restrict,
  name_ar        text not null,
  is_active      boolean not null default true,
  unique (governorate_id, name_ar)
);
create table public.addresses (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  label          text not null default 'المنزل' check (char_length(label) between 1 and 40),
  recipient_name text not null check (char_length(recipient_name) between 2 and 120),
  phone          text not null check (phone ~ '^[0-9+ ]{7,20}$'),
  city_id        int  not null references public.cities(id) on delete restrict,
  district       text check (char_length(district) <= 120),
  street         text check (char_length(street) <= 200),
  details        text check (char_length(details) <= 300),
  is_default     boolean not null default false,
  archived_at    timestamptz,
  created_at     timestamptz not null default now()
);

-- ---------- المتاجر والموالت ----------
create table public.stores (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles(id) on delete restrict,
  name             text not null check (char_length(name) between 2 and 80),
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  description      text check (char_length(description) <= 2000),
  logo_url         text check (char_length(logo_url) <= 500),
  cover_url        text check (char_length(cover_url) <= 500),
  phone            text check (phone ~ '^[0-9+ ]{7,20}$'),
  city_id          int references public.cities(id) on delete restrict,
  status           public.store_status not null default 'pending',
  commission_rate  numeric(5,2) not null default 10 check (commission_rate between 0 and 50),
  prep_time_hours  smallint not null default 24 check (prep_time_hours between 1 and 240),
  rating_avg       numeric(3,2) not null default 0,
  rating_count     int not null default 0,
  is_featured      boolean not null default false,
  rejection_reason text,
  approved_by      uuid references public.profiles(id) on delete set null,
  approved_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  archived_at      timestamptz
);

create table public.store_members (
  id          bigint generated always as identity primary key,
  store_id    uuid not null references public.stores(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        public.store_member_role not null default 'staff',
  permissions text[] not null default '{orders,products,inventory}',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (store_id, user_id)
);

create table public.malls (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 80),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text check (char_length(description) <= 2000),
  logo_url    text, cover_url text,
  city_id     int references public.cities(id) on delete restrict,
  address     text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create table public.mall_stores (
  mall_id   uuid not null references public.malls(id) on delete cascade,
  store_id  uuid not null references public.stores(id) on delete cascade,
  status    text not null default 'active' check (status in ('active','left')),
  joined_at timestamptz not null default now(),
  primary key (mall_id, store_id)
);

-- ---------- الكتالوج ----------
create table public.categories (
  id         int generated always as identity primary key,
  parent_id  int references public.categories(id) on delete restrict,
  name_ar    text not null check (char_length(name_ar) between 2 and 60),
  slug       text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  icon       text not null default 'package',
  color      text not null default '#0EA5A8' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort       smallint not null default 0,
  is_active  boolean not null default true
);
create table public.brands (
  id        int generated always as identity primary key,
  name      text not null unique check (char_length(name) between 1 and 80),
  slug      text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  logo_url  text,
  is_active boolean not null default true
);

create table public.products (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null check (char_length(name) between 2 and 200),
  slug                 text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  description          text check (char_length(description) <= 8000),
  category_id          int not null references public.categories(id) on delete restrict,
  brand_id             int references public.brands(id) on delete restrict,
  specs                jsonb not null default '{}'::jsonb check (jsonb_typeof(specs) = 'object'),
  status               public.product_status not null default 'pending_review',
  proposed_by_store_id uuid references public.stores(id) on delete set null,
  rating_avg           numeric(3,2) not null default 0,
  rating_count         int not null default 0,
  search_doc           text not null default '',
  reviewed_by          uuid references public.profiles(id) on delete set null,
  rejection_reason     text,
  created_by           uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  archived_at          timestamptz
);
create table public.product_images (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  url        text not null check (char_length(url) <= 500 and url ~ '^https://'),
  sort       smallint not null default 0
);
create table public.product_variants (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  sku        text not null unique check (char_length(sku) between 2 and 64),
  barcode    text check (char_length(barcode) <= 64),
  name       text not null default 'افتراضي' check (char_length(name) <= 80),
  attributes jsonb not null default '{}'::jsonb,
  is_default boolean not null default true,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.seller_offers (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores(id) on delete restrict,
  variant_id       uuid not null references public.product_variants(id) on delete restrict,
  price            numeric(14,2) not null check (price > 0 and price < 100000000),
  compare_at_price numeric(14,2) check (compare_at_price is null or compare_at_price > 0),
  currency         char(3) not null default 'YER',
  status           public.offer_status not null default 'active',
  prep_time_hours  smallint check (prep_time_hours between 1 and 240),
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (store_id, variant_id)
);
create table public.offer_price_history (
  id         bigint generated always as identity primary key,
  offer_id   uuid not null references public.seller_offers(id) on delete cascade,
  old_price  numeric(14,2), new_price numeric(14,2) not null,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);

-- ---------- المخزون ----------
create table public.inventory_levels (
  offer_id            uuid primary key references public.seller_offers(id) on delete restrict,
  qty_on_hand         int not null default 0 check (qty_on_hand >= 0),
  qty_reserved        int not null default 0 check (qty_reserved >= 0),
  qty_available       int generated always as (qty_on_hand - qty_reserved) stored,
  low_stock_threshold int not null default 3 check (low_stock_threshold >= 0),
  updated_at          timestamptz not null default now(),
  check (qty_reserved <= qty_on_hand)
);
create table public.inventory_movements (
  id             bigint generated always as identity primary key,
  offer_id       uuid not null references public.seller_offers(id) on delete restrict,
  delta_on_hand  int not null default 0,
  delta_reserved int not null default 0,
  reason         text not null check (reason in ('initial','restock','adjustment','order_commit','order_cancel','return_restock','damage')),
  ref_id         uuid,
  actor_id       uuid references public.profiles(id) on delete set null,
  note           text check (char_length(note) <= 300),
  created_at     timestamptz not null default now()
);

-- ---------- التسعير ----------
create table public.merchant_discounts (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores(id) on delete cascade,
  offer_id   uuid references public.seller_offers(id) on delete cascade,  -- NULL = كل منتجات المتجر
  title      text not null default 'خصم' check (char_length(title) <= 80),
  type       public.discount_type not null,
  value      numeric(14,2) not null check (value > 0),
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  check (type <> 'percent' or value <= 90),
  check (ends_at is null or ends_at > starts_at)
);
create table public.coupons (
  id                     uuid primary key default gen_random_uuid(),
  code                   text not null unique check (code ~ '^[A-Z0-9_-]{3,24}$'),
  issuer                 public.coupon_issuer not null,
  store_id               uuid references public.stores(id) on delete cascade,
  type                   public.discount_type not null,
  value                  numeric(14,2) not null check (value > 0),
  max_discount           numeric(14,2) check (max_discount is null or max_discount > 0),
  min_cart_value         numeric(14,2) not null default 0 check (min_cart_value >= 0),
  usage_limit            int check (usage_limit is null or usage_limit > 0),
  per_user_limit         int not null default 1 check (per_user_limit > 0),
  used_count             int not null default 0 check (used_count >= 0),
  starts_at              timestamptz not null default now(),
  ends_at                timestamptz,
  is_active              boolean not null default true,
  created_by             uuid references public.profiles(id) on delete set null,
  created_at             timestamptz not null default now(),
  check ((issuer = 'store') = (store_id is not null)),
  check (type <> 'percent' or value <= 90)
);

-- ---------- السلة ----------
create table public.carts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null unique references public.profiles(id) on delete cascade,
  updated_at timestamptz not null default now()
);
create table public.cart_items (
  id       uuid primary key default gen_random_uuid(),
  cart_id  uuid not null references public.carts(id) on delete cascade,
  offer_id uuid not null references public.seller_offers(id) on delete cascade,
  qty      int not null check (qty between 1 and 99),
  added_at timestamptz not null default now(),
  unique (cart_id, offer_id)
);

create table public.shipping_rates (
  governorate_id smallint primary key references public.governorates(id) on delete cascade,
  fee            numeric(14,2) not null check (fee >= 0),
  eta_days_min   smallint not null default 1,
  eta_days_max   smallint not null default 3,
  check (eta_days_max >= eta_days_min)
);

-- ---------- الطلبات ----------
create sequence public.order_no_seq start 100001;

create table public.orders (
  id               uuid primary key default gen_random_uuid(),
  order_no         text not null unique default ('SW-' || nextval('public.order_no_seq')),
  user_id          uuid not null references public.profiles(id) on delete restrict,
  address_snapshot jsonb not null,
  governorate_id   smallint references public.governorates(id) on delete restrict,
  status           public.order_status not null default 'pending_payment',
  payment_method   public.payment_method not null default 'cod',
  payment_status   public.payment_status not null default 'unpaid',
  subtotal         numeric(14,2) not null check (subtotal >= 0),
  discount_total   numeric(14,2) not null default 0 check (discount_total >= 0),
  shipping_total   numeric(14,2) not null default 0 check (shipping_total >= 0),
  grand_total      numeric(14,2) not null check (grand_total >= 0),
  currency         char(3) not null default 'YER',
  coupon_id        uuid references public.coupons(id) on delete restrict,
  notes            text check (char_length(notes) <= 500),
  idempotency_key  uuid not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table public.settlements (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete restrict,
  status      public.settlement_status not null default 'draft',
  gross       numeric(14,2) not null default 0,
  commission  numeric(14,2) not null default 0,
  net         numeric(14,2) not null default 0,
  bank_ref    text check (char_length(bank_ref) <= 120),
  created_by  uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  paid_at     timestamptz,
  created_at  timestamptz not null default now()
);

create table public.sub_orders (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders(id) on delete restrict,
  store_id          uuid not null references public.stores(id) on delete restrict,
  sub_no            text not null unique,
  status            public.sub_order_status not null default 'pending_merchant',
  subtotal          numeric(14,2) not null,          -- بعد خصم المتجر
  store_coupon_discount    numeric(14,2) not null default 0,
  platform_coupon_discount numeric(14,2) not null default 0,
  shipping_fee      numeric(14,2) not null default 0,
  total             numeric(14,2) not null,          -- ما يدفعه العميل لهذا الطلب الفرعي
  commission_rate   numeric(5,2) not null,
  commission_amount numeric(14,2) not null,
  merchant_net      numeric(14,2) not null,
  settlement_id     uuid references public.settlements(id) on delete set null,
  cancel_reason     text,
  delivered_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.delivery_codes (
  sub_order_id uuid primary key references public.sub_orders(id) on delete cascade,
  code         text not null check (code ~ '^[0-9]{4}$'),
  attempts     smallint not null default 0
);

create table public.order_items (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete restrict,
  sub_order_id        uuid not null references public.sub_orders(id) on delete restrict,
  offer_id            uuid not null references public.seller_offers(id) on delete restrict,
  product_id          uuid not null references public.products(id) on delete restrict,
  product_name        text not null,
  variant_name        text,
  image_url           text,
  unit_price          numeric(14,2) not null check (unit_price >= 0),
  merchant_discount_unit numeric(14,2) not null default 0 check (merchant_discount_unit >= 0),
  coupon_discount     numeric(14,2) not null default 0 check (coupon_discount >= 0),
  qty                 int not null check (qty > 0),
  qty_cancelled       int not null default 0 check (qty_cancelled >= 0),
  line_total          numeric(14,2) not null check (line_total >= 0),
  check (qty_cancelled <= qty)
);

create table public.order_price_components (
  id            bigint generated always as identity primary key,
  sub_order_id  uuid not null references public.sub_orders(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete cascade,
  type          text not null check (type in ('base','merchant_discount','store_coupon','platform_coupon','shipping','commission')),
  source_id     uuid,
  amount        numeric(14,2) not null,
  borne_by      text not null check (borne_by in ('customer','store','platform')),
  unique nulls not distinct (sub_order_id, order_item_id, type, source_id)
);

create table public.order_status_history (
  id           bigint generated always as identity primary key,
  order_id     uuid not null references public.orders(id) on delete cascade,
  sub_order_id uuid references public.sub_orders(id) on delete cascade,
  from_status  text, to_status text not null,
  actor_id     uuid references public.profiles(id) on delete set null,
  reason       text check (char_length(reason) <= 300),
  created_at   timestamptz not null default now()
);

create table public.coupon_redemptions (
  id         bigint generated always as identity primary key,
  coupon_id  uuid not null references public.coupons(id) on delete restrict,
  order_id   uuid not null references public.orders(id) on delete restrict,
  user_id    uuid not null references public.profiles(id) on delete restrict,
  amount     numeric(14,2) not null,
  reverted   boolean not null default false,
  created_at timestamptz not null default now(),
  unique (coupon_id, order_id)
);

create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete restrict,
  sub_order_id uuid references public.sub_orders(id) on delete restrict,
  method       public.payment_method not null,
  amount       numeric(14,2) not null check (amount >= 0),
  status       text not null check (status in ('collected','refunded','failed')),
  recorded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique nulls not distinct (sub_order_id, status)
);

create table public.returns (
  id            uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  sub_order_id  uuid not null references public.sub_orders(id) on delete restrict,
  user_id       uuid not null references public.profiles(id) on delete restrict,
  qty           int not null check (qty > 0),
  reason        text not null check (char_length(reason) between 3 and 500),
  status        public.return_status not null default 'requested',
  decision_note text check (char_length(decision_note) <= 300),
  decided_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------- التفاعل ----------
create table public.reviews (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete restrict,
  store_id      uuid not null references public.stores(id) on delete restrict,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  order_item_id uuid not null unique references public.order_items(id) on delete restrict,
  rating        smallint not null check (rating between 1 and 5),
  comment       text check (char_length(comment) <= 1000),
  status        text not null default 'published' check (status in ('published','hidden')),
  created_at    timestamptz not null default now()
);
create table public.wishlists (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
create table public.stock_notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  offer_id    uuid not null references public.seller_offers(id) on delete cascade,
  is_active   boolean not null default true,
  sent_count  smallint not null default 0,
  created_at  timestamptz not null default now()
);
create unique index stock_notifications_active_uq on public.stock_notifications(user_id, offer_id) where is_active;

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  title      text not null, body text, link text,
  kind       text not null default 'info',
  dedupe_key text unique,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create table public.activity_events (
  id         bigint generated always as identity primary key,
  user_id    uuid references public.profiles(id) on delete set null,
  event      text not null check (event in ('view','wishlist','cart','purchase')),
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.search_queries (
  id            bigint generated always as identity primary key,
  user_id       uuid references public.profiles(id) on delete set null,
  query         text not null check (char_length(query) <= 120),
  results_count int not null default 0,
  created_at    timestamptz not null default now()
);
create table public.content_blocks (
  id        uuid primary key default gen_random_uuid(),
  kind      text not null check (kind in ('hero','banner','promo')),
  title     text not null check (char_length(title) <= 120),
  subtitle  text check (char_length(subtitle) <= 300),
  image_url text, link text check (link ~ '^/'),
  theme     text not null default 'teal' check (theme in ('teal','orange','ink','violet')),
  sort      smallint not null default 0,
  is_active boolean not null default true,
  starts_at timestamptz, ends_at timestamptz
);

-- ---------- التدقيق والإعدادات ----------
create table public.audit_logs (
  id         bigint generated always as identity primary key,
  actor_id   uuid,
  action     text not null,
  entity     text not null,
  entity_id  text,
  old_data   jsonb, new_data jsonb,
  created_at timestamptz not null default now()
);
create table public.app_settings (
  key        text primary key check (key ~ '^[a-z_]{2,40}$'),
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- الفهارس ----------
create index on public.user_roles(user_id);
create index on public.store_members(user_id) where is_active;
create index on public.addresses(user_id) where archived_at is null;
create index on public.stores(status);
create index on public.cities(governorate_id);
create index on public.categories(parent_id);
create index on public.products(category_id, status);
create index on public.products(brand_id);
create index on public.products(status, created_at desc);
create index on public.products(proposed_by_store_id);
create index products_search_trgm on public.products using gin (search_doc extensions.gin_trgm_ops);
create index on public.product_images(product_id, sort);
create index on public.product_variants(product_id);
create index on public.seller_offers(variant_id) where status = 'active';
create index on public.seller_offers(store_id, status);
create index on public.inventory_movements(offer_id, created_at desc);
create index on public.offer_price_history(offer_id);
create index on public.merchant_discounts(store_id) where is_active;
create index on public.merchant_discounts(offer_id) where is_active;
create index on public.coupons(store_id);
create index on public.cart_items(offer_id);
create index on public.orders(user_id, created_at desc);
create index on public.orders(status, created_at desc);
create index on public.orders(coupon_id);
create index on public.orders(governorate_id);
create index on public.sub_orders(order_id);
create index on public.sub_orders(store_id, status, created_at desc);
create index on public.sub_orders(settlement_id);
create index on public.order_items(sub_order_id);
create index on public.order_items(order_id);
create index on public.order_items(offer_id);
create index on public.order_items(product_id);
create index on public.order_status_history(order_id, created_at);
create index on public.order_status_history(sub_order_id);
create index on public.coupon_redemptions(user_id);
create index on public.payments(order_id);
create index on public.returns(sub_order_id);
create index on public.returns(user_id);
create index on public.returns(order_item_id);
create index on public.reviews(product_id, created_at desc);
create index on public.reviews(store_id);
create index on public.reviews(user_id);
create index on public.wishlists(product_id);
create index on public.stock_notifications(offer_id) where is_active;
create index on public.notifications(user_id, created_at desc);
create index on public.activity_events(product_id, created_at desc);
create index on public.activity_events(user_id);
create index on public.search_queries(created_at desc);
create index on public.search_queries(user_id);
create index on public.audit_logs(entity, entity_id);
create index on public.audit_logs(created_at desc);
create index on public.settlements(store_id);
create index on public.stores(owner_id);
create index on public.stores(city_id);
create index on public.malls(city_id);
create index on public.mall_stores(store_id);
create index on public.addresses(city_id);
create index on public.user_roles(granted_by);
create index on public.stores(approved_by);
create index on public.products(reviewed_by);
create index on public.products(created_by);
create index on public.offer_price_history(changed_by);
create index on public.inventory_movements(actor_id);
create index on public.coupons(created_by);
create index on public.settlements(created_by);
create index on public.settlements(approved_by);
create index on public.order_price_components(order_item_id);
create index on public.order_status_history(actor_id);
create index on public.payments(sub_order_id);
create index on public.payments(recorded_by);
create index on public.returns(decided_by);
create index on public.coupon_redemptions(order_id);
