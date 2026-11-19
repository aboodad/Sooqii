'use client';
import Link from 'next/link';
import { Truck, ShieldAlert } from 'lucide-react';
import { useSession } from '@/hooks/use-session';
import { LogoImage } from '@/components/shop/logo';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';

export default function CourierLayout({ children }: { children: React.ReactNode }) {
  const { loading, isCourier, ctx } = useSession();
  if (loading) return <div className="p-6"><Skeleton className="h-96" /></div>;
  if (!isCourier) return <div className="container py-16"><EmptyState icon={<ShieldAlert />} title="غير مصرح" text="هذا التطبيق لمندوبي التوصيل المعتمدين فقط." action={<Link href="/"><Button>الرئيسية</Button></Link>} /></div>;
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 bg-ink px-4 text-white">
        <Link href="/"><LogoImage height={30} light /></Link>
        <span className="flex items-center gap-1.5 text-sm text-white/80"><Truck className="h-4 w-4" /> المندوب · {ctx?.profile.full_name}</span>
      </header>
      <main className="mx-auto max-w-2xl p-4">{children}</main>
    </div>
  );
}
