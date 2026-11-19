import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import { getPublicSupabase } from '@/lib/supabase/server';
import { getProduct, getReviews, searchProducts } from '@/lib/api/catalog';
import { ProductGallery } from '@/components/shop/product-gallery';
import { BuyBox, BuyBoxWithStore } from '@/components/shop/buy-box';
import { ProductGrid } from '@/components/shop/product-grid';
import { Suspense } from 'react';
import { Rating } from '@/components/ui/misc';
import { formatDate } from '@/lib/format';
import { ProductQA } from '@/components/shop/product-qa';
import { RecentlyViewed, TrackRecent } from '@/components/shop/recently-viewed';

export const revalidate = 120;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await getProduct(getPublicSupabase(), slug);
  if (!p) return { title: 'المنتج غير موجود' };
  return {
    title: p.name, description: p.description?.slice(0, 160) ?? undefined,
    alternates: { canonical: `/p/${p.slug}` },
    openGraph: { title: p.name, images: p.images.slice(0, 1) },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sb = getPublicSupabase();
  const product = await getProduct(sb, slug);
  if (!product) notFound();
  const [reviews, similar] = await Promise.all([
    getReviews(sb, product.id),
    product.category ? searchProducts(sb, { category: product.category.slug, limit: 10, sort: 'rating' }) : Promise.resolve({ items: [], total: 0 }),
  ]);
  const best = product.variants[0]?.offers[0];
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Product', name: product.name, image: product.images,
    description: product.description, brand: product.brand?.name,
    ...(product.rating_count > 0 && { aggregateRating: { '@type': 'AggregateRating', ratingValue: product.rating, reviewCount: product.rating_count } }),
    ...(best && { offers: { '@type': 'Offer', priceCurrency: 'YER', price: best.price, availability: best.in_stock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' } }),
  };

  return (
    <div className="container py-6">
      {/* JSON-LD مع تهريب "<" لمنع حقن HTML */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <TrackRecent item={{ slug: product.slug, name: product.name, image: product.images[0] ?? null, price: best?.price ?? 0 }} />
      <nav className="mb-4 text-sm text-ink-muted">
        <Link href="/" className="hover:text-brand-600">الرئيسية</Link>
        {product.category && <> / <Link href={`/c/${product.category.slug}`} className="hover:text-brand-600">{product.category.name}</Link></>}
      </nav>
      <div className="grid gap-8 md:grid-cols-2">
        <ProductGallery images={product.images} name={product.name} />
        <div className="space-y-5">
          <div>
            {product.brand && <p className="mb-1 text-sm font-semibold text-brand-600">{product.brand.name}</p>}
            <h1 className="text-2xl font-extrabold leading-snug md:text-3xl">{product.name}</h1>
            {product.rating_count > 0 && <div className="mt-2"><Rating value={Number(product.rating)} count={product.rating_count} size="md" /></div>}
          </div>
          <Suspense fallback={<BuyBox product={product} />}><BuyBoxWithStore product={product} /></Suspense>
          {product.description && (
            <div className="card p-5"><h2 className="mb-2 font-bold">الوصف</h2><p className="whitespace-pre-line text-sm leading-7 text-ink-soft">{product.description}</p></div>
          )}
          {Object.keys(product.specs ?? {}).length > 0 && (
            <div className="card p-5">
              <h2 className="mb-3 font-bold">المواصفات</h2>
              <dl className="divide-y divide-slate-100 text-sm">
                {Object.entries(product.specs).map(([k, v]) => (
                  <div key={k} className="flex justify-between py-2"><dt className="text-ink-muted">{k}</dt><dd className="font-medium">{String(v)}</dd></div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </div>

      <section className="mt-12">
        <h2 className="section-title mb-4 flex items-center gap-2"><MessageSquare className="h-6 w-6 text-brand-500" /> تقييمات المشترين</h2>
        {reviews.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {reviews.map((r) => (
              <div key={r.id} className="card p-4">
                <div className="flex items-center justify-between"><Rating value={r.rating} /><span className="text-xs text-ink-muted">{formatDate(r.created_at)}</span></div>
                {r.comment && <p className="mt-2 text-sm leading-6 text-ink-soft">{r.comment}</p>}
                <p className="mt-2 text-xs font-semibold text-emerald-600">✓ شراء موثّق</p>
              </div>
            ))}
          </div>
        ) : <p className="card p-6 text-center text-sm text-ink-muted">لا توجد تقييمات بعد. التقييم متاح للمشترين بعد الاستلام.</p>}
      </section>

      <ProductQA productId={product.id} />

      {similar.items.filter((x) => x.id !== product.id).length > 0 && (
        <section className="mt-12">
          <h2 className="section-title mb-4">منتجات مشابهة</h2>
          <ProductGrid items={similar.items.filter((x) => x.id !== product.id)} />
        </section>
      )}
      <RecentlyViewed exclude={product.slug} />
    </div>
  );
}
