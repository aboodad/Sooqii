'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { ProductImage } from './product-image';
import { formatPrice } from '@/lib/format';

const KEY = 'sawqy-recent';
type Recent = { slug: string; name: string; image: string | null; price: number };

function read(): Recent[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.slice(0, 12) : []; } catch { return []; }
}

/** يسجّل المنتج في «شاهدتها مؤخرًا» (محليًا على الجهاز فقط) */
export function TrackRecent({ item }: { item: Recent }) {
  useEffect(() => {
    try {
      const list = [item, ...read().filter((r) => r.slug !== item.slug)].slice(0, 12);
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch { /* التخزين غير متاح */ }
  }, [item]);
  return null;
}

export function RecentlyViewed({ exclude }: { exclude?: string }) {
  const [items, setItems] = useState<Recent[]>([]);
  useEffect(() => { setItems(read().filter((r) => r.slug !== exclude)); }, [exclude]);
  if (items.length < 2) return null;
  return (
    <section className="mt-10">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold md:text-xl"><History className="h-5 w-5 text-brand-500" /> شاهدتها مؤخرًا</h2>
      <div className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4">
        {items.map((r) => (
          <Link key={r.slug} href={`/p/${r.slug}`} className="w-32 shrink-0 rounded-2xl border border-line bg-white p-2">
            <div className="relative aspect-square overflow-hidden rounded-xl bg-mist"><ProductImage src={r.image} alt={r.name} sizes="128px" /></div>
            <p className="mt-1.5 line-clamp-2 text-xs">{r.name}</p>
            <p className="text-xs font-semibold">{formatPrice(r.price)}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
