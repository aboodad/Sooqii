import type { MetadataRoute } from 'next';
import { getPublicSupabase } from '@/lib/supabase/server';
import { env } from '@/lib/env';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const sb = getPublicSupabase();
  const [p, s, c] = await Promise.all([
    sb.from('products').select('slug,updated_at').in('status', ['active', 'out_of_stock']).limit(5000),
    sb.from('stores').select('slug,updated_at').eq('status', 'active').limit(1000),
    sb.from('categories').select('slug').eq('is_active', true),
  ]);
  const u = env.siteUrl;
  return [
    { url: u, changeFrequency: 'daily', priority: 1 },
    { url: `${u}/stores`, changeFrequency: 'weekly' },
    ...(c.data ?? []).map((x) => ({ url: `${u}/c/${x.slug}`, changeFrequency: 'daily' as const })),
    ...(p.data ?? []).map((x) => ({ url: `${u}/p/${x.slug}`, lastModified: x.updated_at })),
    ...(s.data ?? []).map((x) => ({ url: `${u}/s/${x.slug}`, lastModified: x.updated_at })),
  ];
}
