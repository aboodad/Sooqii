'use client';
import Link from 'next/link';
import { Activity, AlertTriangle, BadgeDollarSign, Boxes, Clock, LifeBuoy, Megaphone, MessageCircleQuestion, PackageCheck, RotateCcw, Send, Truck, TrendingUp, XCircle } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { formatPrice, timeAgo } from '@/lib/format';
import { PageHeader } from '@/components/dashboard/shell';
import { StatCard, Table, Td } from '@/components/dashboard/widgets';
import { Skeleton } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';

type Ops = Record<string, number> & {
  late_list: { id: string; sub_no: string; store: string; phone: string | null; since: string }[];
  failed_list: { id: string; sub_no: string; reason: string | null; since: string }[];
};

export default function OpsRoom() {
  const { data: d, loading, reload } = useQuery(async () => {
    const { data, error } = await getSupabase().rpc('admin_ops');
    if (error) throw error;
    return data as Ops;
  });
  if (loading && !d) return <Skeleton className="h-96" />;
  if (!d) return null;
  const cards: [string, number | string, React.ReactNode, string, string?][] = [
    ['مبيعات اليوم', formatPrice(d.gmv_today), <TrendingUp key="a" />, '#079EA5', `${d.orders_today} طلب · 7 أيام: ${formatPrice(d.gmv_7d)}`],
    ['بانتظار تأكيد الدفع', d.pending_payments, <BadgeDollarSign key="b" />, '#FF7916'],
    ['متأخرة لدى التجار', d.sla_late, <Clock key="c" />, '#DC2626'],
    ['قيد التجهيز', d.preparing, <PackageCheck key="d" />, '#7C3AED'],
    ['جاهزة للاستلام', d.ready, <Boxes key="e" />, '#0EA5E9'],
    ['دفعات بانتظار المركز', d.batches_waiting, <Truck key="f" />, '#0891B2'],
    ['في المركز', d.at_hub, <Boxes key="g" />, '#6366F1'],
    ['في الطريق', d.out_for_delivery, <Send key="h" />, '#2563EB'],
    ['تعذّر التسليم', d.failed, <XCircle key="i" />, '#DC2626'],
    ['مرتجعات مفتوحة', d.returns, <RotateCcw key="j" />, '#F59E0B'],
    ['تذاكر مفتوحة', d.tickets, <LifeBuoy key="k" />, '#10B981'],
    ['أسئلة بلا إجابة +24س', d.questions, <MessageCircleQuestion key="l" />, '#64748B'],
    ['طلبات إعلان', d.ads, <Megaphone key="m" />, '#EC4899'],
    ['رسائل فشل إرسالها', d.outbox_failed, <AlertTriangle key="n" />, '#EF4444'],
  ];
  return (
    <div className="space-y-6">
      <PageHeader title="غرفة العمليات" subtitle="مؤشرات لحظية لما يحتاج تدخلًا الآن" actions={<Button variant="outline" onClick={reload}><Activity className="h-4 w-4" /> تحديث</Button>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([l, v, ic, c, h], i) => <StatCard key={l} label={l} value={v} icon={ic} color={c} hint={h} index={i} />)}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 font-bold">طلبات متأخرة القبول</h2>
          <Table head={['الطلب', 'المتجر', 'منذ', '']} empty={!d.late_list.length}>
            {d.late_list.map((r) => (
              <tr key={r.id}><Td dir="ltr" className="font-semibold">{r.sub_no}</Td><Td>{r.store}{r.phone && <span className="block text-xs text-ink-muted" dir="ltr">{r.phone}</span>}</Td><Td className="text-xs">{timeAgo(r.since)}</Td>
                <Td><Link href={`/admin/orders/${r.id}`} className="text-sm font-bold text-brand-600">فتح</Link></Td></tr>
            ))}
          </Table>
        </div>
        <div>
          <h2 className="mb-3 font-bold">تعذّر التسليم</h2>
          <Table head={['الطلب', 'السبب', 'منذ', '']} empty={!d.failed_list.length}>
            {d.failed_list.map((r) => (
              <tr key={r.id}><Td dir="ltr" className="font-semibold">{r.sub_no}</Td><Td className="text-xs">{r.reason ?? '—'}</Td><Td className="text-xs">{timeAgo(r.since)}</Td>
                <Td><Link href={`/admin/orders/${r.id}`} className="text-sm font-bold text-brand-600">فتح</Link></Td></tr>
            ))}
          </Table>
        </div>
      </div>
    </div>
  );
}
