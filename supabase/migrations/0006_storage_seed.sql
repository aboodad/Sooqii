-- =====================================================================
-- 0006 — التخزين، البيانات المرجعية، حساب المدير العام، بيانات عرض تجريبية
-- ملاحظة أمنية: كلمة مرور المدير العام لا تُخزَّن في هذا الملف؛ تُضبط من
-- لوحة Supabase أو عبر "نسيت كلمة المرور". هذا الملف يمنح الدور فقط.
-- =====================================================================

-- ---------- التخزين ----------
update storage.buckets set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/avif']
where id in ('product-images','store-assets');
update storage.buckets set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg','image/png','application/pdf']
where id = 'kyc-documents';
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images','product-images', true, 5242880, array['image/jpeg','image/png','image/webp','image/avif']),
       ('store-assets','store-assets', true, 5242880, array['image/jpeg','image/png','image/webp','image/avif']),
       ('kyc-documents','kyc-documents', false, 10485760, array['image/jpeg','image/png','application/pdf'])
on conflict (id) do nothing;

-- المسار: <store_id>/<random>.<ext> — لا يرفع المتجر إلا داخل مجلده
create policy "store uploads product images" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images'
    and (storage.foldername(name))[1] in (select s::text from private.my_store_ids() s)
    and private.store_perm(((storage.foldername(name))[1])::uuid, 'products'));
create policy "store updates product images" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] in (select s::text from private.my_store_ids() s));
create policy "store deletes product images" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] in (select s::text from private.my_store_ids() s));

create policy "manager uploads store assets" on storage.objects for insert to authenticated
  with check (bucket_id = 'store-assets'
    and (storage.foldername(name))[1] in (select s::text from private.my_store_ids() s)
    and private.is_store_manager(((storage.foldername(name))[1])::uuid));
create policy "manager updates store assets" on storage.objects for update to authenticated
  using (bucket_id = 'store-assets' and (storage.foldername(name))[1] in (select s::text from private.my_store_ids() s));

create policy "store uploads kyc" on storage.objects for insert to authenticated
  with check (bucket_id = 'kyc-documents'
    and (storage.foldername(name))[1] in (select s::text from private.my_store_ids() s)
    and private.is_store_manager(((storage.foldername(name))[1])::uuid));
create policy "store or admin reads kyc" on storage.objects for select to authenticated
  using (bucket_id = 'kyc-documents' and (
    (storage.foldername(name))[1] in (select s::text from private.my_store_ids() s) or private.is_admin()));

create policy "admin manages content images" on storage.objects for insert to authenticated
  with check (bucket_id = 'store-assets' and (storage.foldername(name))[1] = 'content' and private.is_admin());

-- ---------- الإعدادات العامة ----------
insert into public.app_settings (key, value) values
  ('public_default_shipping', '1500'), ('public_free_shipping_min', '50000'),
  ('public_return_days', '7'), ('public_currency', '"YER"'),
  ('public_support_phone', '"+967 1 000 000"');

-- ---------- المحافظات والمدن ----------
insert into public.governorates (name_ar, sort) values
  ('أمانة العاصمة',1),('صنعاء',2),('عدن',3),('تعز',4),('الحديدة',5),('إب',6),('حضرموت',7),('ذمار',8),
  ('مأرب',9),('عمران',10),('حجة',11),('البيضاء',12),('لحج',13),('أبين',14),('شبوة',15),('المهرة',16),
  ('الضالع',17),('صعدة',18),('ريمة',19),('المحويت',20),('الجوف',21),('سقطرى',22);

insert into public.cities (governorate_id, name_ar)
select g.id, c from public.governorates g
join (values
  ('أمانة العاصمة', array['السبعين','معين','شعوب','الوحدة','التحرير','آزال','الثورة','بني الحارث']),
  ('صنعاء', array['بني مطر','همدان','سنحان','خولان']),
  ('عدن', array['كريتر','المعلا','التواهي','خور مكسر','الشيخ عثمان','المنصورة','البريقة']),
  ('تعز', array['القاهرة','المظفر','صالة','التعزية','المخا']),
  ('الحديدة', array['الحوك','الميناء','الحالي','باجل','زبيد']),
  ('إب', array['المشنة','الظهار','يريم','جبلة']),
  ('حضرموت', array['المكلا','سيئون','الشحر','تريم']),
  ('ذمار', array['مدينة ذمار','عنس']), ('مأرب', array['مدينة مأرب']), ('عمران', array['مدينة عمران']),
  ('حجة', array['مدينة حجة']), ('البيضاء', array['مدينة البيضاء','رداع']), ('لحج', array['الحوطة']),
  ('أبين', array['زنجبار']), ('شبوة', array['عتق']), ('المهرة', array['الغيضة']), ('الضالع', array['مدينة الضالع']),
  ('صعدة', array['مدينة صعدة']), ('ريمة', array['الجبين']), ('المحويت', array['مدينة المحويت']),
  ('الجوف', array['الحزم']), ('سقطرى', array['حديبو'])
) v(gov, cities) on v.gov = g.name_ar
cross join lateral unnest(v.cities) c;

insert into public.shipping_rates (governorate_id, fee, eta_days_min, eta_days_max)
select id, case when name_ar in ('أمانة العاصمة') then 1000 when name_ar in ('صنعاء','عدن') then 1500
                when name_ar in ('سقطرى','المهرة') then 5000 else 2500 end,
       case when name_ar = 'أمانة العاصمة' then 1 else 2 end,
       case when name_ar = 'أمانة العاصمة' then 2 when name_ar in ('سقطرى','المهرة') then 10 else 5 end
from public.governorates;

-- ---------- التصنيفات والعلامات ----------
insert into public.categories (name_ar, slug, icon, color, sort) values
  ('الإلكترونيات','electronics','smartphone','#0EA5A8',1),
  ('الأزياء','fashion','shirt','#F97316',2),
  ('المنزل والمطبخ','home','sofa','#8B5CF6',3),
  ('الجمال والعناية','beauty','sparkles','#EC4899',4),
  ('البقالة','grocery','shopping-basket','#22C55E',5),
  ('الرياضة','sports','dumbbell','#3B82F6',6),
  ('الأطفال','kids','baby','#EAB308',7),
  ('الساعات والإكسسوارات','accessories','watch','#0B7C7E',8);
insert into public.categories (parent_id, name_ar, slug, icon, color, sort)
select c.id, v.name, v.slug, v.icon, c.color, v.sort from public.categories c
join (values
  ('electronics','الجوالات','phones','smartphone',1), ('electronics','السماعات','audio','headphones',2),
  ('electronics','الحواسيب','computers','laptop',3), ('electronics','الكاميرات','cameras','camera',4),
  ('fashion','رجالي','men','shirt',1), ('fashion','نسائي','women','gem',2), ('fashion','الأحذية','shoes','footprints',3),
  ('home','الأثاث','furniture','armchair',1), ('home','المطبخ','kitchen','cooking-pot',2),
  ('beauty','العطور','perfumes','spray-can',1), ('beauty','العناية بالبشرة','skincare','droplet',2),
  ('grocery','القهوة والعسل','coffee-honey','coffee',1), ('grocery','الفواكه والخضار','fresh','apple',2)
) v(parent, name, slug, icon, sort) on v.parent = c.slug;

insert into public.brands (name, slug) values
  ('سامسونج','samsung'),('أبل','apple'),('سوني','sony'),('شاومي','xiaomi'),('نايكي','nike'),('أديداس','adidas'),
  ('كانون','canon'),('محلي يمني','yemeni-local'),('ريبان','rayban'),('لوريال','loreal');

-- ---------- المحتوى الرئيسي ----------
insert into public.content_blocks (kind, title, subtitle, link, theme, sort) values
  ('hero','كل ما تحتاجه في مكان واحد','آلاف المنتجات من متاجر موثوقة، سلة واحدة ودفعة واحدة','/search','teal',1),
  ('hero','عروض الموسم حتى 40%','خصومات حقيقية من متاجرنا على الإلكترونيات والأزياء','/search?sort=discount','orange',2),
  ('hero','بُن وعسل يمني أصيل','من مزارع اليمن إلى باب بيتك','/c/coffee-honey','ink',3),
  ('promo','توصيل مجاني','للطلبات فوق 50,000 ر.ي من نفس المتجر','/search','violet',1);

-- ---------- ملفات المستخدمين الموجودين + حساب المدير العام ----------
insert into public.profiles (id, full_name)
select u.id, left(coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1)), 120) from auth.users u
on conflict (id) do nothing;
insert into public.carts (user_id) select id from public.profiles on conflict do nothing;

insert into public.user_roles (user_id, role)
select u.id, 'super_admin' from auth.users u where lower(u.email) = 'sawqysawqyi@gmail.com'
on conflict do nothing;
update public.profiles set full_name = 'إدارة سوقي'
where id = (select id from auth.users where lower(email) = 'sawqysawqyi@gmail.com');

-- تنظيف سجل الترحيلات القديم (لا علاقة له بالمخطط الجديد)
delete from supabase_migrations.schema_migrations
where name not in ('0001_reset','0002_core_schema','0003_security','0004_catalog_cart_orders','0005_workflows','0006_storage_seed','0007_demo_catalog');
