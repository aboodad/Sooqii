'use client';
/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ShoppingCart } from 'lucide-react';
import { useCartStore } from '@/stores/cart-store';
import { formatNumber } from '@/lib/format';

/** الصفحات التي يظهر فيها شريط السلة العائم (صفحة المنتج والسلة والدفع لها أزرارها) */
const SHOW_ON = [/^\/$/, /^\/search/, /^\/c\//, /^\/s\//, /^\/categories/, /^\/stores/];

export function CartFloat() {
  const path = usePathname();
  const count = useCartStore((s) => s.count);
  const guest = useCartStore((s) => s.guest);
  const visible = count > 0 && SHOW_ON.some((r) => r.test(path));
  const thumbs = guest.filter((g) => g.image).slice(0, 3);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          className="cart-float pointer-events-none fixed inset-x-3 z-30 flex justify-center md:inset-x-0">
          <div className="pointer-events-auto flex h-16 w-full md:w-[560px] items-center gap-3 rounded-[22px] bg-ink pl-2 pr-3 text-white shadow-float md:h-[72px] md:pr-4">
            {thumbs.length ? (
              <span className="flex">
                {thumbs.map((g) => (
                  <span key={g.offer_id} className="-ml-2.5 h-10 w-10 overflow-hidden rounded-xl border-2 border-ink bg-white first:ml-0 md:h-11 md:w-11">
                    <img src={g.image!} alt="" className="h-full w-full object-cover" />
                  </span>
                ))}
              </span>
            ) : (
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10"><ShoppingCart className="h-5 w-5" /></span>
            )}
            <p className="min-w-0 flex-1 text-xs text-white/70">
              <span className="block text-[15px] font-semibold text-white">{formatNumber(count)} {count === 1 ? 'منتج' : 'منتجات'} في سلتك</span>
              من متجر أو أكثر، والدفع مرة واحدة
            </p>
            <Link href="/cart" className="flex h-11 items-center rounded-2xl bg-brand-500 px-4 text-sm font-medium transition hover:bg-brand-400 md:h-12 md:px-6">عرض السلة</Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
