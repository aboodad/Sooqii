import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import type { Sb } from './types';

/** عميل الخادم بجلسة المستخدم نفسها (RLS فعّالة) */
export async function getServerSupabase(): Promise<Sb> {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // يُستدعى من Server Component — يتولى middleware تحديث الجلسة
        }
      },
    },
  }) as unknown as Sb;
}

/** عميل عام بلا جلسة للصفحات القابلة للتخزين المؤقت (الكتالوج فقط) */
export function getPublicSupabase(): Sb {
  return createClient(env.supabaseUrl, env.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as Sb;
}
