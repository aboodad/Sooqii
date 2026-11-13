'use client';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { Bell, Heart, LayoutDashboard, LogOut, Package, ShieldCheck, ShoppingCart, Store, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Logo } from './logo';
import { SearchBar } from './search-bar';
import { LocationPill } from './location-pill';
import { useCartStore } from '@/stores/cart-store';
import { useSession } from '@/hooks/use-session';
import { getSupabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

export function Header() {
  const { count, pulse } = useCartStore();
  const { user, ctx, isAdmin, isStaff, isMerchant } = useSession();
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  const controls = useAnimationControls();
  const router = useRouter();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => { if (pulse) controls.start({ scale: [1, 1.25, 0.92, 1], rotate: [0, -10, 6, 0], transition: { duration: 0.45 } }); }, [pulse, controls]);

  async function signOut() {
    await getSupabase().auth.signOut();
    setMenu(false);
    router.push('/');
    router.refresh();
  }

  // حرف الألف وحده يشبه علامة «!»، فنعرض حرفين حينها
  const name = (ctx?.profile?.full_name || user?.email || '?').trim();
  const initial = /^[اأإآ]/.test(name) ? name.slice(0, 2) : name.slice(0, 1);

  return (
    <header className={cn('sticky top-0 z-40 border-b bg-white/95 backdrop-blur transition-[border-color,box-shadow]', scrolled ? 'border-line shadow-[0_6px_20px_-14px_rgba(13,43,44,.35)]' : 'border-transparent')}>
      <div className="container flex h-16 items-center gap-3 md:h-[84px] md:gap-5">
        <Logo height={40} className="md:hidden" />
        <Logo height={48} className="hidden md:flex" />
        <LocationPill className="hidden lg:flex" />
        <div className="hidden flex-1 md:block">
          <Suspense><SearchBar /></Suspense>
        </div>

        <nav className="mr-auto flex items-center gap-2 md:mr-0">
          {user && (
            <Link href="/account/notifications" className="relative grid h-11 w-11 place-items-center rounded-2xl bg-mist text-ink transition hover:bg-brand-50 md:h-12 md:w-12" aria-label="الإشعارات">
              <Bell className="h-5 w-5" />
              {!!ctx?.unread && <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-accent-500 ring-2 ring-mist" />}
            </Link>
          )}
          <Link href="/account/wishlist" className="hidden h-12 w-12 place-items-center rounded-2xl bg-mist text-ink transition hover:bg-brand-50 md:grid" aria-label="المفضلة">
            <Heart className="h-5 w-5" />
          </Link>
          <Link href="/cart" className="relative hidden h-12 w-12 place-items-center rounded-2xl bg-brand-500 text-white shadow-glow transition hover:bg-brand-600 md:grid" aria-label="السلة">
            <motion.span animate={controls} className="block"><ShoppingCart className="h-5 w-5" /></motion.span>
            {count > 0 && (
              <span key={count} className="absolute -left-1.5 -top-1.5 grid h-6 min-w-6 animate-pop-in place-items-center rounded-full bg-accent-500 px-1 text-[11px] font-bold text-white ring-2 ring-white">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </Link>
          {user ? (
            <div className="relative">
              <button onClick={() => setMenu((v) => !v)} aria-expanded={menu}
                className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-base font-semibold text-white md:h-12 md:w-12" aria-label="حسابي">
                {initial}
              </button>
              {menu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                  <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="absolute left-0 z-20 mt-2 w-64 rounded-3xl border border-line bg-white p-2 shadow-lift">
                    <div className="border-b border-line px-3 pb-2.5 pt-1.5">
                      <p className="truncate text-sm font-semibold">{ctx?.profile?.full_name}</p>
                      <p className="truncate text-xs text-ink-muted" dir="ltr">{user.email}</p>
                    </div>
                    <MenuLink href="/account" icon={<User />} onClick={() => setMenu(false)}>حسابي</MenuLink>
                    <MenuLink href="/account/orders" icon={<Package />} onClick={() => setMenu(false)}>طلباتي</MenuLink>
                    {isMerchant && <MenuLink href="/merchant" icon={<Store />} onClick={() => setMenu(false)}>لوحة التاجر</MenuLink>}
                    {!isMerchant && <MenuLink href="/sell" icon={<Store />} onClick={() => setMenu(false)}>افتح متجرك على سوقي</MenuLink>}
                    {(isAdmin || isStaff) && <MenuLink href="/admin" icon={isAdmin ? <ShieldCheck /> : <LayoutDashboard />} onClick={() => setMenu(false)}>لوحة الإدارة</MenuLink>}
                    <button onClick={signOut} className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm text-red-600 hover:bg-red-50">
                      <LogOut className="h-4 w-4" /> تسجيل الخروج
                    </button>
                  </motion.div>
                </>
              )}
            </div>
          ) : (
            <Link href="/auth/login" className="flex h-11 items-center rounded-2xl bg-ink px-4 text-sm font-medium text-white transition hover:bg-brand-800 md:h-12 md:px-5">
              تسجيل الدخول
            </Link>
          )}
        </nav>
      </div>
      <div className="container space-y-2 pb-3 md:hidden">
        <Suspense><SearchBar /></Suspense>
      </div>
    </header>
  );
}

function MenuLink({ href, icon, children, onClick }: { href: string; icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) {
  return (
    <Link href={href} onClick={onClick} className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm text-ink-soft hover:bg-mist hover:text-ink [&>svg]:h-4 [&>svg]:w-4">
      {icon}{children}
    </Link>
  );
}
