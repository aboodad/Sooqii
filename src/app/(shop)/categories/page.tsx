import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getPublicSupabase } from '@/lib/supabase/server';
import { getCategories } from '@/lib/api/catalog';
import { CATEGORY_ART, art } from '@/lib/category-art';
import { DynamicIcon } from '@/components/ui/dynamic-icon';

export const revalidate = 600;
export const metadata: Metadata = { title: 'الأقسام' };

export default async function CategoriesPage() {
  const cats = await getCategories(getPublicSupabase());
  const top = cats.filter((c) => !c.parent_id);
  return (
    <div className="container py-6 md:py-8">
      <h1 className="mb-5 text-2xl font-semibold md:text-3xl">كل الأقسام</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        {top.map((c) => {
          const a = CATEGORY_ART[c.slug];
          const subs = cats.filter((x) => x.parent_id === c.id);
          return (
            <div key={c.id} className="tile p-4 md:p-5">
              <Link href={`/c/${c.slug}`} className="group flex items-center gap-3">
                <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[20px]" style={{ background: a?.tint ?? `${c.color}1A` }}>
                  {a ? <Image src={art(a.img)} alt="" width={44} height={44} className="h-11 w-11 transition-transform group-hover:scale-110" /> : <DynamicIcon name={c.icon} className="h-7 w-7" />}
                </span>
                <span className="text-base font-semibold group-hover:text-brand-600">{c.name_ar}</span>
              </Link>
              {subs.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {subs.map((x) => (
                    <Link key={x.id} href={`/c/${x.slug}`} className="rounded-xl bg-mist px-3 py-1.5 text-xs text-ink-soft transition hover:bg-brand-50 hover:text-brand-700">{x.name_ar}</Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
