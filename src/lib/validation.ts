import { z } from 'zod';

export const phoneSchema = z.string().trim().regex(/^[0-9+ ]{7,20}$/, 'رقم هاتف غير صالح');

export const loginSchema = z.object({
  email: z.string().trim().email('بريد إلكتروني غير صالح').max(254),
  password: z.string().min(8, 'كلمة المرور 8 أحرف على الأقل').max(72),
});
export const registerSchema = loginSchema.extend({
  full_name: z.string().trim().min(2, 'الاسم قصير جدًا').max(120),
});
export const addressSchema = z.object({
  label: z.string().trim().min(1).max(40),
  recipient_name: z.string().trim().min(2, 'اسم المستلم مطلوب').max(120),
  phone: phoneSchema,
  city_id: z.coerce.number().int().positive('اختر المدينة'),
  district: z.string().trim().max(120).optional(),
  street: z.string().trim().max(200).optional(),
  details: z.string().trim().max(300).optional(),
});
export const storeSchema = z.object({
  name: z.string().trim().min(2, 'اسم المتجر مطلوب').max(80),
  slug: z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'الرابط بالأحرف الإنجليزية الصغيرة والأرقام والشرطة فقط').max(60),
  phone: phoneSchema,
  city_id: z.coerce.number().int().positive('اختر المدينة'),
  description: z.string().trim().max(2000).optional(),
});
export const variantSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().max(80).default('افتراضي'),
  sku: z.string().trim().min(2, 'SKU مطلوب').max(64),
  barcode: z.string().trim().max(64).optional(),
  price: z.coerce.number().positive('السعر مطلوب').max(99999999),
  compare_at_price: z.coerce.number().nonnegative().max(99999999).optional(),
  stock: z.coerce.number().int().min(0).max(1000000),
});
export const productSchema = z.object({
  name: z.string().trim().min(2, 'اسم المنتج مطلوب').max(200),
  description: z.string().trim().max(8000).optional(),
  category_id: z.coerce.number().int().positive('اختر التصنيف'),
  brand_id: z.coerce.number().int().positive().optional(),
  variants: z.array(variantSchema).min(1).max(30),
});
export const couponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,24}$/, 'الرمز 3-24 حرفًا إنجليزيًا أو رقمًا'),
  type: z.enum(['percent', 'fixed']),
  value: z.coerce.number().positive(),
  min_cart_value: z.coerce.number().min(0).default(0),
  max_discount: z.coerce.number().positive().optional(),
  usage_limit: z.coerce.number().int().positive().optional(),
  per_user_limit: z.coerce.number().int().positive().default(1),
});

export function firstError(r: z.SafeParseReturnType<unknown, unknown>) {
  return r.success ? null : r.error.issues[0]?.message ?? 'بيانات غير صالحة';
}

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
