'use client';
import { useState } from 'react';
import { Banknote, Boxes, KeyRound, MapPin, Package, Phone, RefreshCw, Store } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { formatPrice, timeAgo } from '@/lib/format';
import { SUB_STATUS } from '@/lib/status';
import { errorMessage } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/field';
import { Modal, Skeleton } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/badge';
import { Tabs } from '@/components/dashboard/widgets';

type Tasks = {
  batches: { batch_no: string; store: string; store_phone: string | null; subs: number; closed_at: string; location: string | null }[];
  orders: { id: string; order_no: string; box_code: string | null; name: string; phone: string; address: string; cod: number }[];
  subs: { id: string; sub_no: string; status: string; store: string; store_phone: string | null; name: string; phone: string; address: string; cod: number }[];
  cash: { collected: number; remitted: number };
};

export default function CourierApp() {
  const sb = getSupabase();
  const [tab, setTab] = useState('deliver');
  const [pickup, setPickup] = useState<string | null>(null);
  const [otpFor, setOtpFor] = useState<{ kind: 'order' | 'sub'; id: string; cod: number } | null>(null);
  const [fail, setFail] = useState<string | null>(null);
  const [code, setCode] = useState(''); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false);
  const { data: t, loading, reload } = useQuery(async () => {
    const { data, error } = await sb.rpc('courier_tasks');
    if (error) throw error;
    return data as Tasks;
  });

  async function rpc(fn: string, args: Record<string, unknown>, ok: string) {
    setBusy(true);
    const { data, error } = await sb.rpc(fn, args);
    setBusy(false);
    if (error) { toast.error(errorMessage(error)); return false; }
    if (data && typeof data === 'object' && 'ok' in data && !data.ok) { toast.error(data.message); return false; }
    toast.success(ok); reload(); return true;
  }

  if (loading && !t) return <Skeleton className="h-96" />;
  if (!t) return null;
  const due = Number(t.cash.collected) - Number(t.cash.remitted);
  const deliverCount = t.orders.length + t.subs.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-soft">
        <Banknote className="h-8 w-8 text-emerald-600" />
        <div className="flex-1"><p className="text-xs text-ink-muted">نقد بحوزتك للتوريد</p><p className="text-xl font-extrabold">{formatPrice(due)}</p></div>
        <Button size="icon" variant="ghost" onClick={reload} aria-label="تحديث"><RefreshCw className="h-5 w-5" /></Button>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ v: 'deliver', l: 'للتسليم', n: deliverCount }, { v: 'pickup', l: 'استلام من المتاجر', n: t.batches.length }]} />

      {tab === 'pickup' && (t.batches.length ? t.batches.map((b) => (
        <div key={b.batch_no} className="rounded-2xl bg-white p-4 shadow-soft">
          <div className="flex items-center justify-between"><b dir="ltr">{b.batch_no}</b><span className="text-xs text-ink-muted">{timeAgo(b.closed_at)}</span></div>
          <p className="mt-1 flex items-center gap-1.5 text-sm"><Store className="h-4 w-4 text-brand-600" /> {b.store}</p>
          {b.store_phone && <a href={`tel:${b.store_phone}`} className="mt-1 flex items-center gap-1.5 text-sm text-brand-600" dir="ltr"><Phone className="h-4 w-4" />{b.store_phone}</a>}
          <p className="mt-1 text-xs text-ink-muted"><Boxes className="ml-1 inline h-3.5 w-3.5" />{b.subs} شحنة{b.location ? ` · إلى ${b.location}` : ''}</p>
          <Button className="mt-3 w-full" onClick={() => { setCode(''); setPickup(b.batch_no); }}><KeyRound className="h-4 w-4" /> استلام بالرمز</Button>
        </div>
      )) : <p className="py-10 text-center text-sm text-ink-muted">لا توجد دفعات جاهزة للاستلام</p>)}

      {tab === 'deliver' && (deliverCount ? (
        <>
          {t.orders.map((o) => (
            <Card key={o.id} title={o.order_no} sub={o.box_code ?? ''} name={o.name} phone={o.phone} address={o.address} cod={o.cod}>
              <Button className="w-full" variant="accent" onClick={() => { setCode(''); setOtpFor({ kind: 'order', id: o.id, cod: o.cod }); }}>تأكيد التسليم برمز العميل</Button>
            </Card>
          ))}
          {t.subs.map((s) => (
            <Card key={s.id} title={s.sub_no} sub={s.store} name={s.name} phone={s.phone} address={s.address} cod={s.cod} badge={<StatusBadge map={SUB_STATUS} value={s.status} />}>
              <div className="grid grid-cols-2 gap-2">
                {s.status === 'ready' && <Button className="col-span-2" onClick={() => rpc('courier_update_sub', { p_sub: s.id, p_to: 'handed_over' }, 'تم الاستلام من المتجر')}>استلمت من المتجر</Button>}
                {['handed_over', 'delivery_failed'].includes(s.status) && <Button className="col-span-2" onClick={() => rpc('courier_update_sub', { p_sub: s.id, p_to: 'in_transit' }, 'في الطريق')}>بدء التوصيل</Button>}
                {s.status === 'in_transit' && <>
                  <Button variant="accent" onClick={() => { setCode(''); setOtpFor({ kind: 'sub', id: s.id, cod: s.cod }); }}>تسليم برمز</Button>
                  <Button variant="outline" onClick={() => { setReason(''); setFail(s.id); }}>تعذّر</Button>
                </>}
              </div>
            </Card>
          ))}
        </>
      ) : <p className="py-10 text-center text-sm text-ink-muted">لا توجد طلبات مسندة إليك</p>)}

      <Modal open={!!pickup} onClose={() => setPickup(null)} title={`استلام ${pickup ?? ''}`}>
        <p className="mb-3 text-sm text-ink-soft">اطلب من التاجر رمز الاستلام المكوّن من 4 أرقام.</p>
        <Input dir="ltr" inputMode="numeric" maxLength={4} className="text-center text-2xl tracking-[.5em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        <Button className="mt-4 w-full" loading={busy} disabled={code.length !== 4} onClick={async () => { if (await rpc('courier_pickup_batch', { p_batch_no: pickup, p_code: code }, 'تم استلام الدفعة')) setPickup(null); }}>تأكيد</Button>
      </Modal>
      <Modal open={!!otpFor} onClose={() => setOtpFor(null)} title="تأكيد التسليم">
        {otpFor && otpFor.cod > 0 && <p className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">حصّل من العميل: <b>{formatPrice(otpFor.cod)}</b></p>}
        <p className="mb-3 text-sm text-ink-soft">أدخل رمز التسليم الذي يظهر لدى العميل.</p>
        <Input dir="ltr" inputMode="numeric" maxLength={4} className="text-center text-2xl tracking-[.5em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        <Button className="mt-4 w-full" loading={busy} disabled={code.length !== 4} onClick={async () => {
          if (!otpFor) return;
          const ok = otpFor.kind === 'order' ? await rpc('confirm_order_delivery', { p_order: otpFor.id, p_otp: code }, 'تم التسليم ✓') : await rpc('confirm_delivery', { p_sub: otpFor.id, p_otp: code }, 'تم التسليم ✓');
          if (ok) setOtpFor(null);
        }}>تأكيد التسليم</Button>
      </Modal>
      <Modal open={!!fail} onClose={() => setFail(null)} title="تعذّر التسليم">
        <Textarea placeholder="السبب (العميل لا يرد، العنوان غير صحيح…)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        <Button className="mt-4 w-full" variant="danger" loading={busy} disabled={reason.trim().length < 3} onClick={async () => { if (await rpc('courier_update_sub', { p_sub: fail, p_to: 'delivery_failed', p_reason: reason }, 'سُجّل التعذّر')) setFail(null); }}>تأكيد</Button>
      </Modal>
    </div>
  );
}

function Card({ title, sub, name, phone, address, cod, badge, children }: { title: string; sub: string; name: string; phone: string; address: string; cod: number; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-soft">
      <div className="flex items-center justify-between gap-2"><b dir="ltr">{title}</b>{badge}</div>
      {sub && <p className="text-xs text-ink-muted" dir="auto"><Package className="ml-1 inline h-3.5 w-3.5" />{sub}</p>}
      <p className="mt-2 font-semibold">{name}</p>
      <a href={`tel:${phone}`} className="flex items-center gap-1.5 text-sm text-brand-600" dir="ltr"><Phone className="h-4 w-4" />{phone}</a>
      <p className="mt-1 flex gap-1.5 text-sm text-ink-soft"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{address}</p>
      {cod > 0 && <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-1.5 text-sm text-emerald-800">تحصيل نقدي: <b>{formatPrice(cod)}</b></p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}
