import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { BadgeCheck, Clock, MapPin, Star } from 'lucide-react';
import { getPublicSupabase } from '@/lib/supabase/server';
import { searchProducts } from '@/lib/api/catalog';
import { CatalogResults } from '@/components/shop/catalog-results';
import { SearchBar } from '@/components/shop/search-bar';
import { readParams, PER_PAGE, type RawParams } from '@/lib/search-params';

export const revalidate = 300;

async function getStore(slug: string) {
  const { data } = await getPublicSupabase().from('stores')
    .select('id,name,slug,description,logo_url,cover_url,rating_avg,rating_count,prep_time_hours,cities(name_ar)')
    .eq('slug', slug).eq('status', 'active').maybeSingle();
  return data as null | { id: string; name: string; slug: string; description: string | null; rating_avg: number; rating_count: number; prep_time_hours: number; cities: { name_ar: string } | null };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const s = await getStore((await params).slug);
  return s ? { title: s.name, description: s.description ?? undefined, alternates: { canonical: `/s/${s.slug}` } } : {};
}

export default async function StorePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<RawParams> }) {
  const { slug } = await params;
  const store = await getStore(slug);
  if (!store) notFound();
  const p = readParams(await searchParams);
  const result = await searchProducts(getPublicSupabase(), { ...p, store: slug, limit: PER_PAGE, offset: (p.page - 1) * PER_PAGE });

  return (
    <div>
      <div className="relative h-44 overflow-hidden bg-gradient-to-l from-brand-700 via-brand-500 to-brand-400 md:h-56">
        <div className="grid-pattern absolute inset-0 opacity-30" />
        <div className="absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-accent-400/40 blur-3xl" />
      </div>
      <div className="container">
        <div className="card relative -mt-16 flex flex-col gap-4 p-5 md:flex-row md:items-center">
          <span className="grid h-24 w-24 shrink-0 place-items-center rounded-3xl bg-gradient-to-br from-brand-400 to-brand-700 text-4xl font-black text-white shadow-glow ring-4 ring-white">{store.name.slice(0, 1)}</span>
          <div className="flex-1">
            <h1 className="flex items-center gap-2 text-2xl font-extrabold">{store.name} <BadgeCheck className="h-6 w-6 text-brand-500" /></h1>
            {store.description && <p className="mt-1 text-sm text-ink-soft">{store.description}</p>}
            <div className="mt-3 flex flex-wrap gap-4 text-sm text-ink-soft">
              <span className="flex items-center gap-1"><Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {Number(store.rating_avg).toFixed(1)} ({store.rating_count})</span>
              <span className="flex items-center gap-1"><Clock className="h-4 w-4 text-brand-500" /> تجهيز خلال {store.prep_time_hours} ساعة</span>
              {store.cities && <span className="flex items-center gap-1"><MapPin className="h-4 w-4 text-brand-500" /> {store.cities.name_ar}</span>}
            </div>
          </div>
          <Suspense><SearchBar store={store.slug} className="md:w-80" /></Suspense>
        </div>
        <div className="py-8">
          <CatalogResults result={result} page={p.page} perPage={PER_PAGE} base={`/s/${slug}`} params={p.raw} storeSlug={slug} />
        </div>
      </div>
    </div>
  );
}
