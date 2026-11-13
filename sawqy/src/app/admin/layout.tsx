'use client';
import Link from 'next/link';
import { BarChart3, Store, PackageCheck, ShoppingCart, Users, FolderTree, LayoutTemplate, TicketPercent, Wallet, Settings, MessageSquare, ScrollText, ShieldAlert, ShieldCheck, CircleDashed } from 'lucide-react';
import { DashboardShell } from '@/components/dashboard/shell';
import { useSession } from '@/hooks/use-session';
import { Skeleton, EmptyState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { ROLE_LABEL } from '@/lib/status';

const nav = [
  { href: '/admin', label: 'نظرة عامة', icon: BarChart3 },
  { href: '/admin/orders', label: 'الطلبات والعمليات', icon: ShoppingCart },
  { href: '/admin/stores', label: 'المتاجر', icon: Store },
  { href: '/admin/stories', label: 'اشتراكات الاستوري', icon: CircleDashed },
  { href: '/admin/catalog', label: 'مراجعة المنتجات', icon: PackageCheck },
  { href: '/admin/users', label: 'المستخدمون والأدوار', icon: Users },
  { href: '/admin/taxonomy', label: 'التصنيفات والعلامات', icon: FolderTree },
  { href: '/admin/content', label: 'المحتوى والبانرات', icon: LayoutTemplate },
  { href: '/admin/promotions', label: 'كوبونات المنصة', icon: TicketPercent },
  { href: '/admin/finance', label: 'المالية والتسويات', icon: Wallet },
  { href: '/admin/reviews', label: 'التقييمات', icon: MessageSquare },
  { href: '/admin/settings', label: 'الشحن والإعدادات', icon: Settings },
  { href: '/admin/audit', label: 'سجل التدقيق', icon: ScrollText },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { loading, isStaff, ctx } = useSession();
  if (loading) return <div className="p-8"><Skeleton className="h-96" /></div>;
  if (!isStaff) return <div className="container py-16"><EmptyState icon={<ShieldAlert />} title="غير مصرح" text="هذه الصفحة لفريق إدارة المنصة فقط." action={<Link href="/"><Button>العودة للرئيسية</Button></Link>} /></div>;
  const needsMfa = ctx?.mfa.enrolled && ctx.mfa.aal !== 'aal2';
  return (
    <DashboardShell title="لوحة الإدارة" nav={nav} accent="from-slate-900 to-brand-900" header={
      <>
        <span className="flex items-center gap-2 font-bold"><ShieldCheck className="h-5 w-5 text-brand-600" /> {ctx?.profile.full_name}</span>
        <span className="hidden text-xs text-ink-muted sm:inline">{ctx?.roles.map((r) => ROLE_LABEL[r]).join('، ')}</span>
      </>
    }>
      {!ctx?.mfa.enrolled && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl bg-orange-50 p-4 text-sm text-orange-800 ring-1 ring-orange-200">
          <ShieldAlert className="h-5 w-5" /> لحماية المنصة، فعّل التحقق الثنائي لحسابك الإداري.
          <Link href="/account/security" className="mr-auto font-bold underline">تفعيل الآن</Link>
        </div>
      )}
      {needsMfa && <div className="mb-6 rounded-2xl bg-red-50 p-4 text-sm text-red-700">جلستك الحالية لم تُكمل التحقق الثنائي؛ سجّل الخروج والدخول مجددًا لتنفيذ الإجراءات الإدارية.</div>}
      {children}
    </DashboardShell>
  );
}
