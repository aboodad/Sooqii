'use client';
import { MapPin, Phone, StickyNote } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { formatDate, formatPrice } from '@/lib/format';
import { SUB_STATUS } from '@/lib/status';
import { StatusBadge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/misc';
import { StatusActions } from './status-actions';

type Detail = {
  sub: { id: string; sub_no: string; status: string; subtotal: number; shipping_fee: number; total: number; store_coupon_discount: number; platform_coupon_discount: number; commission_amount?: number; merchant_net?: number; cancel_reason: string | null };
  order: { order_no: string; notes: string | null; created_at: string; ship_to: Record<string, string> };
  store: { name: string };
  items: { id: string; product_name: string; variant_name: string | null; image_url: string | null; qty: number; unit_price: number; merchant_discount_unit: number; line_total: number }[];
  history: { from: string | null; to: string; reason: string | null; at: string }[] | null;
};

export function SubOrderDetail({ id, mode }: { id: string; mode: 'merchant' | 'ops' }) {
  const { data: d, loading, reload } = useQuery(async () => {
    const { data, error } = await getSupabase().rpc('merchant_sub_order', { p_sub: id });
    if (error) throw error;
    return data as Detail;
  }, [id]);
  if (loading || !d) return <Skeleton className="h-96" />;
  const a = d.order.ship_to;
  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center gap-3 p-5">
        <div className="flex-1"><h1 className="text-2xl font-extrabold" dir="ltr">{d.sub.sub_no}</h1><p className="text-sm text-ink-muted">{d.store.name} · {formatDate(d.order.created_at)}</p></div>
        <StatusBadge map={SUB_STATUS} value={d.sub.status} />
        <StatusActions subId={d.sub.id} status={d.sub.status} mode={mode} onDone={reload} />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="divide-y divide-slate-100">
            {d.items.map((i) => (
              <div key={i.id} className="flex items-center gap-3 p-4">
                <div className="h-14 w-14 overflow-hidden rounded-xl bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {i.image_url && <img src={i.image_url} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="flex-1"><p className="font-semibold">{i.product_name}</p><p className="text-xs text-ink-muted">{i.variant_name ?? ''} × {i.qty} · {formatPrice(i.unit_price - i.merchant_discount_unit)} للقطعة</p></div>
                <b>{formatPrice((i.unit_price - i.merchant_discount_unit) * i.qty)}</b>
              </div>
            ))}
          </div>
          <div className="space-y-1 border-t border-slate-100 p-4 text-sm">
            <div className="flex justify-between"><span className="text-ink-soft">المجموع بعد خصم المتجر</span><b>{formatPrice(d.sub.subtotal)}</b></div>
            {d.sub.store_coupon_discount > 0 && <div className="flex justify-between"><span className="text-ink-soft">كوبون المتجر</span><b>- {formatPrice(d.sub.store_coupon_discount)}</b></div>}
            {d.sub.platform_coupon_discount > 0 && <div className="flex justify-between"><span className="text-ink-soft">كوبون المنصة (تتحمله المنصة)</span><b>- {formatPrice(d.sub.platform_coupon_discount)}</b></div>}
            {d.sub.commission_amount !== undefined && <div className="flex justify-between"><span className="text-ink-soft">عمولة المنصة</span><b>- {formatPrice(d.sub.commission_amount)}</b></div>}
            {d.sub.merchant_net !== undefined && <div className="flex justify-between border-t border-dashed pt-2 text-base"><span className="font-bold">صافي مستحقك</span><b className="text-brand-700">{formatPrice(d.sub.merchant_net)}</b></div>}
          </div>
        </div>
        <div className="space-y-5">
          <div className="card space-y-2 p-5 text-sm">
            <h3 className="mb-1 font-bold">بيانات التوصيل</h3>
            <p className="flex gap-2"><MapPin className="h-4 w-4 shrink-0 text-brand-600" />{[a.governorate, a.city, a.district, a.street, a.details].filter(Boolean).join('، ')}</p>
            <p className="flex gap-2"><Phone className="h-4 w-4 text-brand-600" />{a.recipient_name} · <span dir="ltr">{a.phone}</span></p>
            {d.order.notes && <p className="flex gap-2 rounded-xl bg-amber-50 p-2"><StickyNote className="h-4 w-4 text-amber-600" />{d.order.notes}</p>}
          </div>
          <div className="card p-5">
            <h3 className="mb-3 font-bold">سجل الحالات</h3>
            <ol className="relative space-y-3 border-r-2 border-slate-100 pr-4">
              {(d.history ?? []).map((h, k) => (
                <li key={k} className="relative">
                  <span className="absolute -right-[23px] top-1 h-3 w-3 rounded-full bg-brand-500 ring-4 ring-white" />
                  <p className="text-sm font-semibold">{SUB_STATUS[h.to]?.label ?? h.to}</p>
                  {h.reason && <p className="text-xs text-ink-soft">{h.reason}</p>}
                  <p className="text-xs text-ink-muted">{formatDate(h.at)}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
