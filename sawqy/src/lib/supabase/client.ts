'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { Sb } from './types';
import { env } from '@/lib/env';

let client: Sb | undefined;

/** عميل المتصفح — يستخدم المفتاح المنشور فقط، وRLS تحمي البيانات */
export function getSupabase(): Sb {
  if (!client) client = createBrowserClient(env.supabaseUrl, env.supabaseKey) as unknown as Sb;
  return client;
}
