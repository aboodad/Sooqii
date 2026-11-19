'use client';
import { Banknote, CheckCircle2, Clock, Percent } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { useMerchant } from '@/hooks/use-merchant';
import { useQuery } from '@/hooks/use-query';
import { formatDate, formatPrice } from '@/lib/format';
import { SETTLEMENT_STATUS } from '@/lib/status';
import { PageHeader } from '@/components/dashboard/shell';
import { StatCard, Table, Td } from '@/components/dashboard/widgets';
import { StatusBadge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/misc';
import { Statement } from './statement';

export default function Finance() {
  const sb = getSupabase();
  const { store, can } = useMerchant();
  const { data, loading } = useQuery(async () => {
    if (!store) return null;
    const [subs, sets] = await Promise.all([
      sb.from('sub_orders').select('id,sub_no,subtotal,store_coupon_discount,commission_amount,merchant_net,delivered_at,settlement_id').eq('store_id', store.id).eq('status', 'delivered').order('delivered_at', { ascending: false }),
      sb.from('settlements').select('*').eq('store_id', store.id).order('created_at', { ascending: false }),
    ]);
    return { subs: subs.data ?? [], sets: sets.data ?? [] };
  }, [store?.id]);
  if (!can('finance')) return <p className="card p-6 text-ink-soft">لا تملك صلاحية عرض البيانات المالية.</p>;
  if (loading || !data) return <Skeleton className="h-96" />;
  const unsettled = data.subs.filter((s) => !s.settlement_id);
  const sum = (k: 'merchant_net' | 'commission_amount') => unsettled.reduce((t, s) => t + Number(s[k]), 0);
  const paid = data.sets.filter((s) => s.status === 'paid').reduce((t, s) => t + Number(s.net), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="التسويات والمدفوعات" subtitle="المستحق = قيمة المنتجات بعد خصمك وكوبونك − العمولة. يتأهل للتسوية بعد التسليم وانتهاء مهلة الإرجاع." />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard index={0} label="مستحق غير مُسوّى" value={formatPrice(sum('merchant_net'))} icon={<Clock />} color="#F97316" hint={`${unsettled.length} طلب مُسلّم`} />
        <StatCard index={1} label="عمولة المنصة (غير مسوّاة)" value={formatPrice(sum('commission_amount'))} icon={<Percent />} color="#8B5CF6" />
        <StatCard index={2} label="إجمالي المحوَّل" value={formatPrice(paid)} icon={<CheckCircle2 />} color="#22C55E" />
      </div>
      <div>
        <h2 className="mb-3 text-lg font-bold">دفعات التسوية</h2>
        <Table head={['التاريخ', 'الإجمالي', 'العمولة', 'الصافي', 'الحالة', 'المرجع البنكي']} empty={!data.sets.length}>
          {data.sets.map((s) => (
            <tr key={s.id}><Td>{formatDate(s.created_at)}</Td><Td>{formatPrice(s.gross)}</Td><Td>{formatPrice(s.commission)}</Td><Td className="font-bold">{formatPrice(s.net)}</Td><Td><StatusBadge map={SETTLEMENT_STATUS} value={s.status} /></Td><Td dir="ltr">{s.bank_ref ?? '—'}</Td></tr>
          ))}
        </Table>
      </div>
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><Banknote className="h-5 w-5 text-brand-600" /> الطلبات المسلّمة</h2>
        <Table head={['الطلب', 'تاريخ التسليم', 'المبيعات', 'العمولة', 'الصافي', 'التسوية']} empty={!data.subs.length}>
          {data.subs.map((s) => (
            <tr key={s.id}><Td dir="ltr">{s.sub_no}</Td><Td className="text-xs">{s.delivered_at ? formatDate(s.delivered_at) : '—'}</Td><Td>{formatPrice(Number(s.subtotal) - Number(s.store_coupon_discount))}</Td><Td>{formatPrice(s.commission_amount)}</Td><Td className="font-bold">{formatPrice(s.merchant_net)}</Td><Td>{s.settlement_id ? 'مُدرج' : 'بانتظار'}</Td></tr>
          ))}
        </Table>
      </div>
      {store && <Statement storeId={store.id} />}
    </div>
  );
}
