'use client';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useMerchant } from '@/hooks/use-merchant';
import { useQuery } from '@/hooks/use-query';
import { formatDate } from '@/lib/format';
import { RETURN_STATUS } from '@/lib/status';
import { errorMessage } from '@/lib/utils';
import { PageHeader } from '@/components/dashboard/shell';
import { Table, Td } from '@/components/dashboard/widgets';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';

export default function MerchantReturns() {
  const sb = getSupabase();
  const { store } = useMerchant();
  const { data, loading, reload } = useQuery(async () => {
    if (!store) return [];
    const { data } = await sb.from('returns').select('id,qty,reason,status,created_at, order_items(product_name), sub_orders!inner(sub_no,store_id)').eq('sub_orders.store_id', store.id).order('created_at', { ascending: false });
    return (data ?? []) as unknown as { id: string; qty: number; reason: string; status: string; created_at: string; order_items: { product_name: string }; sub_orders: { sub_no: string } }[];
  }, [store?.id]);

  async function decide(id: string, status: string) {
    const note = status === 'rejected' ? prompt('سبب الرفض') : null;
    if (status === 'rejected' && !note) return;
    const { error } = await sb.rpc('decide_return', { p_return: id, p_status: status, p_note: note });
    if (error) return toast.error(errorMessage(error));
    toast.success('تم التحديث'); reload();
  }
  return (
    <div>
      <PageHeader title="المرتجعات" subtitle="وافق أو ارفض، ثم أكّد استلام المنتج المرتجع ليعود للمخزون" />
      {loading ? <Skeleton className="h-48" /> : (
        <Table head={['المنتج', 'الطلب', 'الكمية', 'السبب', 'الحالة', 'التاريخ', 'الإجراء']} empty={!data?.length}>
          {data?.map((r) => (
            <tr key={r.id}>
              <Td className="font-semibold">{r.order_items.product_name}</Td><Td dir="ltr">{r.sub_orders.sub_no}</Td><Td>{r.qty}</Td>
              <Td className="max-w-[220px] text-ink-soft">{r.reason}</Td><Td><StatusBadge map={RETURN_STATUS} value={r.status} /></Td>
              <Td className="text-xs text-ink-muted">{formatDate(r.created_at)}</Td>
              <Td>
                <div className="flex gap-1">
                  {r.status === 'requested' && <><Button size="sm" onClick={() => decide(r.id, 'approved')}>موافقة</Button><Button size="sm" variant="danger" onClick={() => decide(r.id, 'rejected')}>رفض</Button></>}
                  {r.status === 'approved' && <Button size="sm" variant="soft" onClick={() => decide(r.id, 'received')}>تأكيد الاستلام</Button>}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
