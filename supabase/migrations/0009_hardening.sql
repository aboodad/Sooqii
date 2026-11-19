-- 0009 — تقوية إضافية: روابط صور المتاجر مقيدة بالتخزين الموثوق
alter table public.stores
  add constraint stores_logo_url_trusted check (logo_url is null or private.valid_image_url(logo_url)),
  add constraint stores_cover_url_trusted check (cover_url is null or private.valid_image_url(cover_url));
alter table public.profiles
  add constraint profiles_avatar_url_trusted check (avatar_url is null or private.valid_image_url(avatar_url));
-- روابط الإشعارات داخلية فقط
alter table public.notifications add constraint notifications_link_internal check (link is null or link ~ '^/[^/\\]');
