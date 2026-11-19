'use client';
import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Banknote, CheckCircle2, Coins, Info, MapPin, MessageCircle, Package, Plus, Store, Truck, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { fetchCart, placeOrder } from '@/lib/api/cart';
import { useQuery } from '@/hooks/use-query';
import { usePublicSettings, useCurrencyStore, Money } from '@/hooks/use-settings';
import { useCartStore } from '@/stores/cart-store';
import type { Address } from '@/lib/types';
import { formatNumber, formatPrice } from '@/lib/format';
import { errorMessage, cn } from '@/lib/utils';
import { OrderSummary } from '@/components/shop/order-summary';
import { CouponInput } from '@/components/shop/coupon-input';
import { AddressForm } from '@/components/account/address-form';
import { Button } from '@/components/ui/button';
import { Modal, Skeleton } from '@/components/ui/misc';
import { Textarea } from '@/components/ui/field';

type Pickup = { id: number; name: string; address: string | null; hours: string | null };

function Checkout() {
  const sb = getSupabase();
  const router = useRouter();
  const sp = useSearchParams();
  const { settings } = usePublicSettings();
  const currency = useCurrencyStore((s) => s.code);
  const [coupon, setCoupon] = useState<string | null>(sp.get('coupon'));
  const [addressId, setAddressId] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<'delivery' | 'pickup'>('delivery');
  const [pickupId, setPickupId] = useState<number | null>(null);
  const [payment, setPayment] = useState('cod');
  const [usePoints, setUsePoints] = useState(false);
  const [notes, setNotes] = useState('');
  const [adding, setAdding] = useState(false);
  const [placing, setPlacing] = useState(false);
  const idemKey = useMemo(() => crypto.randomUUID(), []); // يمنع إنشاء الطلب مرتين عند الضغط المتكرر
  const setCount = useCartStore((s) => s.setCount);

  const methods = settings.payment_methods.filter((m) => m.enabled);
  useEffect(() => { if (methods.length && !methods.some((m) => m.key === payment)) setPayment(methods[0].key); }, [methods, payment]);

  const addresses = useQuery(async () => {
    const { data } = await sb.from('addresses').select('*, cities(name_ar, governorates(name_ar))').is('archived_at', null).order('is_default', { ascending: false }).order('created_at', { ascending: false });
    return (data as Address[]) ?? [];
  });
  const pickups = useQuery(async () => {
    if (!settings.pickup_enabled) return [] as Pickup[];
    const { data } = await sb.from('locations').select('id,name,address,hours').eq('type', 'pickup').eq('is_active', true).order('name');
    return (data as Pickup[]) ?? [];
  }, [settings.pickup_enabled]);
  useEffect(() => { if (!addressId && addresses.data?.length) setAddressId(addresses.data[0].id); }, [addresses.data, addressId]);

  // نطلب أقصى نقاط مسموحة؛ الخادم يحدد الحد الفعلي
  const cart = useQuery(() => fetchCart(sb, coupon, addressId, delivery, usePoints ? 1_000_000 : 0), [coupon, addressId, delivery, usePoints]);

  async function submit() {
    if (!addressId) return toast.error('اختر عنوانًا (يُستخدم للتواصل وحساب الشحن)');
    if (delivery === 'pickup' && !pickupId) return toast.error('اختر نقطة الاستلام');
    setPlacing(true);
    try {
      const r = await placeOrder(sb, {
        addressId, coupon, notes, key: idemKey, payment, delivery, pickup: pickupId,
        points: usePoints ? cart.data?.points?.used ?? 0 : 0, currency,
      });
      setCount(0);
      // زر واتساب يظهر في صفحة النتيجة (فتح النوافذ تلقائيًا تحجبه المتصفحات بعد عملية غير متزامنة)
      router.replace(`/checkout/result/${r.order_id}${payment !== 'cod' ? '?pay=1' : ''}`);
    } catch (e) {
      toast.error(errorMessage(e));
      cart.reload();
      setPlacing(false);
    }
  }

  const c = cart.data;
  if ((cart.loading && !c) || addresses.loading) return <div className="container grid gap-6 py-8 lg:grid-cols-3"><Skeleton className="h-96 lg:col-span-2" /><Skeleton className="h-72" /></div>;
  if (!c || c.count === 0) return <div className="container py-16 text-center"><p className="mb-4 text-ink-soft">سلتك فارغة</p><Link href="/search" className="font-bold text-brand-600">تسوق الآن</Link></div>;

  const single = c.mode && c.mode !== 'direct';
  const etaMin = Math.min(...c.stores.map((s) => s.eta_min)); const etaMax = Math.max(...c.stores.map((s) => s.eta_max));
  const pts = c.points;
  const selected = methods.find((m) => m.key === payment);

  return (
    <div className="container py-6 md:py-8">
      <h1 className="mb-6 text-2xl font-extrabold md:text-3xl">إتمام الطلب</h1>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Step n={1} title="طريقة الاستلام" icon={<Truck />}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Choice active={delivery === 'delivery'} onClick={() => setDelivery('delivery')} icon={<Truck />} title="توصيل إلى عنواني"
                text={settings.hub_enabled ? 'تُجمع شحناتك في طرد واحد عبر مركز سوقي' : 'تصلك كل شحنة من مصدرها مباشرة'} />
              {settings.pickup_enabled && (
                <Choice active={delivery === 'pickup'} onClick={() => setDelivery('pickup')} icon={<Store />} title="استلام من نقطة سوقي"
                  text={settings.pickup_fee > 0 ? `رسوم ${formatPrice(settings.pickup_fee)}` : 'بدون رسوم شحن'} />
              )}
            </div>
            {delivery === 'pickup' && (
              <div className="mt-3 grid gap-2">
                {pickups.data?.length ? pickups.data.map((p) => (
                  <button key={p.id} onClick={() => setPickupId(p.id)} className={cn('rounded-xl p-3 text-right text-sm ring-2 transition', pickupId === p.id ? 'bg-brand-50 ring-brand-500' : 'bg-white ring-slate-200')}>
                    <b>{p.name}</b>{p.address && <span className="block text-xs text-ink-soft">{p.address}</span>}{p.hours && <span className="block text-xs text-ink-muted">{p.hours}</span>}
                  </button>
                )) : <p className="text-sm text-ink-muted">لا توجد نقاط استلام متاحة حاليًا.</p>}
              </div>
            )}
          </Step>

          <Step n={2} title={delivery === 'pickup' ? 'بيانات التواصل' : 'عنوان التوصيل'} icon={<MapPin />}>
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

          <Step n={3} title="الشحنات" icon={<Package />}>
            {single ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-50 p-3 text-sm">
                <span className="flex items-center gap-2 font-semibold"><Package className="h-4 w-4 text-brand-600" />طرد واحد يضم كل منتجاتك ({c.count})</span>
                <span className="text-ink-soft">الوصول خلال {etaMin}–{etaMax + 1} أيام · <b className="text-ink">{c.totals.shipping > 0 ? formatPrice(c.totals.shipping) : 'مجاني'}</b></span>
              </div>
            ) : (
              <>
                {c.stores.length > 1 && (
                  <div className="mb-3 flex gap-2 rounded-xl bg-sky-50 p-3 text-xs leading-5 text-sky-800">
                    <Info className="h-4 w-4 shrink-0" /> طلبك يصل في {c.stores.length} شحنات، وقد تصل كل شحنة في وقت مختلف.
                  </div>
                )}
                <div className="space-y-2">
                  {c.stores.map((s, i) => (
                    <div key={s.store_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm">
                      <span className="flex items-center gap-2 font-semibold"><Package className="h-4 w-4 text-brand-600" />الشحنة {i + 1} <span className="text-xs font-normal text-ink-muted">({s.item_count} منتج)</span></span>
                      <span className="text-ink-soft">الوصول خلال {s.eta_min}–{s.eta_max} أيام · <b className="text-ink">{s.shipping > 0 ? formatPrice(s.shipping) : 'مجاني'}</b></span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Step>

          <Step n={4} title="طريقة الدفع" icon={<Wallet />}>
            <div className="grid gap-3 sm:grid-cols-2">
              {methods.map((m) => (
                <Choice key={m.key} active={payment === m.key} onClick={() => setPayment(m.key)}
                  icon={m.key === 'cod' ? <Banknote /> : <Wallet />} title={m.label}
                  text={m.key === 'cod' ? 'ادفع نقدًا عند الاستلام' : 'حوّل المبلغ ثم أرسل الإشعار عبر واتساب'} />
              ))}
            </div>
            {payment !== 'cod' && (
              <div className="mt-3 flex gap-2 rounded-xl bg-emerald-50 p-3 text-xs leading-6 text-emerald-900">
                <MessageCircle className="h-4 w-4 shrink-0" />
                <span>بعد تأكيد الطلب ستظهر لك رسالة واتساب جاهزة فيها رقم طلبك والمبلغ. حوّل المبلغ{selected?.account ? <> إلى <b dir="ltr">{selected.account}</b></> : ''} وأرسل صورة الإشعار. يبدأ التجهيز بعد تأكيد الدفع.</span>
              </div>
            )}
            {pts && settings.loyalty.enabled && pts.balance > 0 && (
              <label className={cn('mt-3 flex cursor-pointer items-center gap-3 rounded-xl p-3 text-sm ring-1', usePoints ? 'bg-amber-50 ring-amber-300' : 'bg-white ring-slate-200')}>
                <input type="checkbox" className="h-4 w-4 accent-amber-500" checked={usePoints} onChange={(e) => setUsePoints(e.target.checked)} disabled={!usePoints && pts.max < pts.min} />
                <Coins className="h-5 w-5 text-amber-500" />
                <span className="flex-1">
                  استخدم نقاطي <span className="text-ink-muted">(رصيدك {formatNumber(pts.balance)} نقطة)</span>
                  {usePoints && pts.used > 0 && <b className="block text-emerald-700">خصم {formatPrice(pts.discount)} مقابل {formatNumber(pts.used)} نقطة</b>}
                  {pts.max < pts.min && <span className="block text-xs text-ink-muted">الحد الأدنى للاستبدال {formatNumber(pts.min)} نقطة</span>}
                </span>
              </label>
            )}
            <Textarea className="mt-3" placeholder="ملاحظات للطلب (اختياري)" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Step>
        </div>

        <div className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:h-fit">
          <div className="card p-5"><CouponInput value={coupon} message={c.coupon?.message} valid={c.coupon?.valid} onApply={setCoupon} /></div>
          <OrderSummary cart={c}>
            {currency !== 'YER' && <p className="text-center text-xs text-ink-muted">≈ <Money value={c.totals.grand_total} /> · الدفع بالريال اليمني أو ما يعادله</p>}
            {c.has_issues && <p className="rounded-xl bg-red-50 p-3 text-xs text-red-700">بعض المنتجات غير متاحة. <Link href="/cart" className="font-bold underline">راجع السلة</Link></p>}
            <Button className="w-full" size="lg" variant="accent" loading={placing}
              disabled={c.has_issues || !addressId || (!!coupon && !c.coupon?.valid) || (delivery === 'pickup' && !pickupId)} onClick={submit}>
              {payment === 'cod' ? 'تأكيد الطلب' : 'تأكيد والدفع عبر واتساب'} · {formatPrice(c.totals.grand_total)}
            </Button>
            <p className="text-center text-[11px] text-ink-muted">بالضغط على تأكيد الطلب فأنت توافق على <Link href="/terms" className="underline">شروط الاستخدام</Link> و<Link href="/returns-policy" className="underline">سياسة الإرجاع</Link>.</p>
          </OrderSummary>
        </div>
      </div>

      <Modal open={adding} onClose={() => setAdding(false)} title="إضافة عنوان" wide>
        <AddressForm onSaved={(id) => { setAdding(false); addresses.reload().then(() => setAddressId(id)); }} />
      </Modal>
    </div>
  );
}

function Choice({ active, onClick, icon, title, text }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; text: string }) {
  return (
    <button onClick={onClick} className={cn('relative flex items-start gap-3 rounded-2xl p-4 text-right ring-2 transition', active ? 'bg-brand-50 ring-brand-500' : 'bg-white ring-slate-200 hover:ring-brand-300')}>
      <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl [&>svg]:h-5 [&>svg]:w-5', active ? 'bg-brand-500 text-white' : 'bg-slate-100 text-ink-soft')}>{icon}</span>
      <span className="min-w-0"><b className="block">{title}</b><span className="text-xs text-ink-soft">{text}</span></span>
      {active && <CheckCircle2 className="absolute left-3 top-3 h-5 w-5 text-brand-600" />}
    </button>
  );
}

function Step({ n, title, icon, children }: { n: number; title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card p-4 md:p-5">
      <h2 className="mb-4 flex items-center gap-3 text-lg font-bold">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-sm text-white shadow-glow">{n}</span>
        <span className="flex items-center gap-2 [&>svg]:h-5 [&>svg]:w-5 [&>svg]:text-brand-600">{icon}{title}</span>
      </h2>
      {children}
    </section>
  );
}

export default function CheckoutPage() { return <Suspense><Checkout /></Suspense>; }
