import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * نوع العميل المستخدم في التطبيق.
 * لا نستخدم أنواعاً مولّدة لقاعدة البيانات، لذا نُرجع نتائج الجداول كـ any
 * ونحدد شكلها في موضع الاستخدام. هذا يتفادى استنتاج العلاقات المضمّنة كمصفوفات خطأً.
 * الأمان لا يعتمد على هذا النوع: RLS وRPCs في قاعدة البيانات هي خط الحماية.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Sb = Omit<SupabaseClient, 'from'> & { from: (relation: string) => any };
