'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, LayoutGrid, ShoppingCart, Store, User } from 'lucide-react';
import { useCartStore } from '@/stores/cart-store';
import { cn } from '@/lib/utils';

const side = [
  { href: '/', label: 'الرئيسية', icon: Home },
  { href: '/categories', label: 'الأقسام', icon: LayoutGrid },
  null, // السلة في المنتصف
  { href: '/stores', label: 'المتاجر', icon: Store },
  { href: '/account', label: 'حسابي', icon: User },
];

/** شريط التنقل السفلي للجوال: السلة بارزة في المنتصف */
export function BottomNav() {
  const path = usePathname();
  const count = useCartStore((s) => s.count);
  const cartActive = path.startsWith('/cart');
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 safe-bottom backdrop-blur md:hidden" aria-label="التنقل السفلي">
      <ul className="grid h-[68px] grid-cols-5 items-start pt-2">
        {side.map((it) => {
          if (!it) {
            return (
              <li key="cart" className="flex justify-center">
                <Link href="/cart" aria-label="السلة"
                  className={cn('relative -mt-6 grid h-14 w-14 place-items-center rounded-[20px] text-white shadow-glow ring-4 ring-white transition active:scale-95', cartActive ? 'bg-brand-700' : 'bg-brand-500')}>
                  <ShoppingCart className="h-6 w-6" />
                  {count > 0 && (
                    <span key={count} className="absolute -left-1.5 -top-1.5 grid h-[22px] min-w-[22px] animate-pop-in place-items-center rounded-full bg-accent-500 px-1 text-[11px] font-bold text-white ring-2 ring-white">
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </Link>
              </li>
            );
          }
          const { href, label, icon: Icon } = it;
          const active = href === '/' ? path === '/' : path.startsWith(href);
          return (
            <li key={href}>
              <Link href={href} className={cn('flex flex-col items-center gap-1 text-[11px] transition', active ? 'font-medium text-brand-600' : 'text-ink-muted')}>
                <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.2 : 1.8} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
