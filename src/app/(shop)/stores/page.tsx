import type { Metadata } from 'next';
import Link from 'next/link';
import { MapPin, Star } from 'lucide-react';
import { getPublicSupabase } from '@/lib/supabase/server';
import { getStores } from '@/lib/api/catalog';
import { storeTone } from '@/lib/stories';
import { StoryBar } from '@/components/stories/story-bar';

export const revalidate = 300;
export const metadata: Metadata = { title: 'المتاجر' };

type StoreRow = { id: string; name: string; slug: string; description: string | null; logo_url: string | null; rating_avg: number; rating_count: number; cities: { name_ar: string } | null };

export default async function StoresPage() {
  const stores = (await getStores(getPublicSupabase())) as unknown as StoreRow[];
  return (
    <div className="container space-y-8 py-6 md:py-8">
      <StoryBar />
      <section>
        <h1 className="mb-4 text-2xl font-semibold md:text-3xl">المتاجر على سوقي</h1>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 md:gap-4">
          {stores.map((s) => {
            const tone = storeTone(s.id);
            return (
              <Link key={s.id} href={`/s/${s.slug}`} className="tile group flex items-center gap-4 p-4 transition hover:border-brand-200">
                <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-[20px] text-2xl font-bold text-white" style={{ background: tone }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {s.logo_url ? <img src={s.logo_url} alt="" className="h-full w-full object-cover" /> : s.name.slice(0, 1)}
                </span>
                <div className="min-w-0">
                  <h2 className="font-semibold group-hover:text-brand-600">{s.name}</h2>
                  {s.description && <p className="line-clamp-1 text-xs text-ink-muted">{s.description}</p>}
                  <p className="mt-1.5 flex items-center gap-3 text-xs text-ink-soft">
                    <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{Number(s.rating_avg).toFixed(1)} <span className="text-ink-muted">({s.rating_count})</span></span>
                    {s.cities?.name_ar && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{s.cities.name_ar}</span>}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
