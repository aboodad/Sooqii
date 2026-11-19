'use client';
import { useState } from 'react';
import { AlertTriangle, Eye, Percent, ShoppingCart, Star, Timer, TrendingUp, Wallet } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { useMerchant } from '@/hooks/use-merchant';
import { useQuery } from '@/hooks/use-query';
import { formatNumber, formatPrice } from '@/lib/format';
import { PageHeader } from '@/components/dashboard/shell';
import { BarChart, StatCard, Table, Td, Tabs } from '@/components/dashboard/widgets';
import { Skeleton } from '@/components/ui/misc';

type A = {
  daily: { day: string; orders: number; revenue: number }[];
  totals: { orders: number; cancelled: number; delivered: number; revenue: number; net: number; avg_order: number; avg_accept_minutes: number | null };
  top_products: { name: string; qty: number; revenue: number }[];
  views: number; low_stock: { product: string; variant: string; qty: number }[]; rating: { avg: number; count: number };
};

export default function Analytics() {
  const { store } = useMerchant();
  const [days, setDays] = useState('30');
  const { data: a, loading } = useQuery(async () => {
    if (!store) return null;
    const { data, error } = await getSupabase().rpc('merchant_analytics', { p_store: store.id, p_days: Number(days) });
    if (error) throw error;
    return data as A;
  }, [store?.id, days]);
  if (loading || !a) return <Skeleton className="h-96" />;
  const t = a.totals;
  const conv = a.views ? (t.orders / a.views) * 100 : 0;
  const cancelRate = t.orders + t.cancelled ? (t.cancelled / (t.orders + t.cancelled)) * 100 : 0;
  return (
    <div className="space-y-6">
      <PageHeader title="التحليلات" subtitle="أداء متجرك: المبيعات، التحويل، سرعة القبول، والمخزون المنخفض" />
      <Tabs value={days} onChange={setDays} tabs={[{ v: '7', l: '7 أيام' }, { v: '30', l: '30 يومًا' }, { v: '90', l: '90 يومًا' }]} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="المبيعات" value={formatPrice(t.revenue)} icon={<TrendingUp />} hint={`${t.orders} طلب`} />
        <StatCard label="صافي المستحق (المسلّم)" value={formatPrice(t.net)} icon={<Wallet />} color="#10B981" index={1} />
        <StatCard label="متوسط الطلب" value={formatPrice(t.avg_order)} icon={<ShoppingCart />} color="#6366F1" index={2} />
        <StatCard label="معدل التحويل" value={`${conv.toFixed(1)}%`} icon={<Eye />} color="#0EA5E9" hint={`${formatNumber(a.views)} مشاهدة`} index={3} />
        <StatCard label="متوسط وقت القبول" value={t.avg_accept_minutes != null ? `${t.avg_accept_minutes} د` : '—'} icon={<Timer />} color="#F59E0B" index={4} />
        <StatCard label="نسبة الإلغاء" value={`${cancelRate.toFixed(1)}%`} icon={<Percent />} color="#EF4444" index={5} />
        <StatCard label="التقييم" value={a.rating ? Number(a.rating.avg).toFixed(1) : '—'} icon={<Star />} color="#FBBF24" hint={`${a.rating?.count ?? 0} تقييم`} index={6} />
        <StatCard label="مخزون منخفض" value={a.low_stock.length} icon={<AlertTriangle />} color="#DC2626" index={7} />
      </div>
      {a.daily.length > 0 && <BarChart data={a.daily} valueKey="revenue" label="المبيعات اليومية" format={formatPrice} />}
      <div className="grid gap-6 lg:grid-cols-2">
        <div><h2 className="mb-3 font-bold">الأكثر مبيعًا</h2>
          <Table head={['المنتج', 'الكمية', 'الإيراد']} empty={!a.top_products.length}>
            {a.top_products.map((p) => <tr key={p.name}><Td>{p.name}</Td><Td>{p.qty}</Td><Td>{formatPrice(p.revenue)}</Td></tr>)}
          </Table></div>
        <div><h2 className="mb-3 font-bold">مخزون منخفض (3 قطع أو أقل)</h2>
          <Table head={['المنتج', 'المتغير', 'المتاح']} empty={!a.low_stock.length}>
            {a.low_stock.map((p, i) => <tr key={i}><Td>{p.product}</Td><Td>{p.variant}</Td><Td className={p.qty <= 0 ? 'font-bold text-red-600' : ''}>{p.qty}</Td></tr>)}
          </Table></div>
      </div>
    </div>
  );
}
