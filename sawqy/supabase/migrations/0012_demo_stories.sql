-- =====================================================================
-- 0012 — بيانات عرض للاستوري (المتاجر التجريبية فقط، المملوكة لحساب المدير العام)
-- اشتراك 30 يومًا لكل متجر تجريبي + حالات بصور المنتجات تنتهي خلال 7 أيام
-- لا يلمس أي متجر حقيقي
-- =====================================================================
with demo as (
  select s.id, s.slug, s.owner_id from public.stores s
  where s.slug in ('tech-plus','dar-alanaqa','perfume-house','yemen-goods','home-corner') and s.status = 'active'
)
insert into public.store_story_plans (store_id, starts_at, ends_at, days, note, granted_by)
select d.id, now(), now() + interval '30 days', 30, 'اشتراك تجريبي', d.owner_id from demo d
where not private.story_plan_active(d.id);

with items(store_slug, product_slug, caption, hours_ago) as (values
  ('tech-plus',     'sony-wh-headphones', 'خصم خاص على سماعات سوني هذا الأسبوع', 2),
  ('tech-plus',     'smart-watch-fit',    'وصلت الساعات الذكية الرياضية', 5),
  ('tech-plus',     'iphone-classic',     'آيفون 128 جيجا متوفر الآن بكمية محدودة', 9),
  ('dar-alanaqa',   'red-running-shoe',   'تشكيلة أحذية الجري الجديدة', 1),
  ('dar-alanaqa',   'leather-handbag',    'حقائب جلد طبيعي بسعر خاص', 6),
  ('perfume-house', 'oud-perfume',        'العود الفاخر، العطر الأكثر طلبًا عندنا', 3),
  ('perfume-house', 'skincare-set',       'مجموعة العناية بالبشرة: هدية مع كل طلب', 8),
  ('yemen-goods',   'sidr-honey',         'عسل سدر دوعني من الموسم الجديد', 1),
  ('yemen-goods',   'yemeni-coffee',      'بن حرازي محمّص هذا الأسبوع', 4),
  ('yemen-goods',   'fruit-box',          'سلة الفواكه الموسمية تصلك اليوم', 7),
  ('home-corner',   'green-sofa',         'كنبة المخمل الخضراء بلون جديد', 2),
  ('home-corner',   'living-decor',       'أفكار لديكور غرفة المعيشة', 10)
)
insert into public.stories (store_id, media_url, media_type, caption, product_id, duration_ms, created_by, created_at, expires_at)
select s.id,
       -- صورة المنتج نفسها مقصوصة عموديًا بمقاس الحالة
       regexp_replace((select i.url from public.product_images i where i.product_id = p.id order by i.sort limit 1),
                      '\?.*$', '') || '?auto=format&fit=crop&w=720&h=1280&q=80',
       'image', it.caption, p.id, 5000, s.owner_id,
       now() - make_interval(hours => it.hours_ago),
       now() - make_interval(hours => it.hours_ago) + interval '7 days'
from items it
join public.stores s on s.slug = it.store_slug
join public.products p on p.slug = it.product_slug
where (select i.url from public.product_images i where i.product_id = p.id order by i.sort limit 1) like 'https://images.unsplash.com/%'
  and not exists (select 1 from public.stories x where x.store_id = s.id and x.product_id = p.id and x.expires_at > now());
