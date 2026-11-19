'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProductCardData } from '@/lib/types';
import { getSupabase } from '@/lib/supabase/client';
import { searchProducts } from '@/lib/api/catalog';
import { ProductCard, ProductCardSkeleton } from './product-card';

const PAGE = 20;

/**
 * كل منتجات المنصة في شبكة عمودية مع تحميل تلقائي عند النزول.
 * بعد عرض آخر منتج تظهر بقية أقسام الصفحة (children).
 */
export function ProductFeed({ initial, total, children }: { initial: ProductCardData[]; total: number; children?: React.ReactNode }) {
  const [items, setItems] = useState(initial);
  const [count, setCount] = useState(total);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const done = items.length >= count || failed;
  const [sponsored, setSponsored] = useState<ProductCardData[]>([]);
  useEffect(() => {
    getSupabase().rpc('get_sponsored', { p_placement: 'feed', p_limit: 4 }).then(({ data }) => {
      const list = (data ?? []) as ProductCardData[];
      setSponsored(list);
      list.forEach((x) => x.campaign_id && getSupabase().rpc('ad_track', { p_campaign: x.campaign_id, p_event: 'view' }).then(() => {}));
    });
  }, []);
  // يُدرج منتج ممول بعد كل 8 منتجات (مع وسم «ممول» واضح)
  const merged: ProductCardData[] = [];
  items.forEach((p, i) => {
    merged.push(p);
    const ad = sponsored[Math.floor(i / 8)];
    if ((i + 1) % 8 === 4 && ad) merged.push({ ...ad, sponsored: true });
  });

  const loadMore = useCallback(async () => {
    if (busy.current || done) return;
    busy.current = true; setLoading(true);
    try {
      const res = await searchProducts(getSupabase(), { sort: 'newest', limit: PAGE, offset: items.length });
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...res.items.filter((p) => !seen.has(p.id))];
      });
      setCount(res.items.length < PAGE ? items.length + res.items.length : res.total);
    } catch {
      setFailed(true);
    } finally {
      busy.current = false; setLoading(false);
    }
  }, [done, items.length]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || done) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) loadMore(); }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, done]);

  return (
    <>
      <section>
        <div className="mb-3 flex items-end justify-between md:mb-4">
          <div>
            <h2 className="text-lg font-semibold md:text-2xl">كل المنتجات</h2>
            <p className="mt-0.5 text-xs text-ink-soft md:text-sm">من جميع متاجر سوقي</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          {merged.map((p, i) => <ProductCard key={`${p.sponsored ? 'ad-' : ''}${p.id}-${i}`} p={p} priority={i < 2} />)}
          {loading && Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={`s${i}`} />)}
        </div>
        {!done && <div ref={sentinel} className="h-px" aria-hidden />}
        {failed && (
          <button onClick={() => { setFailed(false); }} className="mx-auto mt-4 block rounded-2xl bg-mist px-5 py-3 text-sm text-ink-soft">تعذر تحميل المزيد، اضغط للمحاولة مرة أخرى</button>
        )}
      </section>
      {done && !failed && children}
    </>
  );
}
