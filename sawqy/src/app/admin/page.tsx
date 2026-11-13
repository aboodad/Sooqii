'use client';
import Link from 'next/link';
import { AlertTriangle, Banknote, PackageCheck, Percent, RotateCcw, Search, ShoppingCart, Store, Users } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { formatNumber, formatPrice } from '@/lib/format';
import { PageHeader } from '@/components/dashboard/shell';
import { BarChart, StatCard } from '@/components/dashboard/widgets';
import { Skeleton } from '@/components/ui/misc';

type D = { users: number; stores: { active: number; pending: number }; products: { active: number; pending: number }; orders_today: number; gmv_month: number; commission_month: number; late_orders: number; returns_open: number;
  series: { day: string; orders: number; gmv: number }[]; top_stores: { name: string; slug: string; total: number; orders: number }[]; top_searches: { q: string; n: number }[] };

export default function AdminHome() {
  const { data: d, loading, error } = useQuery(async () => {
    const { data, error } = await getSupabase().rpc('admin_dashboard');
    if (error) throw error;
    return data as D;
  });
  if (error) return <p className="card p-6 text-red-600">{error}</p>;
  if (loading || !d) return <div className="grid gap-4 md:grid-cols-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32" />)}</div>;
  return (
    <div className="space-y-6">
      <PageHeader title="مؤشرات المنصة" subtitle="نظرة شاملة على أداء سوقي" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} label="إجمالي المبيعات هذا الشهر" value={formatPrice(d.gmv_month)} icon={<Banknote />} color="#0EA5A8" />
        <StatCard index={1} label="عمولات الشهر" value={formatPrice(d.commission_month)} icon={<Percent />} color="#8B5CF6" />
        <StatCard index={2} label="طلبات اليوم" value={d.orders_today} icon={<ShoppingCart />} color="#F97316" />
        <StatCard index={3} label="المستخدمون" value={formatNumber(d.users)} icon={<Users />} color="#0B7C7E" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Alert href="/admin/stores" icon={<Store />} label="متاجر بانتظار الاعتماد" n={d.stores.pending} />
        <Alert href="/admin/catalog" icon={<PackageCheck />} label="منتجات بانتظار المراجعة" n={d.products.pending} />
        <Alert href="/admin/orders" icon={<AlertTriangle />} label="طلبات متأخرة (+24 ساعة)" n={d.late_orders} danger />
        <Alert href="/admin/orders" icon={<RotateCcw />} label="مرتجعات مفتوحة" n={d.returns_open} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2"><BarChart data={d.series} valueKey="gmv" label="المبيعات اليومية (GMV)" format={formatPrice} /></div>
        <div className="card p-5">
          <h3 className="mb-3 font-bold">أفضل المتاجر (30 يومًا)</h3>
          {d.top_stores.length ? d.top_stores.map((s, i) => (
            <div key={s.slug} className="flex items-center gap-3 py-2 text-sm"><span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-50 text-xs font-bold text-brand-700">{i + 1}</span><span className="flex-1">{s.name}</span><b>{formatPrice(s.total)}</b></div>
          )) : <p className="text-sm text-ink-muted">لا بيانات بعد</p>}
          <h3 className="mb-2 mt-5 flex items-center gap-2 font-bold"><Search className="h-4 w-4" /> الأكثر بحثًا</h3>
          <div className="flex flex-wrap gap-1.5">{d.top_searches.map((s) => <span key={s.q} className="rounded-lg bg-slate-100 px-2 py-1 text-xs">{s.q} <b>{s.n}</b></span>)}</div>
        </div>
      </div>
      <BarChart data={d.series} valueKey="orders" label="عدد الطلبات اليومية" color="#F97316" />
    </div>
  );
}
function Alert({ href, icon, label, n, danger }: { href: string; icon: React.ReactNode; label: string; n: number; danger?: boolean }) {
  return (
    <Link href={href} className={`card flex items-center gap-3 p-4 transition hover:shadow-lift ${n > 0 ? (danger ? 'ring-2 ring-red-200' : 'ring-2 ring-orange-200') : ''}`}>
      <span className={`grid h-10 w-10 place-items-center rounded-xl [&>svg]:h-5 [&>svg]:w-5 ${n > 0 ? (danger ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600') : 'bg-slate-100 text-ink-muted'}`}>{icon}</span>
      <span className="flex-1 text-sm">{label}</span><b className="text-xl">{n}</b>
    </Link>
  );
}
