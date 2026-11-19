'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { useMerchant } from '@/hooks/use-merchant';
import { useQuery } from '@/hooks/use-query';
import { formatPrice, timeAgo } from '@/lib/format';
import { SUB_STATUS } from '@/lib/status';
import { PageHeader } from '@/components/dashboard/shell';
import { Table, Td, Tabs } from '@/components/dashboard/widgets';
import { StatusBadge } from '@/components/ui/badge';
import { StatusActions } from '@/components/dashboard/status-actions';
import { Skeleton } from '@/components/ui/misc';

const GROUPS: Record<string, string[]> = {
  new: ['pending_merchant'], active: ['accepted', 'preparing', 'ready'],
  shipping: ['handed_over', 'at_hub', 'in_transit', 'delivery_failed'], done: ['delivered', 'returned', 'return_in_progress'], cancelled: ['cancelled'],
};

export default function MerchantOrders() {
  const sb = getSupabase();
  const { store } = useMerchant();
  const [tab, setTab] = useState('new');
  const { data, loading, reload } = useQuery(async () => {
    if (!store) return [];
    const { data } = await sb.from('sub_orders').select('id,sub_no,status,subtotal,created_at,batch_id,order_items(qty)').eq('store_id', store.id).order('created_at', { ascending: false }).limit(200);
    return data ?? [];
  }, [store?.id]);

  // تحديث لحظي عند وصول طلب جديد
  useEffect(() => {
    if (!store) return;
    const ch = sb.channel(`store-orders-${store.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sub_orders', filter: `store_id=eq.${store.id}` }, () => reload())
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [sb, store, reload]);

  const rows = (data ?? []).filter((r) => GROUPS[tab].includes(r.status));
  const count = (g: string) => (data ?? []).filter((r) => GROUPS[g].includes(r.status)).length;
  return (
    <div>
      <PageHeader title="الطلبات" subtitle="الطلبات الفرعية الواردة لمتجرك — تتحدث لحظيًا" />
      <Tabs value={tab} onChange={setTab} tabs={[
        { v: 'new', l: 'جديدة', n: count('new') }, { v: 'active', l: 'قيد التجهيز', n: count('active') },
        { v: 'shipping', l: 'في الشحن', n: count('shipping') }, { v: 'done', l: 'مكتملة', n: count('done') }, { v: 'cancelled', l: 'ملغاة', n: count('cancelled') },
      ]} />
      {loading ? <Skeleton className="h-64" /> : (
        <Table head={['رقم الطلب', 'الحالة', 'القطع', 'القيمة', 'الوقت', 'الإجراء']} empty={!rows.length}>
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50/60">
              <Td><Link href={`/merchant/orders/${r.id}`} className="font-bold text-brand-700 hover:underline" dir="ltr">{r.sub_no}</Link></Td>
              <Td><StatusBadge map={SUB_STATUS} value={r.status} /></Td>
              <Td>{(r.order_items as { qty: number }[]).reduce((s, i) => s + i.qty, 0)}</Td>
              <Td className="font-semibold">{formatPrice(r.subtotal)}</Td>
              <Td className="text-ink-muted">{timeAgo(r.created_at)}</Td>
              <Td>{r.batch_id && r.status === 'ready' ? <Link href="/merchant/batches" className="text-xs font-bold text-brand-600">في دفعة التجهيز ←</Link>
                : <StatusActions subId={r.id} status={r.status} mode="merchant" onDone={reload} direct={!r.batch_id} />}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
