-- =====================================================================
-- 0007 — كتالوج عرض تجريبي (يمكن أرشفته من لوحة الإدارة لاحقًا)
-- المتاجر التجريبية مملوكة لحساب المدير العام حتى تُستبدل بمتاجر حقيقية.
-- =====================================================================
do $$
declare
  v_admin uuid := (select id from auth.users where lower(email) = 'sawqysawqyi@gmail.com');
  v_city int := (select id from public.cities where name_ar = 'السبعين');
  s_tech uuid; s_fash uuid; s_beauty uuid; s_food uuid; s_home uuid;
  r record; v_pid uuid; v_vid uuid; v_oid uuid; v_i int := 0;
  u text := 'https://images.unsplash.com/';
  q text := '?auto=format&fit=crop&w=900&q=80';
begin
  if v_admin is null then raise notice 'super admin not found; demo skipped'; return; end if;

  insert into public.stores (owner_id, name, slug, description, phone, city_id, status, commission_rate, prep_time_hours, rating_avg, rating_count, is_featured, approved_by, approved_at)
  values (v_admin, 'تقنية بلس', 'tech-plus', 'أحدث الجوالات والسماعات والإكسسوارات التقنية بضمان حقيقي.', '777000001', v_city, 'active', 8, 12, 4.8, 214, true, v_admin, now())
  returning id into s_tech;
  insert into public.stores (owner_id, name, slug, description, phone, city_id, status, commission_rate, prep_time_hours, rating_avg, rating_count, is_featured, approved_by, approved_at)
  values (v_admin, 'دار الأناقة', 'dar-alanaqa', 'أزياء رجالية ونسائية وأحذية رياضية بأسعار منافسة.', '777000002', v_city, 'active', 12, 24, 4.6, 133, true, v_admin, now())
  returning id into s_fash;
  insert into public.stores (owner_id, name, slug, description, phone, city_id, status, commission_rate, prep_time_hours, rating_avg, rating_count, is_featured, approved_by, approved_at)
  values (v_admin, 'بيت العطور', 'perfume-house', 'عطور أصلية ومستحضرات عناية بالبشرة وساعات فاخرة.', '777000003', v_city, 'active', 10, 24, 4.9, 98, true, v_admin, now())
  returning id into s_beauty;
  insert into public.stores (owner_id, name, slug, description, phone, city_id, status, commission_rate, prep_time_hours, rating_avg, rating_count, is_featured, approved_by, approved_at)
  values (v_admin, 'خيرات اليمن', 'yemen-goods', 'بن يمني فاخر وعسل سدر دوعني أصلي من المزارع مباشرة.', '777000004', v_city, 'active', 7, 24, 4.9, 302, true, v_admin, now())
  returning id into s_food;
  insert into public.stores (owner_id, name, slug, description, phone, city_id, status, commission_rate, prep_time_hours, rating_avg, rating_count, approved_by, approved_at)
  values (v_admin, 'ركن المنزل', 'home-corner', 'أثاث عصري وأدوات مطبخ تضيف لمسة لبيتك.', '777000005', v_city, 'active', 10, 48, 4.5, 61, v_admin, now())
  returning id into s_home;

  insert into public.store_members (store_id, user_id, role, permissions)
  select s, v_admin, 'owner', '{orders,products,inventory,pricing,finance,team}'
  from unnest(array[s_tech, s_fash, s_beauty, s_food, s_home]) s;

  for r in select * from (values
    -- store, slug, name, category, brand, price, compare, stock, img, desc
    (s_tech, 'sony-wh-headphones', 'سماعة سوني لاسلكية بعزل الضوضاء', 'audio', 'sony', 89000, 105000, 14, 'photo-1505740420928-5e560c06d30e', 'عزل ضوضاء نشط وبطارية تدوم حتى 30 ساعة مع شحن سريع.'),
    (s_tech, 'galaxy-s-phone', 'جوال سامسونج جالكسي 256 جيجا', 'phones', 'samsung', 420000, null, 6, 'photo-1610945415295-d9bbf067e59c', 'شاشة AMOLED 6.6 بوصة، كاميرا 50 ميجابكسل، بطارية 5000 مللي أمبير.'),
    (s_tech, 'iphone-classic', 'جوال آيفون 128 جيجا', 'phones', 'apple', 560000, 590000, 4, 'photo-1511707171634-5f897ff02aa9', 'أداء سلس وكاميرا مميزة ونظام iOS محدث.'),
    (s_tech, 'macbook-air', 'لابتوب ماك بوك إير', 'computers', 'apple', 690000, null, 3, 'photo-1517336714731-489689fd1ca8', 'خفيف الوزن، معالج قوي وبطارية تدوم طوال اليوم.'),
    (s_tech, 'smart-watch-fit', 'ساعة ذكية رياضية', 'accessories', 'xiaomi', 32000, 39000, 25, 'photo-1546868871-7041f2a55e12', 'تتبع النبض والنوم والخطوات، مقاومة للماء.'),
    (s_tech, 'instant-camera', 'كاميرا فورية كلاسيكية', 'cameras', 'canon', 54000, null, 0, 'photo-1526170375885-4d8ecf77b99f', 'التقط صورك واطبعها فورًا بألوان دافئة.'),
    (s_fash, 'red-running-shoe', 'حذاء جري نايكي أحمر', 'shoes', 'nike', 38000, 46000, 18, 'photo-1542291026-7eec264c27ff', 'نعل مريح وخفيف مناسب للجري والاستخدام اليومي.'),
    (s_fash, 'white-sneakers', 'حذاء رياضي أبيض', 'shoes', 'adidas', 29500, null, 22, 'photo-1600185365483-26d7a4cc7519', 'تصميم كلاسيكي يناسب كل الإطلالات.'),
    (s_fash, 'cotton-tshirt', 'تيشيرت قطني بأسلوب عصري', 'men', null, 6500, 8000, 60, 'photo-1576566588028-4147f3842f27', 'قطن 100% مريح ومناسب للصيف.'),
    (s_fash, 'denim-jacket', 'جاكيت جينز رجالي', 'men', null, 18500, null, 12, 'photo-1591047139829-d91aecb6caea', 'جاكيت متين بتصميم أنيق لكل المواسم.'),
    (s_fash, 'leather-handbag', 'حقيبة يد نسائية جلد', 'women', null, 27000, 34000, 9, 'photo-1584917865442-de89df76afd3', 'جلد عالي الجودة مع مساحة واسعة وتنظيم داخلي.'),
    (s_beauty, 'oud-perfume', 'عطر عود فاخر 100 مل', 'perfumes', null, 45000, 52000, 15, 'photo-1585386959984-a4155224a1ad', 'رائحة شرقية ثابتة بلمسات العود والعنبر.'),
    (s_beauty, 'skincare-set', 'مجموعة العناية بالبشرة', 'skincare', 'loreal', 21000, null, 20, 'photo-1556228578-8c89e6adf883', 'غسول ومرطب وسيروم لبشرة نضرة.'),
    (s_beauty, 'serum-bottles', 'سيروم فيتامين سي', 'skincare', 'loreal', 9500, 12000, 30, 'photo-1571781926291-c477ebfd024b', 'يوحّد لون البشرة ويمنحها إشراقة.'),
    (s_beauty, 'classic-watch', 'ساعة يد كلاسيكية', 'accessories', null, 65000, null, 7, 'photo-1523275335684-37898b6baf30', 'تصميم أنيق بسوار جلدي ومقاومة للماء.'),
    (s_beauty, 'sunglasses', 'نظارة شمسية ريبان', 'accessories', 'rayban', 24000, 30000, 11, 'photo-1572635196237-14b3f281503f', 'حماية كاملة من الأشعة فوق البنفسجية.'),
    (s_food, 'yemeni-coffee', 'بن يمني حرازي فاخر 500 جم', 'coffee-honey', 'yemeni-local', 16000, null, 40, 'photo-1559056199-641a0ac8b55e', 'بن حرازي محمّص طازج بنكهة غنية.'),
    (s_food, 'sidr-honey', 'عسل سدر دوعني أصلي 1 كجم', 'coffee-honey', 'yemeni-local', 48000, 55000, 16, 'photo-1587049352846-4a222e784d38', 'عسل سدر دوعني حضرمي مفحوص ومضمون.'),
    (s_food, 'fresh-veg-box', 'سلة خضار طازجة', 'fresh', null, 5500, null, 25, 'photo-1542838132-92c53300491e', 'تشكيلة خضار طازجة يوميًا.'),
    (s_food, 'fruit-box', 'سلة فواكه موسمية', 'fresh', null, 7500, 9000, 20, 'photo-1610832958506-aa56368176cf', 'فواكه موسمية مختارة بعناية.'),
    (s_home, 'green-sofa', 'كنبة مخمل خضراء', 'furniture', null, 185000, 220000, 3, 'photo-1555041469-a586c61ea9bc', 'كنبة مريحة بتصميم عصري تناسب غرف المعيشة.'),
    (s_home, 'wood-chair', 'كرسي خشبي عصري', 'furniture', null, 28000, null, 10, 'photo-1503602642458-232111445657', 'خشب طبيعي متين وتصميم بسيط.'),
    (s_home, 'living-decor', 'طقم ديكور غرفة معيشة', 'home', null, 42000, 50000, 5, 'photo-1513694203232-719a280e022f', 'وسائد ومزهرية ولمسات ديكور متناسقة.'),
    (s_tech, 'pro-watch', 'ساعة ذكية برو', 'accessories', 'samsung', 78000, 88000, 8, 'photo-1579586337278-3befd40fd17a', 'شاشة دائمة التشغيل ومتابعة صحية متقدمة.')
  ) t(store, slug, name, cat, brand, price, compare, stock, img, descr) loop
    v_i := v_i + 1;
    insert into public.products (name, slug, description, category_id, brand_id, status, proposed_by_store_id, created_by, reviewed_by,
                                 rating_avg, rating_count, specs, created_at)
    values (r.name, r.slug, r.descr, (select id from public.categories where slug = r.cat),
            (select id from public.brands where slug = r.brand), 'active', r.store, v_admin, v_admin,
            round((4 + random())::numeric, 1), (10 + floor(random() * 200))::int,
            jsonb_build_object('الضمان', 'سنة', 'بلد المنشأ', case when r.brand = 'yemeni-local' then 'اليمن' else 'مستورد' end),
            now() - make_interval(days => v_i))
    returning id into v_pid;
    insert into public.product_images (product_id, url, sort) values (v_pid, u || r.img || q, 0);
    insert into public.product_variants (product_id, sku, name, is_default) values (v_pid, upper(replace(r.slug, '-', '')) || '-01', 'افتراضي', true)
    returning id into v_vid;
    insert into public.seller_offers (store_id, variant_id, price, compare_at_price) values (r.store, v_vid, r.price, r.compare)
    returning id into v_oid;
    insert into public.inventory_levels (offer_id, qty_on_hand) values (v_oid, r.stock);
    insert into public.inventory_movements (offer_id, delta_on_hand, reason, actor_id) values (v_oid, r.stock, 'initial', v_admin);
  end loop;

  -- منتج واحد بعرضين من متجرين (العرض الفائز يُختار تلقائيًا)
  select pv.id into v_vid from public.product_variants pv join public.products p on p.id = pv.product_id where p.slug = 'smart-watch-fit';
  insert into public.seller_offers (store_id, variant_id, price) values (s_beauty, v_vid, 30500) returning id into v_oid;
  insert into public.inventory_levels (offer_id, qty_on_hand) values (v_oid, 5);

  -- خصومات وكوبونات
  insert into public.merchant_discounts (store_id, title, type, value) values (s_food, 'خصم خيرات اليمن', 'percent', 10);
  insert into public.coupons (code, issuer, type, value, max_discount, min_cart_value, usage_limit, per_user_limit, created_by)
  values ('WELCOME10', 'platform', 'percent', 10, 15000, 10000, 1000, 1, v_admin);
  insert into public.coupons (code, issuer, store_id, type, value, min_cart_value, created_by)
  values ('TECH5000', 'store', s_tech, 'fixed', 5000, 50000, v_admin);
end $$;
