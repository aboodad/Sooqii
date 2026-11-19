import type { Metadata } from 'next';
import { getServerSupabase } from '@/lib/supabase/server';
import { searchProducts } from '@/lib/api/catalog';
import { CatalogResults } from '@/components/shop/catalog-results';
import { readParams, PER_PAGE, type RawParams } from '@/lib/search-params';

export const metadata: Metadata = { title: 'البحث', robots: { index: false, follow: true } };

export default async function SearchPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const p = readParams(await searchParams);
  const sb = await getServerSupabase();
  const result = await searchProducts(sb, { ...p, limit: PER_PAGE, offset: (p.page - 1) * PER_PAGE });
  if (p.q && p.page === 1) sb.rpc('log_search', { p_q: p.q, p_results: result.total }).then(() => {});
  return (
    <div className="container py-8">
      <h1 className="mb-6 text-2xl font-extrabold md:text-3xl">
        {p.q ? <>نتائج البحث عن <span className="text-gradient">«{p.q}»</span></> : 'كل المنتجات'}
      </h1>
      <CatalogResults result={result} page={p.page} perPage={PER_PAGE} base="/search" params={p.raw} />
    </div>
  );
}
