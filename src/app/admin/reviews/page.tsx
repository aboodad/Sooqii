'use client';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { formatDate } from '@/lib/format';
import { errorMessage } from '@/lib/utils';
import { PageHeader } from '@/components/dashboard/shell';
import { Table, Td } from '@/components/dashboard/widgets';
import { Rating } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function AdminReviews() {
  const sb = getSupabase();
  const { data, reload } = useQuery(async () => ((await sb.from('reviews').select('id,rating,comment,status,created_at, products(name), stores(name)').order('created_at', { ascending: false }).limit(100)).data ?? []) as unknown as { id: string; rating: number; comment: string | null; status: string; created_at: string; products: { name: string }; stores: { name: string } }[]);
  async function mod(id: string, status: string) {
    const { error } = await sb.rpc('admin_moderate_review', { p_review: id, p_status: status });
    if (error) return toast.error(errorMessage(error));
    reload();
  }
  return (
    <div>
      <PageHeader title="التقييمات" subtitle="تقييمات موثّقة من مشترين فعليين فقط" />
      <Table head={['المنتج', 'المتجر', 'التقييم', 'التعليق', 'التاريخ', 'الحالة', '']} empty={!data?.length}>
        {data?.map((r) => (
          <tr key={r.id}>
            <Td className="font-semibold">{r.products?.name}</Td><Td>{r.stores?.name}</Td><Td><Rating value={r.rating} /></Td>
            <Td className="max-w-xs text-ink-soft">{r.comment ?? '—'}</Td><Td className="text-xs">{formatDate(r.created_at)}</Td>
            <Td><Badge tone={r.status === 'published' ? 'green' : 'gray'}>{r.status === 'published' ? 'منشور' : 'مخفي'}</Badge></Td>
            <Td><Button size="sm" variant="ghost" onClick={() => mod(r.id, r.status === 'published' ? 'hidden' : 'published')}>{r.status === 'published' ? 'إخفاء' : 'نشر'}</Button></Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
