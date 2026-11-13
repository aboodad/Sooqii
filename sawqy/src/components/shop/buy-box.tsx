'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BadgeCheck, Bell, Clock, Minus, Plus, ShoppingBag, Star, Store, Truck } from 'lucide-react';
import { toast } from 'sonner';
import type { ProductDetail } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Price } from '@/components/ui/misc';
import { useAddToCart } from '@/hooks/use-add-to-cart';
import { useSession } from '@/hooks/use-session';
import { getSupabase } from '@/lib/supabase/client';
import { errorMessage, cn } from '@/lib/utils';

/** يقرأ ?store= من الرابط: يُضاف فقط عند فتح المنتج من صفحة متجر */
export function BuyBoxWithStore({ product }: { product: ProductDetail }) {
  const store = useSearchParams().get('store');
  return <BuyBox product={product} storeSlug={store} />;
}

/**
 * صندوق الشراء. اسم المتجر لا يظهر إلا إذا جاء الزائر من صفحة المتجر نفسه (storeSlug)،
 * وعندها يُختار عرض ذلك المتجر. في غير ذلك يُعرض أفضل عرض دون ذكر البائع.
 */
export function BuyBox({ product, storeSlug }: { product: ProductDetail; storeSlug?: string | null }) {
  const { user } = useSession();
  const [variantId, setVariantId] = useState(product.variants[0]?.id);
  const variant = product.variants.find((v) => v.id === variantId) ?? product.variants[0];
  const storeIdx = storeSlug ? (variant?.offers.findIndex((o) => o.store.slug === storeSlug) ?? -1) : -1;
  const [offerIdx, setOfferIdx] = useState(Math.max(0, storeIdx));
  const offer = variant?.offers[offerIdx] ?? variant?.offers[0];
  const showStore = !!storeSlug && offer?.store.slug === storeSlug;
  const [qty, setQty] = useState(1);
  const { add, busy } = useAddToCart();

  useEffect(() => { setOfferIdx(Math.max(0, storeIdx)); setQty(1); }, [variantId, storeIdx]);
  useEffect(() => { if (user) getSupabase().rpc('track_event', { p_event: 'view', p_product: product.id }).then(() => {}); }, [user, product.id]);

  const maxQty = useMemo(() => Math.max(1, Math.min(offer?.available ?? 1, 20)), [offer]);

  async function notifyMe() {
    if (!user) { toast('سجّل الدخول لتفعيل التنبيه'); return; }
    const { error } = await getSupabase().rpc('notify_when_available', { p_offer: offer!.offer_id });
    if (error) toast.error(errorMessage(error)); else toast.success('سنُبلغك فور توفر المنتج');
  }

  if (!variant || !offer) return <div className="card p-6 text-center text-ink-soft">هذا المنتج غير متاح حاليًا</div>;

  return (
    <div className="space-y-5">
      <div className="tile space-y-5 p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Price value={offer.price} original={offer.original_price} big />
          {offer.discount_percent ? <span className="rounded-full bg-accent-500 px-3 py-1 text-sm font-bold text-white shadow-glow-orange">وفّر {offer.discount_percent}%</span> : null}
        </div>

        {product.variants.length > 1 && (
          <div>
            <p className="label">الخيار</p>
            <div className="flex flex-wrap gap-2">
              {product.variants.map((v) => (
                <button key={v.id} onClick={() => setVariantId(v.id)}
                  className={cn('rounded-xl px-4 py-2 text-sm font-semibold ring-1 transition', v.id === variantId ? 'bg-brand-50 text-brand-700 ring-brand-400' : 'bg-white ring-slate-200 hover:ring-brand-300')}>
                  {v.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 text-sm">
          {offer.in_stock
            ? <span className="flex items-center gap-1.5 font-semibold text-emerald-600"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> متوفر {offer.available <= 5 && `— بقي ${offer.available} فقط`}</span>
            : <span className="font-semibold text-red-600">غير متوفر حاليًا</span>}
        </div>

        {offer.in_stock ? (
          <div className="flex gap-3">
            <div className="flex items-center rounded-2xl bg-slate-100 p-1">
              <button onClick={() => setQty((q) => Math.min(maxQty, q + 1))} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-white" aria-label="زيادة"><Plus className="h-4 w-4" /></button>
              <span className="w-10 text-center font-bold">{qty}</span>
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-white" aria-label="إنقاص"><Minus className="h-4 w-4" /></button>
            </div>
            <Button size="lg" className="flex-1" loading={busy}
              onClick={() => add({ offer_id: offer.offer_id, qty, name: product.name, image: product.images[0] ?? null, price: offer.price, slug: product.slug })}>
              <ShoppingBag className="h-5 w-5" /> أضف إلى السلة
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="lg" className="w-full" onClick={notifyMe}><Bell className="h-5 w-5" /> أبلغني عند التوفر</Button>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs text-ink-soft">
          <span className="flex items-center gap-2 rounded-xl bg-slate-50 p-2.5"><Truck className="h-4 w-4 text-brand-500" /> يُحسب الشحن عند الدفع</span>
          <span className="flex items-center gap-2 rounded-xl bg-slate-50 p-2.5"><Clock className="h-4 w-4 text-brand-500" /> التجهيز خلال {offer.prep_hours} ساعة</span>
        </div>
      </div>

      {/* «يُباع بواسطة»: يظهر فقط عند القدوم من صفحة المتجر */}
      {showStore && (
        <div className="tile p-4 md:p-5">
          <p className="mb-3 text-sm text-ink-muted">يُباع بواسطة</p>
          <Link href={`/s/${offer.store.slug}`} className="group flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 text-lg font-bold text-white">{offer.store.name.slice(0, 1)}</span>
            <div className="flex-1">
              <p className="flex items-center gap-1 font-semibold group-hover:text-brand-600">{offer.store.name} <BadgeCheck className="h-4 w-4 text-brand-500" /></p>
              <p className="flex items-center gap-1 text-xs text-ink-muted"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {Number(offer.store.rating).toFixed(1)} ({offer.store.rating_count} تقييم)</p>
            </div>
            <Store className="h-5 w-5 text-ink-muted" />
          </Link>
        </div>
      )}
    </div>
  );
}
