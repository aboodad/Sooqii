'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Heart, Plus, Check, Star } from 'lucide-react';
import { toast } from 'sonner';
import type { ProductCardData } from '@/lib/types';
import { formatPrice } from '@/lib/format';
import { ProductImage } from './product-image';
import { useAddToCart } from '@/hooks/use-add-to-cart';
import { useSession } from '@/hooks/use-session';
import { getSupabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

/** بطاقة المنتج (النموذج الثالث): صورة على خلفية فاتحة + زر إضافة داكن + سعر واضح (بدون اسم المتجر — SH-01) */
/** storeSlug: عند العرض داخل صفحة متجر، يُمرَّر لتظهر بيانات المتجر في صفحة المنتج */
export function ProductCard({ p, priority, storeSlug }: { p: ProductCardData; priority?: boolean; storeSlug?: string }) {
  const { add, busy } = useAddToCart();
  const { user } = useSession();
  const [added, setAdded] = useState(false);
  const [liked, setLiked] = useState(false);

  async function quickAdd(e: React.MouseEvent) {
    e.preventDefault();
    if (!p.in_stock) return;
    const ok = await add({ offer_id: p.offer_id, qty: 1, name: p.name, image: p.image, price: p.price, slug: p.slug });
    if (ok) { setAdded(true); setTimeout(() => setAdded(false), 1400); }
  }
  async function toggleLike(e: React.MouseEvent) {
    e.preventDefault();
    if (!user) { toast('سجّل الدخول لحفظ المفضلة'); return; }
    const sb = getSupabase();
    const next = !liked; setLiked(next);
    const { error } = next
      ? await sb.from('wishlists').insert({ user_id: user.id, product_id: p.id })
      : await sb.from('wishlists').delete().eq('product_id', p.id);
    if (error && error.code !== '23505') { setLiked(!next); toast.error('تعذر التحديث'); }
    else if (next) { sb.rpc('track_event', { p_event: 'wishlist', p_product: p.id }).then(() => {}); toast.success('أُضيف للمفضلة'); }
  }

  return (
    <Link href={storeSlug ? `/p/${p.slug}?store=${encodeURIComponent(storeSlug)}` : `/p/${p.slug}`}
      onClick={() => { if (p.sponsored && p.campaign_id) getSupabase().rpc('ad_track', { p_campaign: p.campaign_id, p_event: 'click' }).then(() => {}); }}
      className="group block rounded-[1.5rem] border border-line bg-white p-2 transition hover:border-brand-200 hover:shadow-soft md:p-2.5">
      <div className="relative aspect-square overflow-hidden rounded-[1.1rem] bg-mist">
        <ProductImage src={p.image} alt={p.name} priority={priority} className="transition-transform duration-500 group-hover:scale-105" />
        {p.discount_percent ? (
          <span className="absolute right-2.5 top-2.5 z-[5] rounded-full bg-accent-500 px-2.5 py-0.5 text-xs font-semibold text-white" dir="ltr">
            -{p.discount_percent}%
          </span>
        ) : null}
        {p.sponsored && <span className="absolute bottom-2.5 right-2.5 z-[5] rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-ink-soft">ممول</span>}
        {!p.in_stock && (
          <span className="absolute inset-x-2.5 bottom-2.5 z-[5] rounded-xl bg-ink/80 py-1.5 text-center text-xs font-medium text-white backdrop-blur">غير متوفر حاليًا</span>
        )}
        <button onClick={toggleLike} aria-label={liked ? 'إزالة من المفضلة' : 'أضف للمفضلة'}
          className="absolute left-2.5 top-2.5 z-10 grid h-9 w-9 place-items-center rounded-full bg-white text-ink-soft transition hover:text-accent-500">
          <Heart className={cn('h-4 w-4', liked && 'fill-accent-500 text-accent-500')} />
        </button>
        {p.in_stock && (
          <button onClick={quickAdd} disabled={busy} aria-label="أضف إلى السلة"
            className={cn('absolute bottom-2.5 left-2.5 z-10 grid h-10 w-10 place-items-center rounded-[14px] text-white transition-all duration-200 active:scale-90',
              added ? 'bg-emerald-500' : 'bg-ink hover:bg-brand-600')}>
            {added ? <Check className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
          </button>
        )}
      </div>
      <div className="px-1.5 pb-1.5 pt-2.5">
        <h3 className="line-clamp-2 min-h-[2.6rem] text-[13px] leading-5 text-ink md:text-sm">{p.name}</h3>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-[15px] font-semibold text-ink md:text-base">{formatPrice(p.price)}</span>
          {p.rating_count > 0 && (
            <span className="flex items-center gap-0.5 text-xs text-ink-soft"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{Number(p.rating).toFixed(1)}</span>
          )}
        </div>
        {p.original_price ? <span className="text-xs text-ink-muted line-through">{formatPrice(p.original_price)}</span> : <span className="block h-4" />}
      </div>
    </Link>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="rounded-[1.5rem] border border-line bg-white p-2.5">
      <div className="skeleton aspect-square rounded-[1.1rem]" />
      <div className="space-y-2 p-1.5 pt-3"><div className="skeleton h-4" /><div className="skeleton h-4 w-2/3" /><div className="skeleton h-5 w-1/2" /></div>
    </div>
  );
}
