'use client';
import Link from 'next/link';
import { ChevronLeft, Package } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { formatDate, formatPrice } from '@/lib/format';
import { ORDER_STATUS, SUB_STATUS } from '@/lib/status';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';

export default function OrdersPage() {
  const { data, loading } = useQuery(async () => {
    const { data } = await getSupabase().from('orders')
      .select('id,order_no,status,grand_total,created_at,sub_orders(id,status,stores(name)),order_items(image_url)')
      .order('created_at', { ascending: false }).limit(50);
    return data ?? [];
  });
  if (loading) return <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>;
  if (!data?.length) return <div className="card"><EmptyState icon={<Package />} title="لا توجد طلبات بعد" action={<Link href="/search"><Button>ابدأ التسوق</Button></Link>} /></div>;
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold md:text-2xl">طلباتي</h1>
      {data.map((o) => (
        <Link key={o.id} href={`/account/orders/${o.id}`} className="tile group flex items-center gap-3 p-3 transition hover:border-brand-200 md:gap-4 md:p-4">
          <div className="flex shrink-0 -space-x-4 space-x-reverse">
            {(o.order_items as { image_url: string | null }[]).slice(0, 3).map((it, k) => (
              <div key={k} className="h-12 w-12 overflow-hidden rounded-xl bg-slate-100 ring-2 ring-white md:h-14 md:w-14">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {it.image_url && <img src={it.image_url} alt="" className="h-full w-full object-cover" />}
              </div>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><b dir="ltr">{o.order_no}</b><StatusBadge map={ORDER_STATUS} value={o.status} /></div>
            <p className="mt-1 text-xs text-ink-muted">{formatDate(o.created_at)} · {(o.sub_orders as unknown[]).length} شحنة</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {(o.sub_orders as { id: string; status: string; stores: { name: string } | null }[]).map((s) => (
                <span key={s.id} className="text-[11px] text-ink-soft">{s.stores?.name}: {SUB_STATUS[s.status]?.label} · </span>
              ))}
            </div>
          </div>
          <div className="text-left"><b>{formatPrice(o.grand_total)}</b><ChevronLeft className="mr-auto mt-1 h-4 w-4 text-ink-muted transition group-hover:-translate-x-1" /></div>
        </Link>
      ))}
    </div>
  );
}
