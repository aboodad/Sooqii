'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Heart, MapPin, Package, RotateCcw, Shield, User } from 'lucide-react';
import { useSession } from '@/hooks/use-session';
import { cn } from '@/lib/utils';

const links = [
  { href: '/account', label: 'الملف الشخصي', icon: User },
  { href: '/account/orders', label: 'طلباتي', icon: Package },
  { href: '/account/addresses', label: 'العناوين', icon: MapPin },
  { href: '/account/wishlist', label: 'المفضلة', icon: Heart },
  { href: '/account/returns', label: 'المرتجعات', icon: RotateCcw },
  { href: '/account/notifications', label: 'الإشعارات', icon: Bell },
  { href: '/account/security', label: 'الأمان', icon: Shield },
];

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { ctx } = useSession();
  return (
    <div className="container grid grid-cols-[minmax(0,1fr)] gap-4 py-4 md:grid-cols-[240px_minmax(0,1fr)] md:gap-6 md:py-8">
      <aside className="min-w-0 md:sticky md:top-28 md:h-fit">
        <div className="tile mb-3 hidden items-center gap-3 p-4 md:flex">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-lg font-bold text-white">{ctx?.profile?.full_name?.slice(0, 1) ?? '؟'}</span>
          <div className="min-w-0"><p className="truncate font-bold">{ctx?.profile?.full_name ?? '...'}</p><p className="text-xs text-ink-muted">حسابي</p></div>
        </div>
        <nav className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-col md:gap-1 md:rounded-[1.5rem] md:border md:border-line md:bg-white md:p-2">
          {links.map(({ href, label, icon: Icon }) => {
            const active = href === '/account' ? path === href : path.startsWith(href);
            return (
              <Link key={href} href={href} className={cn('flex h-10 shrink-0 items-center gap-2 rounded-2xl border px-3.5 text-sm transition md:h-11 md:border-0', active ? 'border-ink bg-ink text-white md:bg-brand-500' : 'border-line bg-white text-ink-soft hover:bg-mist')}>
                <Icon className="h-4 w-4" />{label}
                {href === '/account/notifications' && !!ctx?.unread && <span className="mr-auto rounded-full bg-accent-500 px-1.5 text-[10px] font-bold text-white">{ctx.unread}</span>}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
