'use client';
import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Banknote, CheckCircle2, Info, MapPin, Plus, Store, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { fetchCart, placeOrder } from '@/lib/api/cart';
import { useQuery } from '@/hooks/use-query';
import { useCartStore } from '@/stores/cart-store';
import type { Address } from '@/lib/types';
import { formatPrice } from '@/lib/format';
import { errorMessage, cn } from '@/lib/utils';
import { OrderSummary } from '@/components/shop/order-summary';
import { CouponInput } from '@/components/shop/coupon-input';
import { AddressForm } from '@/components/account/address-form';
import { Button } from '@/components/ui/button';
import { Modal, Skeleton } from '@/components/ui/misc';
import { Textarea } from '@/components/ui/field';

function Checkout() {
  const sb = getSupabase();
  const router = useRouter();
  const sp = useSearchParams();
  const [coupon, setCoupon] = useState<string | null>(sp.get('coupon'));
  const [addressId, setAddressId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [adding, setAdding] = useState(false);
  const [placing, setPlacing] = useState(false);
  const idemKey = useMemo(() => crypto.randomUUID(), []); // يمنع إنشاء الطلب مرتين عند الضغط المتكرر
  const setCount = useCartStore((s) => s.setCount);

  const addresses = useQuery(async () => {
    const { data } = await sb.from('addresses').select('*, cities(name_ar, governorates(name_ar))').is('archived_at', null).order('is_default', { ascending: false }).order('created_at', { ascending: false });
    return (data as Address[]) ?? [];
  });
  useEffect(() => { if (!addressId && addresses.data?.length) setAddressId(addresses.data[0].id); }, [addresses.data, addressId]);
  const cart = useQuery(() => fetchCart(sb, coupon, addressId), [coupon, addressId]);

  async function submit() {
    if (!addressId) return toast.error('اختر عنوان التوصيل');
    setPlacing(true);
    try {
      const r = await placeOrder(sb, { addressId, coupon, notes, key: idemKey });
      setCount(0);
      router.replace(`/checkout/result/${r.order_id}`);
    } catch (e) {
      toast.error(errorMessage(e));
      cart.reload();
      setPlacing(false);
    }
  }

  const c = cart.data;
  if ((cart.loading && !c) || addresses.loading) return <div className="container grid gap-6 py-8 lg:grid-cols-3"><Skeleton className="h-96 lg:col-span-2" /><Skeleton className="h-72" /></div>;
  if (!c || c.count === 0) return <div className="container py-16 text-center"><p className="mb-4 text-ink-soft">سلتك فارغة</p><Link href="/search" className="font-bold text-brand-600">تسوق الآن</Link></div>;

  return (
    <div className="container py-8">
      <h1 className="mb-6 text-3xl font-extrabold">إتمام الطلب</h1>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Step n={1} title="عنوان التوصيل" icon={<MapPin />}>
            <div className="grid gap-3 sm:grid-cols-2">
              {addresses.data?.map((a) => (
                <button key={a.id} onClick={() => setAddressId(a.id)}
                  className={cn('relative rounded-2xl p-4 text-right ring-2 transition', a.id === addressId ? 'bg-brand-50 ring-brand-500' : 'bg-white ring-slate-200 hover:ring-brand-300')}>
                  {a.id === addressId && <CheckCircle2 className="absolute left-3 top-3 h-5 w-5 text-brand-600" />}
                  <p className="font-bold">{a.label} · {a.recipient_name}</p>
                  <p className="mt-1 text-sm text-ink-soft">{a.cities?.governorates?.name_ar}، {a.cities?.name_ar}{a.district ? `، ${a.district}` : ''}</p>
                  <p className="mt-1 text-xs text-ink-muted" dir="ltr">{a.phone}</p>
                </button>
              ))}
              <button onClick={() => setAdding(true)} className="flex min-h-[96px] items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 text-sm font-semibold text-ink-soft hover:border-brand-400 hover:text-brand-600">
                <Plus className="h-4 w-4" /> عنوان جديد
              </button>
            </div>
          </Step>

          <Step n={2} title="الشحنات والتوصيل" icon={<Truck />}>
            <div className="mb-3 flex gap-2 rounded-xl bg-sky-50 p-3 text-xs leading-5 text-sky-800">
              <Info className="h-4 w-4 shrink-0" /> طلبك من {c.stores.length} متجر. توحيد السلة والدفع لا يعني وصولها معًا؛ قد تصل كل شحنة في وقت مختلف.
            </div>
            <div className="space-y-2">
              {c.stores.map((s) => (
                <div key={s.store_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm">
                  <span className="flex items-center gap-2 font-semibold"><Store className="h-4 w-4 text-brand-600" />{s.name} <span className="text-xs font-normal text-ink-muted">({s.item_count} منتج)</span></span>
                  <span className="text-ink-soft">الوصول خلال {s.eta_min}–{s.eta_max} أيام · <b className="text-ink">{s.shipping > 0 ? formatPrice(s.shipping) : 'مجاني'}</b></span>
                </div>
              ))}
            </div>
          </Step>

          <Step n={3} title="طريقة الدفع" icon={<Banknote />}>
            <div className="flex items-center gap-3 rounded-2xl bg-brand-50 p-4 ring-2 ring-brand-500">
              <Banknote className="h-6 w-6 text-brand-600" />
              <div><p className="font-bold">الدفع عند الاستلام</p><p className="text-xs text-ink-soft">ادفع نقدًا للمندوب عند استلام كل شحنة. الدفع الإلكتروني قريبًا.</p></div>
            </div>
            <Textarea className="mt-3" placeholder="ملاحظات للطلب (اختياري)" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Step>
        </div>

        <div className="space-y-4 lg:sticky lg:top-24 lg:h-fit">
          <div className="card p-5"><CouponInput value={coupon} message={c.coupon?.message} valid={c.coupon?.valid} onApply={setCoupon} /></div>
          <OrderSummary cart={c}>
            {c.has_issues && <p className="rounded-xl bg-red-50 p-3 text-xs text-red-700">بعض المنتجات غير متاحة. <Link href="/cart" className="font-bold underline">راجع السلة</Link></p>}
            <Button className="w-full" size="lg" variant="accent" loading={placing} disabled={c.has_issues || !addressId || (!!coupon && !c.coupon?.valid)} onClick={submit}>
              تأكيد الطلب · {formatPrice(c.totals.grand_total)}
            </Button>
            <p className="text-center text-[11px] text-ink-muted">بالضغط على تأكيد الطلب فأنت توافق على شروط الاستخدام وسياسة الإرجاع.</p>
          </OrderSummary>
        </div>
      </div>

      <Modal open={adding} onClose={() => setAdding(false)} title="إضافة عنوان" wide>
        <AddressForm onSaved={(id) => { setAdding(false); addresses.reload().then(() => setAddressId(id)); }} />
      </Modal>
    </div>
  );
}

function Step({ n, title, icon, children }: { n: number; title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="mb-4 flex items-center gap-3 text-lg font-bold">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-sm text-white shadow-glow">{n}</span>
        <span className="flex items-center gap-2 [&>svg]:h-5 [&>svg]:w-5 [&>svg]:text-brand-600">{icon}{title}</span>
      </h2>
      {children}
    </section>
  );
}

export default function CheckoutPage() { return <Suspense><Checkout /></Suspense>; }
