import Image from 'next/image';
import Link from 'next/link';
import { LayoutGrid } from 'lucide-react';
import type { Category } from '@/lib/types';
import { CATEGORY_ART, art } from '@/lib/category-art';
import { DynamicIcon } from '@/components/ui/dynamic-icon';

/** شريط الأقسام الأفقي أعلى الرئيسية */
export function CategoryChips({ categories }: { categories: Category[] }) {
  const top = categories.filter((c) => !c.parent_id);
  return (
    <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
      <Link href="/categories" className="chip chip-on"><LayoutGrid className="h-4 w-4" />كل الأقسام</Link>
      {top.map((c) => {
        const a = CATEGORY_ART[c.slug];
        return (
          <Link key={c.id} href={`/c/${c.slug}`} className="chip">
            {a ? <Image src={art(a.img)} alt="" width={26} height={26} className="h-[26px] w-[26px]" /> : <DynamicIcon name={c.icon} className="h-4 w-4" />}
            {c.name_ar}
          </Link>
        );
      })}
    </div>
  );
}

/** شبكة الأقسام بالرسومات (صفحة الأقسام وأسفل الرئيسية) */
export function CategoryTiles({ categories }: { categories: Category[] }) {
  return (
    <div className="grid grid-cols-4 gap-x-2 gap-y-4 sm:grid-cols-6 lg:grid-cols-8">
      {categories.map((c) => {
        const a = CATEGORY_ART[c.slug];
        return (
          <Link key={c.id} href={`/c/${c.slug}`} className="group flex flex-col items-center gap-2 text-center">
            <span className="grid aspect-square w-full max-w-[96px] place-items-center rounded-[22px] transition-transform duration-200 group-hover:-translate-y-1"
              style={{ background: a?.tint ?? `${c.color}1A` }}>
              {a ? <Image src={art(a.img)} alt="" width={64} height={64} className="h-[58%] w-[58%] drop-shadow-[0_8px_8px_rgba(13,43,44,.18)]" />
                : <DynamicIcon name={c.icon} className="h-8 w-8" />}
            </span>
            <span className="text-xs font-medium text-ink-soft group-hover:text-ink">{c.name_ar}</span>
          </Link>
        );
      })}
    </div>
  );
}
