-- =====================================================================
-- 0011 — الاستوري: حالات وعروض المتاجر بأسلوب إنستغرام
--  • الأدمن يفعّل الخاصية لكل متجر باشتراك (30 يومًا افتراضيًا) من تاريخ البدء
--  • التاجر ينشر صورًا/فيديوهات قصيرة تنتهي تلقائيًا (24 ساعة – 7 أيام)
--  • الجميع يشاهد حالات المتاجر ذات الاشتراك الساري فقط
--  الكتابة تتم عبر دوال محمية فقط؛ لا صلاحيات كتابة مباشرة على الجداول
-- =====================================================================

-- ---------- التحقق من روابط الوسائط ----------
create or replace function private.valid_story_url(u text) returns boolean
language sql immutable set search_path = '' as $$
  select u ~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/stories/[0-9a-f-]{36}/[A-Za-z0-9_.-]{1,80}$'
      or u ~ '^https://images\.unsplash\.com/[A-Za-z0-9/_.?=&%-]+$'
$$;
grant execute on function private.valid_story_url(text) to anon, authenticated;

-- ---------- الجداول ----------
create table public.store_story_plans (
  id           bigint generated always as identity primary key,
  store_id     uuid not null references public.stores(id) on delete cascade,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  days         smallint not null check (days between 1 and 366),
  note         text check (note is null or char_length(note) <= 200),
  granted_by   uuid references public.profiles(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint story_plan_range check (ends_at > starts_at)
);
create index story_plans_store_idx on public.store_story_plans(store_id, ends_at desc);

create table public.stories (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  media_url   text not null,
  media_path  text,
  media_type  text not null check (media_type in ('image','video')),
  caption     text check (caption is null or char_length(caption) <= 200),
  product_id  uuid references public.products(id) on delete set null,
  duration_ms int not null default 5000 check (duration_ms between 2000 and 30000),
  view_count  int not null default 0 check (view_count >= 0),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  constraint stories_expiry check (expires_at > created_at and expires_at <= created_at + interval '7 days 5 minutes'),
  constraint stories_media_trusted check (private.valid_story_url(media_url)),
  constraint stories_path_in_store check (media_path is null or media_path like (store_id::text || '/%'))
);
create index stories_store_idx on public.stories(store_id, created_at desc);
create index stories_expires_idx on public.stories(expires_at);
create index stories_product_idx on public.stories(product_id);
create index stories_created_by_idx on public.stories(created_by);
create index story_plans_granted_by_idx on public.store_story_plans(granted_by);
create index story_plans_cancelled_by_idx on public.store_story_plans(cancelled_by);

create table public.story_views (
  story_id  uuid not null references public.stories(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);
create index story_views_viewer_idx on public.story_views(viewer_id);

-- ---------- الدوال المساعدة ----------
create or replace function private.story_plan_active(p_store uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.store_story_plans p
    where p.store_id = p_store and p.cancelled_at is null and p.starts_at <= now() and p.ends_at > now())
$$;

-- نهاية آخر اشتراك ساري أو مجدول (تُستخدم لتمديد الاشتراك من نهايته)
create or replace function private.story_plan_end(p_store uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select max(p.ends_at) from public.store_story_plans p
  where p.store_id = p_store and p.cancelled_at is null and p.ends_at > now()
$$;
grant execute on function private.story_plan_active(uuid), private.story_plan_end(uuid) to anon, authenticated;

-- ---------- RLS والصلاحيات ----------
alter table public.store_story_plans enable row level security;
alter table public.store_story_plans force row level security;
alter table public.stories enable row level security;
alter table public.stories force row level security;
alter table public.story_views enable row level security;
alter table public.story_views force row level security;

revoke all on public.store_story_plans, public.stories, public.story_views from anon, authenticated;

-- القراءة العامة لأعمدة العرض فقط (عدد المشاهدات ومن أنشأ الحالة يبقيان للتاجر)
grant select (id, store_id, media_url, media_type, caption, product_id, duration_ms, created_at, expires_at)
  on public.stories to anon, authenticated;
create policy read_live on public.stories for select using (
  (expires_at > now()
    and private.story_plan_active(store_id)
    and exists (select 1 from public.stores s where s.id = store_id and s.status = 'active'))
  or store_id in (select private.my_store_ids())
  or (select private.is_admin()));

grant select on public.store_story_plans to authenticated;
create policy read_own on public.store_story_plans for select to authenticated
  using (store_id in (select private.my_store_ids()) or (select private.is_admin()));

grant select on public.story_views to authenticated;
create policy read_own on public.story_views for select to authenticated using (viewer_id = (select auth.uid()));

create trigger trg_store_story_plans_audit after insert or update or delete on public.store_story_plans
  for each row execute function private.audit_row();

-- ---------- التخزين: صور وفيديوهات الحالات ----------
-- المسار: <store_id>/<uuid>.<ext> — الرفع مسموح فقط لمتجر لديه اشتراك ساري وصلاحية الاستوري
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stories', 'stories', true, 20971520, array['image/jpeg','image/png','image/webp','video/mp4','video/webm'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "store uploads stories" on storage.objects for insert to authenticated
  with check (bucket_id = 'stories'
    and (storage.foldername(name))[1] in (select s::text from private.my_store_ids() s)
    and private.store_perm(((storage.foldername(name))[1])::uuid, 'stories')
    and private.story_plan_active(((storage.foldername(name))[1])::uuid));
create policy "store deletes stories" on storage.objects for delete to authenticated
  using (bucket_id = 'stories'
    and (storage.foldername(name))[1] in (select s::text from private.my_store_ids() s)
    and private.store_perm(((storage.foldername(name))[1])::uuid, 'stories'));

-- =====================================================================
-- الدوال العامة
-- =====================================================================

-- شريط الحالات في الرئيسية: كل المتاجر ذات الاشتراك الساري، غير المشاهَدة أولًا
create or replace function public.get_story_feed()
returns jsonb language sql stable security definer set search_path = '' as $$
  with live as (
    select st.id, st.store_id, st.media_url, st.media_type, st.caption, st.duration_ms, st.created_at, st.product_id,
           s.name as store_name, s.slug as store_slug, s.logo_url,
           (auth.uid() is not null and exists (
              select 1 from public.story_views v where v.story_id = st.id and v.viewer_id = auth.uid())) as seen
    from public.stories st
    join public.stores s on s.id = st.store_id
    where st.expires_at > now() and s.status = 'active' and private.story_plan_active(st.store_id)
  ), grouped as (
    select l.store_id, l.store_name, l.store_slug, l.logo_url, max(l.created_at) as latest, bool_and(l.seen) as all_seen,
      jsonb_agg(jsonb_build_object(
        'id', l.id, 'media_url', l.media_url, 'media_type', l.media_type, 'caption', l.caption,
        'duration_ms', l.duration_ms, 'created_at', l.created_at, 'seen', l.seen,
        'product', (select jsonb_build_object('slug', p.slug, 'name', p.name)
                    from public.products p where p.id = l.product_id and p.status = 'active'))
        order by l.created_at) as stories
    from live l
    group by l.store_id, l.store_name, l.store_slug, l.logo_url
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'store', jsonb_build_object('id', g.store_id, 'name', g.store_name, 'slug', g.store_slug, 'logo_url', g.logo_url),
      'latest', g.latest, 'all_seen', g.all_seen, 'stories', g.stories)
    order by g.all_seen, g.latest desc), '[]'::jsonb)
  from (select * from grouped order by all_seen, latest desc limit 60) g
$$;

-- تسجيل مشاهدة: فريدة لكل مستخدم مسجّل، وعدّاد للزوار
create or replace function public.record_story_view(p_story uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_n int;
begin
  if not exists (select 1 from public.stories where id = p_story and expires_at > now()) then return; end if;
  if auth.uid() is not null then
    insert into public.story_views (story_id, viewer_id) values (p_story, auth.uid()) on conflict do nothing;
    get diagnostics v_n = row_count;
    if v_n = 0 then return; end if;
  end if;
  update public.stories set view_count = view_count + 1 where id = p_story;
end $$;

-- ---------- التاجر ----------
create or replace function public.merchant_story_center(p_store uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_plan record;
begin
  perform private.require_user();
  if not private.store_perm(p_store, 'stories') then raise exception 'لا تملك صلاحية إدارة الاستوري' using errcode = '42501'; end if;
  select min(p.starts_at) filter (where p.starts_at <= now() and p.ends_at > now()) as started,
         max(p.ends_at) as ends
    into v_plan
  from public.store_story_plans p
  where p.store_id = p_store and p.cancelled_at is null and p.ends_at > now();
  return jsonb_build_object(
    'active', private.story_plan_active(p_store),
    'starts_at', v_plan.started,
    'ends_at', v_plan.ends,
    'history', coalesce((select jsonb_agg(jsonb_build_object('starts_at', p.starts_at, 'ends_at', p.ends_at, 'days', p.days,
                                  'cancelled_at', p.cancelled_at) order by p.starts_at desc)
                         from (select * from public.store_story_plans where store_id = p_store order by starts_at desc limit 6) p), '[]'::jsonb),
    'stories', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', st.id, 'media_url', st.media_url, 'media_path', st.media_path, 'media_type', st.media_type,
                  'caption', st.caption, 'views', st.view_count, 'created_at', st.created_at, 'expires_at', st.expires_at,
                  'live', st.expires_at > now(),
                  'product', (select jsonb_build_object('slug', pr.slug, 'name', pr.name) from public.products pr where pr.id = st.product_id))
                  order by st.created_at desc)
               from public.stories st
               where st.store_id = p_store and st.expires_at > now() - interval '7 days'), '[]'::jsonb));
end $$;

create or replace function public.merchant_add_story(p_store uuid, p_media_url text, p_media_path text, p_media_type text,
  p_caption text default null, p_product uuid default null, p_hours int default 24, p_duration_ms int default 5000)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_user(); v_id uuid; v_dur int;
begin
  if not private.store_perm(p_store, 'stories') then raise exception 'لا تملك صلاحية إدارة الاستوري' using errcode = '42501'; end if;
  if (select status from public.stores where id = p_store) is distinct from 'active' then raise exception 'المتجر غير نشط'; end if;
  if not private.story_plan_active(p_store) then
    raise exception 'خاصية الاستوري غير مفعّلة لمتجرك. تواصل مع إدارة سوقي لتفعيل الاشتراك' using errcode = '42501';
  end if;
  if p_media_type not in ('image','video') then raise exception 'نوع الوسائط غير مدعوم'; end if;
  if p_hours not in (24, 72, 168) then raise exception 'مدة عرض غير صالحة'; end if;
  -- الملف يجب أن يكون مرفوعًا فعلًا داخل مجلد هذا المتجر، والرابط يشير إليه نفسه
  if p_media_path is null or p_media_path not like (p_store::text || '/%')
     or right(p_media_url, char_length('/stories/' || p_media_path)) <> '/stories/' || p_media_path
     or not exists (select 1 from storage.objects o where o.bucket_id = 'stories' and o.name = p_media_path) then
    raise exception 'ملف الحالة غير صالح';
  end if;
  if p_product is not null and not exists (
      select 1 from public.seller_offers o join public.product_variants v on v.id = o.variant_id
      where o.store_id = p_store and v.product_id = p_product) then
    raise exception 'المنتج المرتبط ليس من منتجات متجرك';
  end if;
  if (select count(*) from public.stories where store_id = p_store and expires_at > now()) >= 15 then
    raise exception 'وصلت للحد الأقصى (15 حالة نشطة). احذف حالة قديمة أولًا';
  end if;
  if (select count(*) from public.stories where store_id = p_store and created_at > now() - interval '24 hours') >= 30 then
    raise exception 'نشرت حالات كثيرة اليوم، حاول لاحقًا';
  end if;
  v_dur := case when p_media_type = 'image' then 5000 else least(30000, greatest(2000, coalesce(p_duration_ms, 15000))) end;
  insert into public.stories (store_id, media_url, media_path, media_type, caption, product_id, duration_ms, created_by, expires_at)
  values (p_store, p_media_url, p_media_path, p_media_type, nullif(left(trim(p_caption), 200), ''), p_product, v_dur, v_uid,
          now() + make_interval(hours => p_hours))
  returning id into v_id;
  return v_id;
end $$;

-- يعيد مسار الملف ليحذفه المتصفح من التخزين (سياسة التخزين تسمح للمتجر بحذف ملفاته فقط)
create or replace function public.merchant_delete_story(p_story uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v public.stories;
begin
  perform private.require_user();
  select * into v from public.stories where id = p_story;
  if not found then raise exception 'الحالة غير موجودة'; end if;
  if not private.store_perm(v.store_id, 'stories') then raise exception 'لا تملك صلاحية إدارة الاستوري' using errcode = '42501'; end if;
  delete from public.stories where id = p_story;
  return v.media_path;
end $$;

-- ---------- الإدارة ----------
create or replace function public.admin_story_stores()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return coalesce((select jsonb_agg(x order by (x->>'active')::boolean desc, x->>'name') from (
    select jsonb_build_object(
      'id', s.id, 'name', s.name, 'slug', s.slug, 'status', s.status, 'logo_url', s.logo_url,
      'active', private.story_plan_active(s.id),
      'ends_at', private.story_plan_end(s.id),
      'last_ends_at', (select max(p.ends_at) from public.store_story_plans p where p.store_id = s.id and p.cancelled_at is null),
      'plans', (select count(*) from public.store_story_plans p where p.store_id = s.id),
      'live_stories', (select count(*) from public.stories st where st.store_id = s.id and st.expires_at > now())) as x
    from public.stores s where s.status in ('active','suspended')) t), '[]'::jsonb);
end $$;

create or replace function public.admin_grant_story(p_store uuid, p_days int default 30, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_store public.stores; v_start timestamptz; v_end timestamptz;
begin
  perform private.require_admin();
  select * into v_store from public.stores where id = p_store;
  if not found then raise exception 'المتجر غير موجود'; end if;
  if v_store.status <> 'active' then raise exception 'لا يمكن تفعيل الاستوري لمتجر غير نشط'; end if;
  if p_days is null or p_days not between 1 and 366 then raise exception 'مدة غير صالحة'; end if;
  -- يبدأ الآن، أو من نهاية الاشتراك الحالي إن كان ساريًا (تمديد)
  v_start := greatest(now(), coalesce(private.story_plan_end(p_store), now()));
  v_end := v_start + make_interval(days => p_days);
  insert into public.store_story_plans (store_id, starts_at, ends_at, days, note, granted_by)
  values (p_store, v_start, v_end, p_days, nullif(left(trim(p_note), 200), ''), auth.uid());
  perform private.notify(v_store.owner_id, 'تم تفعيل الاستوري لمتجرك',
    'يمكنك نشر الحالات والعروض حتى ' || to_char(v_end at time zone 'Asia/Aden', 'YYYY-MM-DD'), '/merchant/stories', 'store');
  return jsonb_build_object('starts_at', v_start, 'ends_at', v_end);
end $$;

create or replace function public.admin_cancel_story(p_store uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_n int;
begin
  perform private.require_admin();
  select owner_id into v_owner from public.stores where id = p_store;
  if not found then raise exception 'المتجر غير موجود'; end if;
  update public.store_story_plans set cancelled_at = now(), cancelled_by = auth.uid()
  where store_id = p_store and cancelled_at is null and ends_at > now();
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'لا يوجد اشتراك ساري لهذا المتجر'; end if;
  perform private.notify(v_owner, 'تم إيقاف الاستوري لمتجرك',
    coalesce('السبب: ' || nullif(left(trim(p_reason), 200), ''), 'تواصل مع إدارة سوقي للتفاصيل'), '/merchant/stories', 'store');
end $$;

-- ---------- صلاحيات التنفيذ ----------
revoke execute on function public.get_story_feed(), public.record_story_view(uuid),
  public.merchant_story_center(uuid), public.merchant_add_story(uuid, text, text, text, text, uuid, int, int),
  public.merchant_delete_story(uuid), public.admin_story_stores(), public.admin_grant_story(uuid, int, text),
  public.admin_cancel_story(uuid, text)
  from public, anon, authenticated;

grant execute on function public.get_story_feed(), public.record_story_view(uuid) to anon, authenticated;
grant execute on function public.merchant_story_center(uuid), public.merchant_add_story(uuid, text, text, text, text, uuid, int, int),
  public.merchant_delete_story(uuid), public.admin_story_stores(), public.admin_grant_story(uuid, int, text),
  public.admin_cancel_story(uuid, text)
  to authenticated;
