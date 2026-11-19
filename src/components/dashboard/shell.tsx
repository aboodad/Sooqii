'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Menu, X, ArrowRight } from 'lucide-react';
import { LogoImage } from '@/components/shop/logo';
import { cn } from '@/lib/utils';

export type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number };

export function DashboardShell({ title, nav, children, header, accent = 'from-brand-900 to-brand-800' }: {
  title: string; nav: NavItem[]; children: React.ReactNode; header?: React.ReactNode; accent?: string;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const root = nav[0]?.href;
  const sidebar = (
    <div className={cn('flex h-full flex-col bg-gradient-to-b p-4 text-white', accent)}>
      <Link href="/" className="mb-6 flex items-center gap-3 px-2">
        <LogoImage height={40} light />
        <span className="border-r border-white/20 pr-3 text-xs font-medium text-white/70">{title}</span>
      </Link>
      <nav className="flex-1 space-y-1 overflow-y-auto">
        {nav.map(({ href, label, icon: Icon, badge }) => {
          const active = href === root ? path === href : path.startsWith(href);
          return (
            <Link key={href} href={href} onClick={() => setOpen(false)}
              className={cn('group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                active ? 'bg-white text-brand-800 shadow-lift' : 'text-white/75 hover:bg-white/10 hover:text-white')}>
              <Icon className={cn('h-[18px] w-[18px] transition-transform group-hover:scale-110', active && 'text-brand-600')} />
              {label}
              {!!badge && <span className="mr-auto rounded-full bg-accent-500 px-2 py-0.5 text-[10px] font-bold text-white">{badge}</span>}
            </Link>
          );
        })}
      </nav>
      <Link href="/" className="mt-4 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-white/70 hover:bg-white/10"><ArrowRight className="h-4 w-4" /> العودة للمتجر</Link>
    </div>
  );
  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 right-0 z-30 hidden w-64 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 w-72 animate-pop-in">{sidebar}</div>
        </div>
      )}
      <div className="lg:mr-64">
        <header className="glass sticky top-0 z-20 flex h-16 items-center gap-3 px-4 shadow-soft md:px-8">
          <button className="rounded-xl p-2 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="القائمة"><Menu className="h-5 w-5" /></button>
          <div className="flex flex-1 items-center gap-3">{header}</div>
        </header>
        <main className="p-4 md:p-8">{children}</main>
      </div>
      {open && <button className="fixed left-4 top-4 z-50 rounded-full bg-white p-2 lg:hidden" onClick={() => setOpen(false)} aria-label="إغلاق"><X className="h-5 w-5" /></button>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-extrabold md:text-3xl">{title}</h1>{subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}</div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
