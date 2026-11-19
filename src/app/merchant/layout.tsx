'use client';
import Link from 'next/link';
import { BarChart3, Boxes, Package, Settings, ShoppingCart, RotateCcw, TicketPercent, Users, Wallet, Clock, Store, CircleDashed, PackageOpen, TrendingUp as LineChartIcon, Megaphone, MessageCircleQuestion } from 'lucide-react';
import { DashboardShell } from '@/components/dashboard/shell';
import { MerchantProvider, useMerchant } from '@/hooks/use-merchant';
import { useSession } from '@/hooks/use-session';
import { Skeleton, EmptyState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { STORE_STATUS } from '@/lib/status';

const nav = [
  { href: '/merchant', label: 'نظرة عامة', icon: BarChart3 },
  { href: '/merchant/orders', label: 'الطلبات', icon: ShoppingCart },
  { href: '/merchant/batches', label: 'دفعات التجهيز', icon: PackageOpen },
  { href: '/merchant/analytics', label: 'التحليلات', icon: LineChartIcon },
  { href: '/merchant/products', label: 'المنتجات', icon: Package },
  { href: '/merchant/inventory', label: 'المخزون', icon: Boxes },
  { href: '/merchant/returns', label: 'المرتجعات', icon: RotateCcw },
  { href: '/merchant/promotions', label: 'الخصومات والكوبونات', icon: TicketPercent },
  { href: '/merchant/stories', label: 'الاستوري', icon: CircleDashed },
  { href: '/merchant/ads', label: 'الإعلانات الممولة', icon: Megaphone },
  { href: '/merchant/questions', label: 'أسئلة العملاء', icon: MessageCircleQuestion },
  { href: '/merchant/finance', label: 'المالية وكشف الحساب', icon: Wallet },
  { href: '/merchant/team', label: 'الفريق', icon: Users },
  { href: '/merchant/settings', label: 'ملف المتجر', icon: Settings },
];

function Inner({ children }: { children: React.ReactNode }) {
  const { store, stores, setStoreId } = useMerchant();
  return (
    <DashboardShell title="لوحة التاجر" nav={nav} header={
      <>
        {stores.length > 1 ? (
          <select className="input h-10 w-auto py-0" value={store?.id} onChange={(e) => setStoreId(e.target.value)}>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        ) : <span className="flex items-center gap-2 font-bold"><Store className="h-5 w-5 text-brand-600" />{store?.name}</span>}
        {store && <StatusBadge map={STORE_STATUS} value={store.status} />}
      </>
    }>
      {store?.status === 'pending' && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl bg-orange-50 p-4 text-sm text-orange-800 ring-1 ring-orange-200">
          <Clock className="h-5 w-5 shrink-0" /> متجرك قيد المراجعة. يمكنك تجهيز منتجاتك الآن، وستظهر للعملاء بعد اعتماد المتجر.
        </div>
      )}
      {store?.status === 'suspended' && <div className="mb-6 rounded-2xl bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-200">متجرك معلّق حاليًا ولا يظهر للعملاء. تواصل مع الإدارة.</div>}
      {children}
    </DashboardShell>
  );
}

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  const { loading, isMerchant } = useSession();
  if (loading) return <div className="p-8"><Skeleton className="h-96" /></div>;
  if (!isMerchant) {
    return <div className="container py-16"><EmptyState icon={<Store />} title="ليس لديك متجر بعد" text="افتح متجرك على سوقي وابدأ البيع." action={<Link href="/sell"><Button>افتح متجرك</Button></Link>} /></div>;
  }
  return <MerchantProvider><Inner>{children}</Inner></MerchantProvider>;
}
