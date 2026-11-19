'use client';
import { RotateCcw } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { formatDate } from '@/lib/format';
import { RETURN_STATUS } from '@/lib/status';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState, Skeleton } from '@/components/ui/misc';

export default function ReturnsPage() {
  const { data, loading } = useQuery(async () => {
    const { data } = await getSupabase().from('returns').select('id,qty,reason,status,decision_note,created_at, order_items(product_name)').order('created_at', { ascending: false });
    return (data ?? []) as unknown as { id: string; qty: number; reason: string; status: string; decision_note: string | null; created_at: string; order_items: { product_name: string } | null }[];
  });
  if (loading) return <Skeleton className="h-40" />;
  if (!data?.length) return <div className="card"><EmptyState icon={<RotateCcw />} title="لا توجد مرتجعات" text="يمكنك طلب الإرجاع من صفحة الطلب بعد الاستلام خلال 7 أيام." /></div>;
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold md:text-2xl">المرتجعات</h1>
      {data.map((r) => (
        <div key={r.id} className="card p-4">
          <div className="flex items-center justify-between"><b>{r.order_items?.product_name}</b><StatusBadge map={RETURN_STATUS} value={r.status} /></div>
          <p className="mt-1 text-sm text-ink-soft">الكمية {r.qty} · {r.reason}</p>
          {r.decision_note && <p className="mt-1 text-sm text-brand-700">رد المتجر: {r.decision_note}</p>}
          <p className="mt-1 text-xs text-ink-muted">{formatDate(r.created_at)}</p>
        </div>
      ))}
    </div>
  );
}
