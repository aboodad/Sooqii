'use client';
import Link from 'next/link';
import { Heart } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { useSession } from '@/hooks/use-session';
import { ProductImage } from '@/components/shop/product-image';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';

export default function WishlistPage() {
  const { user } = useSession();
  const { data, loading, reload } = useQuery(async () => {
    if (!user) return [];
    const { data } = await getSupabase().from('wishlists').select('product_id, products(name,slug,status,product_images(url,sort))').order('created_at', { ascending: false });
    return (data ?? []) as unknown as { product_id: string; products: { name: string; slug: string; status: string; product_images: { url: string }[] } | null }[];
  }, [user?.id]);
  if (!user) return <div className="card"><EmptyState icon={<Heart />} title="سجّل الدخول لعرض المفضلة" action={<Link href="/auth/login?next=/account/wishlist"><Button>دخول</Button></Link>} /></div>;
  if (loading) return <Skeleton className="h-64" />;
  if (!data?.length) return <div className="card"><EmptyState icon={<Heart />} title="قائمة المفضلة فارغة" text="اضغط على القلب في أي منتج لحفظه هنا." /></div>;
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold md:text-2xl">المفضلة</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {data.filter((w) => w.products).map((w) => (
          <div key={w.product_id} className="card group overflow-hidden">
            <Link href={`/p/${w.products!.slug}`} className="relative block aspect-square bg-slate-50"><ProductImage src={w.products!.product_images[0]?.url ?? null} alt={w.products!.name} /></Link>
            <div className="flex items-center justify-between gap-2 p-3">
              <Link href={`/p/${w.products!.slug}`} className="line-clamp-2 text-sm font-semibold">{w.products!.name}</Link>
              <button onClick={async () => { await getSupabase().from('wishlists').delete().eq('product_id', w.product_id); reload(); }} aria-label="إزالة"><Heart className="h-5 w-5 fill-accent-500 text-accent-500" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
