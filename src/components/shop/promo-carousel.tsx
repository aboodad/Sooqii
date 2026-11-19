'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { art } from '@/lib/category-art';
import { cn } from '@/lib/utils';

type Slide = { id: string; title: string; subtitle: string | null; link: string | null; theme: string; ends_at: string | null };

/** ألوان البنرات ورسوماتها حسب «الثيم» المختار من لوحة المحتوى */
const THEMES: Record<string, { bg: string; btn: string; imgs: [string, string, string] }> = {
  orange: { bg: 'bg-accent-500', btn: 'text-accent-600', imgs: ['shopping-bags', 'wrapped-gift', 'label'] },
  teal: { bg: 'bg-brand-500', btn: 'text-brand-700', imgs: ['shopping-bags', 'package', 'delivery-truck'] },
  ink: { bg: 'bg-brand-900', btn: 'text-brand-900', imgs: ['honey-pot', 'hot-beverage', 'basket'] },
  violet: { bg: 'bg-violet-600', btn: 'text-violet-700', imgs: ['wrapped-gift', 'money-bag', 'sparkles'] },
};

export function PromoCarousel({ slides }: { slides: Slide[] }) {
  const list = slides.length ? slides : [{ id: 'default', title: 'كل متاجر اليمن في سلة واحدة', subtitle: 'اطلب من أكثر من متجر وادفع مرة واحدة عند الاستلام', link: '/search', theme: 'orange', ends_at: null }];
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (list.length < 2 || paused) return;
    const t = setInterval(() => setI((v) => (v + 1) % list.length), 6500);
    return () => clearInterval(t);
  }, [list.length, paused]);

  const s = list[i % list.length];
  // أول بنر برتقالي دائمًا ليتطابق مع هوية النموذج، والباقي حسب الثيم
  const t = THEMES[i === 0 ? 'orange' : s.theme] ?? THEMES.orange;

  return (
    <div className={cn('relative h-[200px] overflow-hidden rounded-[26px] text-white transition-colors duration-500 sm:h-[260px] md:h-[330px] md:rounded-[30px]', t.bg)}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <AnimatePresence mode="wait">
        <motion.div key={s.id} initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.35 }}
          className="absolute inset-0">
          <div className="relative z-10 flex h-full max-w-[62%] flex-col justify-center p-5 sm:p-8 md:max-w-[58%] md:p-12">
            <h2 className="text-xl font-bold leading-snug sm:text-3xl md:text-[40px] md:leading-[1.25]">{s.title}</h2>
            {s.subtitle && <p className="mt-2 line-clamp-2 text-xs text-white/85 sm:text-sm md:mt-3 md:text-base">{s.subtitle}</p>}
            {s.link && (
              <Link href={s.link} className={cn('mt-3 inline-flex h-9 w-fit items-center rounded-full bg-white px-4 text-xs font-semibold sm:mt-5 sm:h-11 sm:px-6 sm:text-sm', t.btn)}>
                تسوّق الآن
              </Link>
            )}
          </div>
          {/* تكوين الرسومات */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-[46%]">
            <span className="absolute left-[8%] top-1/2 aspect-square w-[78%] -translate-y-1/2 rounded-full bg-white/10" />
            <Image src={art(t.imgs[0])} alt="" width={256} height={256} priority={i === 0}
              className="absolute left-[16%] top-[12%] w-[56%] -rotate-6 drop-shadow-[0_22px_22px_rgba(0,0,0,.28)]" />
            <Image src={art(t.imgs[1])} alt="" width={160} height={160}
              className="absolute bottom-[10%] left-[50%] w-[32%] drop-shadow-[0_16px_16px_rgba(0,0,0,.25)]" />
            <Image src={art(t.imgs[2])} alt="" width={128} height={128}
              className="absolute bottom-[14%] left-[4%] w-[24%] rotate-12 drop-shadow-[0_14px_14px_rgba(0,0,0,.25)]" />
          </div>
        </motion.div>
      </AnimatePresence>
      {list.length > 1 && (
        <div className="absolute bottom-4 right-5 z-20 flex gap-1.5 sm:right-8 md:bottom-6 md:right-12">
          {list.map((x, k) => (
            <button key={x.id} onClick={() => setI(k)} aria-label={`البنر ${k + 1}`}
              className={cn('h-1.5 rounded-full transition-all', k === i ? 'w-6 bg-white' : 'w-1.5 bg-white/50')} />
          ))}
        </div>
      )}
    </div>
  );
}
