'use client';
import Link from 'next/link';
import { AlertTriangle, Banknote, Clock, Package, ShoppingCart, Star, TrendingUp, Plus } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { useMerchant } from '@/hooks/use-merchant';
import { useQuery } from '@/hooks/use-query';
import { formatPrice, timeAgo } from '@/lib/format';
import { SUB_STATUS } from '@/lib/status';
import { PageHeader } from '@/components/dashboard/shell';
import { BarChart, StatCard } from '@/components/dashboard/widgets';
import { StatusBadge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';

type Dash = {
  store: { name: string; rating: number; rating_count: number; commission_rate: number; rejection_reason: string | null };
  today_sales: number | null; month_sales: number | null; pending_orders: number; new_orders: number; unsettled_net: number | null;
  products: { total: number; active: number; out: number }; pending_review: number;
  low_stock: { offer_id: string; name: string; variant: string; available: number }[];
  series: { day: string; total: number }[] | null;
  recent: { id: string; sub_no: string; status: string; subtotal: number; created_at: string }[];
};

export default function MerchantHome() {
  const { store } = useMerchant();
  const { data: d, loading } = useQuery(async () => {
    if (!store) return null;
    const { data, error } = await getSupabase().rpc('merchant_dashboard', { p_store: store.id });
    if (error) throw error;
    return data as Dash;
  }, [store?.id]);
  if (loading || !d) return <div className="grid gap-4 md:grid-cols-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader title={`مرحبًا، ${d.store.name}`} subtitle="ملخص أداء متجرك اليوم" actions={<Link href="/merchant/products/new"><Button><Plus className="h-4 w-4" /> منتج جديد</Button></Link>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} label="مبيعات اليوم" value={d.today_sales !== null ? formatPrice(d.today_sales) : '—'} icon={<TrendingUp />} color="#0EA5A8" hint={d.month_sales !== null ? `هذا الشهر: ${formatPrice(d.month_sales)}` : undefined} />
        <StatCard index={1} label="طلبات تنتظر التجهيز" value={d.pending_orders} icon={<ShoppingCart />} color="#F97316" hint={`${d.new_orders} جديدة`} />
        <StatCard index={2} label="رصيد غير مُسوّى" value={d.unsettled_net !== null ? formatPrice(d.unsettled_net) : '—'} icon={<Banknote />} color="#8B5CF6" hint={`العمولة ${d.store.commission_rate}%`} />
        <StatCard index={3} label="المنتجات النشطة" value={`${d.products.active} / ${d.products.total}`} icon={<Package />} color="#0B7C7E" hint={d.pending_review ? `${d.pending_review} قيد المراجعة` : `${d.products.out} نفدت`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">{d.series ? <BarChart data={d.series} valueKey="total" label="المبيعات اليومية" format={formatPrice} /> : <div className="card p-6 text-sm text-ink-muted">لا تملك صلاحية عرض الأرقام المالية.</div>}</div>
        <div className="card p-5">
          <h3 className="mb-3 flex items-center gap-2 font-bold"><AlertTriangle className="h-5 w-5 text-orange-500" /> قاربت على النفاد</h3>
          {d.low_stock.length ? (
            <ul className="space-y-2">{d.low_stock.map((l) => (
              <li key={l.offer_id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                <span className="line-clamp-1">{l.name}</span><span className={l.available === 0 ? 'font-bold text-red-600' : 'font-bold text-orange-600'}>{l.available}</span>
              </li>))}
            </ul>
          ) : <p className="text-sm text-ink-muted">المخزون بحالة جيدة 👌</p>}
          <Link href="/merchant/inventory" className="mt-3 block text-sm font-semibold text-brand-600">إدارة المخزون ←</Link>
        </div>
      </div>
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between"><h3 className="font-bold">أحدث الطلبات</h3><span className="flex items-center gap-1 text-sm text-ink-muted"><Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {Number(d.store.rating).toFixed(1)} ({d.store.rating_count})</span></div>
        {d.recent.length ? (
          <div className="divide-y divide-slate-100">{d.recent.map((r) => (
            <Link key={r.id} href={`/merchant/orders/${r.id}`} className="flex items-center gap-3 py-3 text-sm hover:bg-slate-50">
              <b dir="ltr">{r.sub_no}</b><StatusBadge map={SUB_STATUS} value={r.status} />
              <span className="mr-auto font-semibold">{formatPrice(r.subtotal)}</span><span className="flex items-center gap-1 text-xs text-ink-muted"><Clock className="h-3 w-3" />{timeAgo(r.created_at)}</span>
            </Link>))}
          </div>
        ) : <p className="text-sm text-ink-muted">لا طلبات بعد.</p>}
      </div>
    </div>
  );
}
