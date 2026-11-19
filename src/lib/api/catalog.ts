import type { Sb } from '@/lib/supabase/types';
import type { Category, ProductDetail, SearchResult } from '@/lib/types';

export type SearchParams = {
  q?: string; category?: string; store?: string; brand?: number; min?: number; max?: number;
  inStock?: boolean; sort?: string; limit?: number; offset?: number;
};

export async function searchProducts(sb: Sb, p: SearchParams): Promise<SearchResult> {
  const { data, error } = await sb.rpc('search_products', {
    p_q: p.q || null, p_category: p.category || null, p_store: p.store || null, p_brand: p.brand || null,
    p_min: p.min ?? null, p_max: p.max ?? null, p_in_stock: !!p.inStock, p_sort: p.sort || 'relevance',
    p_limit: p.limit ?? 24, p_offset: p.offset ?? 0,
  });
  if (error) throw error;
  return (data as SearchResult) ?? { items: [], total: 0 };
}

export async function getProduct(sb: Sb, slug: string): Promise<ProductDetail | null> {
  const { data, error } = await sb.rpc('get_product', { p_slug: slug });
  if (error) throw error;
  return data as ProductDetail | null;
}

export async function getCategories(sb: Sb): Promise<Category[]> {
  const { data } = await sb.from('categories').select('id,parent_id,name_ar,slug,icon,color,sort').eq('is_active', true).order('sort');
  return (data as Category[]) ?? [];
}

export async function getStores(sb: Sb, featuredOnly = false) {
  let q = sb.from('stores').select('id,name,slug,description,logo_url,cover_url,rating_avg,rating_count,prep_time_hours,is_featured,cities(name_ar)')
    .eq('status', 'active');
  if (featuredOnly) q = q.eq('is_featured', true);
  const { data } = await q.order('is_featured', { ascending: false }).order('rating_count', { ascending: false }).limit(50);
  return data ?? [];
}

export async function getReviews(sb: Sb, productId: string) {
  const { data } = await sb.from('reviews').select('id,rating,comment,created_at').eq('product_id', productId)
    .eq('status', 'published').order('created_at', { ascending: false }).limit(10);
  return data ?? [];
}
