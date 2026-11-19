'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { formatDate, formatPrice } from '@/lib/format';
import { PRODUCT_STATUS } from '@/lib/status';
import { errorMessage } from '@/lib/utils';
import { PageHeader } from '@/components/dashboard/shell';
import { Tabs } from '@/components/dashboard/widgets';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { PackageCheck } from 'lucide-react';

type P = { id: string; name: string; slug: string; status: string; description: string | null; created_at: string; specs: Record<string, string>;
  categories: { name_ar: string } | null; stores: { name: string } | null; product_images: { url: string; sort: number }[];
  product_variants: { name: string; sku: string; seller_offers: { price: number }[] }[] };

export default function AdminCatalog() {
  const sb = getSupabase();
  const [tab, setTab] = useState('pending_review');
  const { data, loading, reload } = useQuery(async () => {
    const { data } = await sb.from('products').select('id,name,slug,status,description,created_at,specs, categories(name_ar), stores!products_proposed_by_store_id_fkey(name), product_images(url,sort), product_variants(name,sku, seller_offers(price))').eq('status', tab).order('created_at', { ascending: false }).limit(60);
    return (data ?? []) as unknown as P[];
  }, [tab]);

  async function review(id: string, status: string) {
    const reason = status === 'rejected' ? prompt('سبب الرفض (يظهر للتاجر)') : null;
    if (status === 'rejected' && !reason) return;
    const { error } = await sb.rpc('admin_review_product', { p_product: id, p_status: status, p_reason: reason });
    if (error) return toast.error(errorMessage(error));
    toast.success('تم'); reload();
  }

  return (
    <div>
      <PageHeader title="مراجعة الكتالوج" subtitle="المنتجات الجديدة المقترحة من المتاجر لا تظهر للعملاء قبل الاعتماد" />
      <Tabs value={tab} onChange={setTab} tabs={['pending_review', 'active', 'out_of_stock', 'hidden', 'rejected', 'archived'].map((v) => ({ v, l: PRODUCT_STATUS[v].label }))} />
      {loading ? <Skeleton className="h-64" /> : !data?.length ? <div className="card"><EmptyState icon={<PackageCheck />} title="لا توجد منتجات هنا" /></div> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.map((p) => (
            <div key={p.id} className="card flex gap-4 p-4">
              <div className="h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.product_images[0] && <img src={[...p.product_images].sort((a, b) => a.sort - b.sort)[0].url} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-start justify-between gap-2"><h3 className="font-bold">{p.name}</h3><StatusBadge map={PRODUCT_STATUS} value={p.status} /></div>
                <p className="text-xs text-ink-muted">{p.stores?.name} · {p.categories?.name_ar} · {formatDate(p.created_at)}</p>
                {p.description && <p className="line-clamp-2 text-sm text-ink-soft">{p.description}</p>}
                <p className="text-xs">{p.product_variants.map((v) => `${v.name} (${v.sku}) ${v.seller_offers[0] ? formatPrice(v.seller_offers[0].price) : ''}`).join(' · ')}</p>
                <div className="flex flex-wrap gap-1 pt-2">
                  {p.status !== 'active' && p.status !== 'out_of_stock' && <Button size="sm" onClick={() => review(p.id, 'active')}>اعتماد ونشر</Button>}
                  {p.status === 'pending_review' && <Button size="sm" variant="danger" onClick={() => review(p.id, 'rejected')}>رفض</Button>}
                  {['active', 'out_of_stock'].includes(p.status) && <Button size="sm" variant="outline" onClick={() => review(p.id, 'hidden')}>إخفاء</Button>}
                  {p.status !== 'archived' && <Button size="sm" variant="ghost" onClick={() => confirm('أرشفة المنتج؟') && review(p.id, 'archived')}>أرشفة</Button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
