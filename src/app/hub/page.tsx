'use client';
import { useState } from 'react';
import { Boxes, KeyRound, PackageCheck, RefreshCw, ScanLine, Send, Store } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { timeAgo } from '@/lib/format';
import { BATCH_STATUS, FULFILLMENT_LABEL, SUB_STATUS } from '@/lib/status';
import { errorMessage } from '@/lib/utils';
import { Tabs } from '@/components/dashboard/widgets';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { Modal, Skeleton } from '@/components/ui/misc';
import { StatusBadge, Badge } from '@/components/ui/badge';

type Q = {
  incoming: { batch_no: string; status: string; store: string; subs: number; at: string }[];
  to_pack: { id: string; order_no: string; fulfillment: string; total_subs: number; at_hub: number; subs: { sub_no: string; status: string }[]; created_at: string }[];
  to_dispatch: { id: string; order_no: string; box_code: string; fulfillment: string; city: string; pickup: string | null }[];
  pickup_ready: { id: string; order_no: string; box_code: string; name: string; pickup: string | null }[];
  couriers: { id: string; name: string | null; phone: string | null }[];
};

export default function HubApp() {
  const sb = getSupabase();
  const [tab, setTab] = useState('incoming');
  const [scan, setScan] = useState('');
  const [dispatch, setDispatch] = useState<Q['to_dispatch'][number] | null>(null);
  const [courier, setCourier] = useState('');
  const [handover, setHandover] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: q, loading, reload } = useQuery(async () => {
    const { data, error } = await sb.rpc('hub_queue');
    if (error) throw error;
    return data as Q;
  });

  async function rpc(fn: string, args: Record<string, unknown>, ok: (d: never) => string) {
    setBusy(true);
    const { data, error } = await sb.rpc(fn, args);
    setBusy(false);
    if (error) { toast.error(errorMessage(error)); return false; }
    if (data && typeof data === 'object' && 'ok' in data && !data.ok) { toast.error(data.message); return false; }
    toast.success(ok(data as never)); reload(); return true;
  }

  if (loading && !q) return <Skeleton className="h-96" />;
  if (!q) return null;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-2xl bg-white p-4 shadow-soft">
        <div className="flex-1"><label className="label">استلام دفعة بالرقم (أو المسح)</label>
          <Input dir="ltr" placeholder="BAT-ST1-10001" value={scan} onChange={(e) => setScan(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && scan && rpc('hub_receive_batch', { p_batch_no: scan }, (d: { subs: number }) => `استُلمت ${d.subs} شحنة`).then((ok) => ok && setScan(''))} /></div>
        <Button loading={busy} disabled={!scan} onClick={() => rpc('hub_receive_batch', { p_batch_no: scan }, (d: { subs: number }) => `استُلمت ${d.subs} شحنة`).then((ok) => ok && setScan(''))}><ScanLine className="h-4 w-4" /> استلام</Button>
        <Button variant="ghost" size="icon" onClick={reload} aria-label="تحديث"><RefreshCw className="h-4 w-4" /></Button>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { v: 'incoming', l: 'دفعات واردة', n: q.incoming.length }, { v: 'pack', l: 'للتغليف', n: q.to_pack.length },
        { v: 'dispatch', l: 'للإرسال', n: q.to_dispatch.length }, { v: 'pickup', l: 'في نقاط الاستلام', n: q.pickup_ready.length },
      ]} />

      {tab === 'incoming' && <Grid empty={!q.incoming.length}>{q.incoming.map((b) => (
        <div key={b.batch_no} className="card p-4">
          <div className="flex items-center justify-between"><b dir="ltr">{b.batch_no}</b><StatusBadge map={BATCH_STATUS} value={b.status} /></div>
          <p className="mt-1 text-sm"><Store className="ml-1 inline h-4 w-4 text-brand-600" />{b.store} · {b.subs} شحنة</p>
          <p className="text-xs text-ink-muted">{timeAgo(b.at)}</p>
          <Button size="sm" className="mt-3 w-full" loading={busy} onClick={() => rpc('hub_receive_batch', { p_batch_no: b.batch_no }, (d: { subs: number }) => `استُلمت ${d.subs} شحنة`)}>تأكيد الوصول للمركز</Button>
        </div>
      ))}</Grid>}

      {tab === 'pack' && <Grid empty={!q.to_pack.length}>{q.to_pack.map((o) => (
        <div key={o.id} className="card p-4">
          <div className="flex items-center justify-between"><b dir="ltr">{o.order_no}</b><Badge tone={o.at_hub === o.total_subs ? 'green' : 'orange'}>{o.at_hub}/{o.total_subs} وصلت</Badge></div>
          <p className="text-xs text-ink-muted">{FULFILLMENT_LABEL[o.fulfillment]}</p>
          <ul className="mt-2 space-y-1 text-xs">{o.subs.map((s) => <li key={s.sub_no} className="flex justify-between"><span dir="ltr">{s.sub_no}</span><StatusBadge map={SUB_STATUS} value={s.status} /></li>)}</ul>
          <Button size="sm" className="mt-3 w-full" loading={busy} onClick={() => rpc('hub_pack_order', { p_order: o.id }, (d: { box_code: string }) => `رقم الطرد ${d.box_code}`)}><PackageCheck className="h-4 w-4" /> تغليف الطرد</Button>
        </div>
      ))}</Grid>}

      {tab === 'dispatch' && <Grid empty={!q.to_dispatch.length}>{q.to_dispatch.map((o) => (
        <div key={o.id} className="card p-4">
          <b dir="ltr">{o.order_no}</b><p className="text-sm font-semibold text-brand-700" dir="ltr">{o.box_code}</p>
          <p className="text-xs text-ink-muted">{o.fulfillment === 'pickup' ? `نقطة الاستلام: ${o.pickup}` : `التوصيل إلى ${o.city}`}</p>
          <Button size="sm" className="mt-3 w-full" onClick={() => { setCourier(''); setDispatch(o); }}><Send className="h-4 w-4" /> {o.fulfillment === 'pickup' ? 'إرسال لنقطة الاستلام' : 'إسناد لمندوب'}</Button>
        </div>
      ))}</Grid>}

      {tab === 'pickup' && <Grid empty={!q.pickup_ready.length}>{q.pickup_ready.map((o) => (
        <div key={o.id} className="card p-4">
          <b dir="ltr">{o.order_no}</b><p className="text-sm" dir="ltr">{o.box_code}</p><p className="text-xs text-ink-muted">{o.name} · {o.pickup}</p>
          <Button size="sm" variant="accent" className="mt-3 w-full" onClick={() => { setCode(''); setHandover(o.id); }}><KeyRound className="h-4 w-4" /> تسليم للعميل برمزه</Button>
        </div>
      ))}</Grid>}

      <Modal open={!!dispatch} onClose={() => setDispatch(null)} title={`إرسال ${dispatch?.box_code ?? ''}`}>
        {dispatch?.fulfillment !== 'pickup' && (
          <Select value={courier} onChange={(e) => setCourier(e.target.value)}>
            <option value="">اختر المندوب</option>{q.couriers.map((c) => <option key={c.id} value={c.id}>{c.name ?? c.phone}</option>)}
          </Select>
        )}
        <p className="mt-3 text-xs text-ink-muted">سيصل العميل إشعار برمز التسليم (داخل التطبيق وواتساب عند تفعيله).</p>
        <Button className="mt-4 w-full" loading={busy} disabled={dispatch?.fulfillment !== 'pickup' && !courier}
          onClick={async () => { if (dispatch && await rpc('hub_dispatch_order', { p_order: dispatch.id, p_courier: courier || null }, () => 'تم الإرسال')) setDispatch(null); }}>تأكيد</Button>
      </Modal>
      <Modal open={!!handover} onClose={() => setHandover(null)} title="تسليم من نقطة الاستلام">
        <Input dir="ltr" inputMode="numeric" maxLength={4} className="text-center text-2xl tracking-[.5em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        <Button className="mt-4 w-full" loading={busy} disabled={code.length !== 4} onClick={async () => { if (await rpc('confirm_order_delivery', { p_order: handover, p_otp: code }, () => 'تم التسليم ✓')) setHandover(null); }}>تأكيد</Button>
      </Modal>
    </div>
  );
}

function Grid({ children, empty }: { children: React.ReactNode; empty: boolean }) {
  if (empty) return <p className="flex flex-col items-center gap-2 py-12 text-sm text-ink-muted"><Boxes className="h-8 w-8" /> لا توجد عناصر</p>;
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}
