import type { Sb } from '@/lib/supabase/types';

/** حفظ إعداد عام (RLS: الكتابة للإدارة فقط، وتُسجَّل في سجل التدقيق) */
export async function saveSetting(sb: Sb, key: string, value: unknown) {
  const { error } = await sb.from('app_settings').upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function loadSettings(sb: Sb, keys: string[]) {
  const { data, error } = await sb.from('app_settings').select('key,value').in('key', keys);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value])) as Record<string, unknown>;
}
