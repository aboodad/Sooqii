-- 0010 — دالة التحقق المستخدمة في قيود CHECK يجب أن تكون قابلة للتنفيذ للأدوار
grant execute on function private.valid_image_url(text) to authenticated, anon;
