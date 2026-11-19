import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicSupabase } from '@/lib/supabase/server';
import { getCategories, searchProducts } from '@/lib/api/catalog';
import { CatalogResults } from '@/components/shop/catalog-results';
import { DynamicIcon } from '@/components/ui/dynamic-icon';
import { IconTile } from '@/components/ui/misc';
import { readParams, PER_PAGE, type RawParams } from '@/lib/search-params';

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const cat = (await getCategories(getPublicSupabase())).find((c) => c.slug === slug);
  return cat ? { title: cat.name_ar, description: `تسوق ${cat.name_ar} من أفضل المتاجر على سوقي`, alternates: { canonical: `/c/${slug}` } } : {};
}

export default async function CategoryPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<RawParams> }) {
  const { slug } = await params;
  const p = readParams(await searchParams);
  const sb = getPublicSupabase();
  const cats = await getCategories(sb);
  const cat = cats.find((c) => c.slug === slug);
  if (!cat) notFound();
  const children = cats.filter((c) => c.parent_id === cat.id);
  const parent = cats.find((c) => c.id === cat.parent_id);
  const result = await searchProducts(sb, { ...p, category: slug, limit: PER_PAGE, offset: (p.page - 1) * PER_PAGE });

  return (
    <div className="container py-8">
      <nav className="mb-4 text-sm text-ink-muted"><Link href="/" className="hover:text-brand-600">الرئيسية</Link> / {parent && <><Link href={`/c/${parent.slug}`} className="hover:text-brand-600">{parent.name_ar}</Link> / </>}<span className="text-ink">{cat.name_ar}</span></nav>
      <div className="mb-6 flex items-center gap-4">
        <IconTile color={cat.color} className="h-14 w-14"><DynamicIcon name={cat.icon} /></IconTile>
        <h1 className="text-3xl font-extrabold">{cat.name_ar}</h1>
      </div>
      {children.length > 0 && (
        <div className="scrollbar-none mb-6 flex gap-2 overflow-x-auto">
          {children.map((c) => (
            <Link key={c.id} href={`/c/${c.slug}`} className="flex shrink-0 items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold shadow-soft ring-1 ring-slate-900/5 transition hover:-translate-y-0.5 hover:text-brand-600">
              <DynamicIcon name={c.icon} className="h-4 w-4" />{c.name_ar}
            </Link>
          ))}
        </div>
      )}
      <CatalogResults result={result} page={p.page} perPage={PER_PAGE} base={`/c/${slug}`} params={p.raw} />
    </div>
  );
}
