import Image from 'next/image';
import Link from 'next/link';
import { ChevronLeft, Star } from 'lucide-react';
import { getPublicSupabase } from '@/lib/supabase/server';
import { getCategories, getStores, searchProducts } from '@/lib/api/catalog';
import { art } from '@/lib/category-art';
import { storeTone } from '@/lib/stories';
import { CategoryChips } from '@/components/shop/category-chips';
import { PromoCarousel } from '@/components/shop/promo-carousel';
import { ProductFeed } from '@/components/shop/product-feed';
import { StoryBar } from '@/components/stories/story-bar';

export const revalidate = 300; // ISR: 5 دقائق (الحالات تُجلب في المتصفح فتبقى محدّثة)

type Block = { id: string; kind: string; title: string; subtitle: string | null; link: string | null; theme: string; ends_at: string | null };
type StoreRow = { id: string; name: string; slug: string; description: string | null; logo_url: string | null; rating_avg: number; rating_count: number; cities: { name_ar: string } | null };

const SERVICES = [
  { href: '/stores', label: 'كل المتاجر', hint: 'متاجر موثّقة', img: 'department-store', tint: '#EEF0FF' },
  { href: '/search?sort=discount', label: 'عروض اليوم', hint: 'خصومات حقيقية', img: 'label', tint: '#FFF0E3' },
  { href: '/c/coffee-honey', label: 'عسل وبن', hint: 'من المصدر', img: 'honey-pot', tint: '#FFF5DA' },
  { href: '/categories', label: 'كل الأقسام', hint: 'تصفّح الكل', img: 'package', tint: '#E6F6F6' },
];

export default async function HomePage() {
  const sb = getPublicSupabase();
  const [cats, blocks, first, featured] = await Promise.all([
    getCategories(sb),
    sb.from('content_blocks').select('id,kind,title,subtitle,link,theme,ends_at').eq('is_active', true).order('sort').then((r: { data: Block[] | null }) => r.data ?? []),
    searchProducts(sb, { sort: 'newest', limit: 20 }),
    getStores(sb, true),
  ]);
  const stores = (featured.length ? featured : await getStores(sb)) as unknown as StoreRow[];
  const heroes = blocks.filter((b) => b.kind === 'hero');
  const promo = blocks.find((b) => b.kind === 'promo');

  return (
    <div className="container space-y-8 pb-12 pt-4 md:space-y-12 md:pt-6">
      <CategoryChips categories={cats} />

      {/* البنر الرئيسي + بطاقات الخدمات */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <PromoCarousel slides={heroes} />
        <div className="grid content-start gap-4">
          <MultiStoreCard className="hidden lg:flex" />
          <div className="grid grid-cols-4 gap-2.5 lg:grid-cols-2 lg:gap-3">
            {SERVICES.map((s) => (
              <Link key={s.href} href={s.href} className="group flex flex-col items-center gap-1.5 text-center lg:flex-row lg:gap-3 lg:rounded-[22px] lg:border lg:border-line lg:bg-white lg:p-3 lg:text-right lg:transition lg:hover:border-brand-200">
                <span className="grid aspect-square w-full max-w-[76px] place-items-center rounded-[20px] lg:h-14 lg:w-14 lg:rounded-2xl" style={{ background: s.tint }}>
                  <Image src={art(s.img)} alt="" width={48} height={48} className="h-[60%] w-[60%] transition-transform group-hover:scale-110" />
                </span>
                <span className="text-xs font-medium lg:text-sm">{s.label}<span className="hidden text-[11px] font-normal text-ink-muted lg:block">{s.hint}</span></span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <StoryBar />

      <MultiStoreCard className="lg:hidden" />

      {/* كل المنتجات بشبكة عمودية؛ بقية الأقسام تظهر بعد آخر منتج */}
      <ProductFeed initial={first.items} total={first.total}>
        {promo && (
          <Link href={promo.link || '/search'} className="flex items-center gap-4 overflow-hidden rounded-[26px] bg-brand-900 p-5 text-white md:p-8">
            <Image src={art('delivery-truck')} alt="" width={120} height={120} className="h-16 w-16 shrink-0 md:h-24 md:w-24" />
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-semibold md:text-2xl">{promo.title}</span>
              {promo.subtitle && <span className="mt-1 block text-sm text-white/70">{promo.subtitle}</span>}
            </span>
            <ChevronLeft className="h-6 w-6 shrink-0 text-white/60" />
          </Link>
        )}
        {stores.length > 0 && (
          <section>
            <SectionHead title="متاجر مميزة" sub="متاجر موثّقة بتقييمات المشترين" href="/stores" />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              {stores.slice(0, 6).map((s) => <StoreTile key={s.id} s={s} />)}
            </div>
          </section>
        )}
      </ProductFeed>
    </div>
  );
}

function SectionHead({ title, sub, href }: { title: string; sub?: string; href?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3 md:mb-4">
      <div>
        <h2 className="text-lg font-semibold md:text-2xl">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-ink-soft md:text-sm">{sub}</p>}
      </div>
      {href && <Link href={href} className="flex shrink-0 items-center gap-0.5 text-sm font-medium text-brand-600 hover:text-brand-700">عرض الكل <ChevronLeft className="h-4 w-4" /></Link>}
    </div>
  );
}

/** ميزة المنصة الأساسية: سلة واحدة من عدة متاجر */
function MultiStoreCard({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-4 rounded-[24px] bg-brand-50 p-4 md:p-5 ${className ?? ''}`}>
      <span className="flex shrink-0">
        {[['ت', '#079EA5'], ['ع', '#FF7916'], ['أ', '#DB2777']].map(([l, c]) => (
          <span key={l} className="-ml-3 grid h-11 w-11 place-items-center rounded-full border-[3px] border-brand-50 text-base font-bold text-white first:ml-0" style={{ background: c }}>{l}</span>
        ))}
      </span>
      <p className="text-xs leading-5 text-ink-soft md:text-[13px]">
        <span className="block text-sm font-semibold text-ink md:text-base">اطلب من أكثر من متجر</span>
        كل المنتجات في سلة واحدة، وتدفع مرة واحدة عند الاستلام.
      </p>
    </div>
  );
}

function StoreTile({ s }: { s: StoreRow }) {
  const tone = storeTone(s.id);
  return (
    <Link href={`/s/${s.slug}`} className="group min-w-0 overflow-hidden rounded-[22px] border border-line bg-white transition hover:border-brand-200">
      <div className="relative h-16" style={{ background: `${tone}1F` }}>
        <span className="absolute -bottom-6 right-4 grid h-12 w-12 place-items-center overflow-hidden rounded-2xl border-[3px] border-white text-lg font-bold text-white" style={{ background: tone }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {s.logo_url ? <img src={s.logo_url} alt="" className="h-full w-full object-cover" /> : s.name.slice(0, 1)}
        </span>
      </div>
      <div className="p-4 pt-8">
        <p className="truncate font-semibold">{s.name}</p>
        <p className="mt-1 flex items-center gap-2 text-xs text-ink-soft">
          <span className="flex items-center gap-0.5"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{Number(s.rating_avg).toFixed(1)}</span>
          {s.cities?.name_ar && <span className="truncate">{s.cities.name_ar}</span>}
        </p>
      </div>
    </Link>
  );
}
