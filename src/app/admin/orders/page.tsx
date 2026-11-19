'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { formatPrice, timeAgo } from '@/lib/format';
import { SUB_STATUS } from '@/lib/status';
import { PageHeader } from '@/components/dashboard/shell';
import { Table, Td, Tabs } from '@/components/dashboard/widgets';
import { StatusBadge } from '@/components/ui/badge';
import { StatusActions } from '@/components/dashboard/status-actions';
import { Skeleton } from '@/components/ui/misc';

const G: Record<string, string[] | null> = {
  all: null, payment: ['awaiting_payment'], merchant: ['pending_merchant', 'accepted', 'preparing'], ready: ['ready', 'handed_over', 'at_hub'],
  transit: ['in_transit', 'delivery_failed'], returns: ['return_in_progress', 'returned'], done: ['delivered'], cancelled: ['cancelled'],
};

export default function AdminOrders() {
  const sb = getSupabase();
  const [tab, setTab] = useState('merchant');
  const [q, setQ] = useState('');
  const { data, loading, reload } = useQuery(async () => {
    let query = sb.from('sub_orders').select('id,sub_no,status,total,created_at, stores(name), orders(order_no, address_snapshot, fulfillment)');
    if (G[tab]) query = query.in('status', G[tab]!);
    if (q.trim()) query = query.ilike('sub_no', `%${q.trim().replace(/[%_,()]/g, '')}%`);
    return ((await query.order('created_at', { ascending: false }).limit(200)).data ?? []) as unknown as { id: string; sub_no: string; status: string; total: number; created_at: string; stores: { name: string }; orders: { order_no: string; address_snapshot: Record<string, string>; fulfillment: string } }[];
  }, [tab, q]);

  return (
    <div>
      <PageHeader title="الطلبات والعمليات" subtitle="تتبّع كل الطلبات الفرعية، الشحن، تأكيد التسليم برمز OTP، والاستثناءات" />
      <div className="relative mb-4 max-w-xs"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" /><input className="input pr-9" dir="ltr" placeholder="SUB-ST1-10001" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { v: 'payment', l: 'بانتظار الدفع' }, { v: 'merchant', l: 'لدى المتاجر' }, { v: 'ready', l: 'جاهزة للشحن' }, { v: 'transit', l: 'في التوصيل' },
        { v: 'done', l: 'مسلّمة' }, { v: 'returns', l: 'مرتجعة' }, { v: 'cancelled', l: 'ملغاة' }, { v: 'all', l: 'الكل' },
      ]} />
      {loading ? <Skeleton className="h-64" /> : (
        <Table head={['الطلب', 'المتجر', 'المدينة', 'الحالة', 'الإجمالي', 'منذ', 'الإجراءات']} empty={!data?.length}>
          {data?.map((r) => (
            <tr key={r.id}>
              <Td><Link href={`/admin/orders/${r.id}`} className="font-bold text-brand-700 hover:underline" dir="ltr">{r.sub_no}</Link></Td>
              <Td>{r.stores?.name}</Td><Td className="text-xs">{r.orders?.address_snapshot?.governorate} — {r.orders?.address_snapshot?.city}</Td>
              <Td><StatusBadge map={SUB_STATUS} value={r.status} /></Td><Td className="font-semibold">{formatPrice(r.total)}</Td>
              <Td className="text-xs text-ink-muted">{timeAgo(r.created_at)}</Td>
              <Td><StatusActions subId={r.id} status={r.status} mode="ops" onDone={reload} direct={r.orders?.fulfillment === 'direct'} /></Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
