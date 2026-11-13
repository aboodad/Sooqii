'use client';
import Link from 'next/link';
import { useState } from 'react';
import { AlertTriangle, ArrowLeft, ShoppingBag, Store, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { useSession } from '@/hooks/use-session';
import { useQuery } from '@/hooks/use-query';
import { useCartStore } from '@/stores/cart-store';
import { getSupabase } from '@/lib/supabase/client';
import { fetchCart, setCartItem } from '@/lib/api/cart';
import { formatPrice } from '@/lib/format';
import { errorMessage } from '@/lib/utils';
import { ProductImage } from '@/components/shop/product-image';
import { QtyStepper } from '@/components/shop/qty-stepper';
import { OrderSummary } from '@/components/shop/order-summary';
import { CouponInput } from '@/components/shop/coupon-input';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';

export default function CartPage() {
  const { user, loading: sLoading } = useSession();
  if (sLoading) return <div className="container py-8"><Skeleton className="h-64" /></div>;
  return user ? <ServerCart /> : <GuestCart />;
}

function GuestCart() {
  const { guest, setGuestQty } = useCartStore();
  if (!guest.length) return <Empty />;
  const total = guest.reduce((s, g) => s + g.price * g.qty, 0);
  return (
    <div className="container py-8">
      <h1 className="mb-6 text-3xl font-extrabold">سلة التسوق</h1>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card divide-y divide-slate-100 lg:col-span-2">
          {guest.map((g) => (
            <div key={g.offer_id} className="flex gap-4 p-4">
              <Link href={`/p/${g.slug}`} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-slate-50"><ProductImage src={g.image} alt={g.name} sizes="80px" /></Link>
              <div className="flex flex-1 flex-col justify-between">
                <Link href={`/p/${g.slug}`} className="line-clamp-2 text-sm font-semibold">{g.name}</Link>
                <div className="flex items-center justify-between"><QtyStepper qty={g.qty} onChange={(q) => setGuestQty(g.offer_id, q)} /><b>{formatPrice(g.price * g.qty)}</b></div>
              </div>
            </div>
          ))}
        </div>
        <div className="card h-fit space-y-4 p-5">
          <div className="flex justify-between"><span className="text-ink-soft">المجموع التقريبي</span><b className="text-xl">{formatPrice(total)}</b></div>
          <p className="text-xs text-ink-muted">الأسعار النهائية والشحن تُحسب من الخادم عند إتمام الطلب.</p>
          <Link href="/auth/login?next=/checkout"><Button className="w-full" size="lg">سجّل الدخول لإتمام الطلب</Button></Link>
        </div>
      </div>
    </div>
  );
}

function ServerCart() {
  const sb = getSupabase();
  const [coupon, setCoupon] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const setCount = useCartStore((s) => s.setCount);
  const { data: cart, loading, reload, setData } = useQuery(() => fetchCart(sb, coupon), [coupon]);

  async function changeQty(offerId: string, q: number) {
    setBusy(offerId);
    try { setCount(await setCartItem(sb, offerId, q)); setData(await fetchCart(sb, coupon)); }
    catch (e) { toast.error(errorMessage(e)); reload(); }
    finally { setBusy(null); }
  }

  if (loading && !cart) return <div className="container py-8 space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-64" /></div>;
  if (!cart || cart.count === 0) return <Empty />;

  return (
    <div className="container py-8">
      <h1 className="mb-6 text-3xl font-extrabold">سلة التسوق <span className="text-lg font-medium text-ink-muted">({cart.count})</span></h1>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {cart.has_issues && (
            <div className="flex items-center gap-3 rounded-2xl bg-orange-50 p-4 text-sm text-orange-800 ring-1 ring-orange-200">
              <AlertTriangle className="h-5 w-5 shrink-0" /> بعض المنتجات لم تعد متاحة بالكمية المطلوبة. عدّلها لإكمال الطلب.
            </div>
          )}
          {cart.stores.map((s) => (
            <div key={s.store_id} className="card overflow-hidden">
              <div className="flex items-center justify-between bg-gradient-to-l from-brand-50 to-white px-4 py-3">
                <Link href={`/s/${s.slug}`} className="flex items-center gap-2 font-bold"><Store className="h-4 w-4 text-brand-600" /> {s.name}</Link>
                <span className="flex items-center gap-1 text-xs text-ink-soft"><Truck className="h-3.5 w-3.5" /> شحنة مستقلة · {s.shipping > 0 ? formatPrice(s.shipping) : 'شحن مجاني'}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {cart.items.filter((i) => i.store_id === s.store_id).map((i) => (
                  <div key={i.offer_id} className={`flex gap-4 p-4 ${!i.ok ? 'bg-red-50/40' : ''}`}>
                    <Link href={`/p/${i.slug}`} className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-slate-50"><ProductImage src={i.image} alt={i.name} sizes="96px" /></Link>
                    <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
                      <div>
                        <Link href={`/p/${i.slug}`} className="line-clamp-2 text-sm font-semibold hover:text-brand-600">{i.name}</Link>
                        {i.variant && i.variant !== 'افتراضي' && <p className="text-xs text-ink-muted">{i.variant}</p>}
                        {i.issue && <p className="mt-1 text-xs font-semibold text-red-600">{i.issue}</p>}
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <QtyStepper qty={i.qty} max={Math.max(i.available, 1)} disabled={busy === i.offer_id} onChange={(q) => changeQty(i.offer_id, q)} />
                        <div className="text-left">
                          <p className="font-extrabold">{formatPrice(i.line_total)}</p>
                          {i.unit_discount > 0 && <p className="text-xs text-ink-muted line-through">{formatPrice(i.unit_price * i.qty)}</p>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-4 lg:sticky lg:top-24 lg:h-fit">
          <div className="card p-5"><CouponInput value={coupon} message={cart.coupon?.message} valid={cart.coupon?.valid} onApply={setCoupon} /></div>
          <OrderSummary cart={cart}>
            {cart.free_shipping_min > 0 && <p className="rounded-xl bg-brand-50 p-3 text-xs text-brand-800">🚚 شحن مجاني لكل متجر تتجاوز مشترياتك منه {formatPrice(cart.free_shipping_min)}</p>}
            <Link href={`/checkout${coupon ? `?coupon=${coupon}` : ''}`} aria-disabled={cart.has_issues}>
              <Button className="w-full" size="lg" disabled={cart.has_issues}>متابعة الدفع <ArrowLeft className="h-4 w-4" /></Button>
            </Link>
          </OrderSummary>
        </div>
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="container py-10">
      <EmptyState icon={<ShoppingBag />} title="سلتك فارغة" text="ابدأ بإضافة منتجات من متاجرنا المتنوعة."
        action={<Link href="/search"><Button>تصفح المنتجات</Button></Link>} />
    </div>
  );
}
