'use client';
import Link from 'next/link';
import { useState } from 'react';
import { MessageCircleQuestion } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useMerchant } from '@/hooks/use-merchant';
import { useQuery } from '@/hooks/use-query';
import { timeAgo } from '@/lib/format';
import { errorMessage } from '@/lib/utils';
import { PageHeader } from '@/components/dashboard/shell';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/field';
import { EmptyState, Skeleton } from '@/components/ui/misc';

type Q = { id: string; question: string; answer: string | null; status: string; at: string; product: string; product_slug: string };

export default function MerchantQuestions() {
  const sb = getSupabase();
  const { store } = useMerchant();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const { data, loading, reload } = useQuery(async () => {
    if (!store) return [];
    const { data, error } = await sb.rpc('merchant_questions', { p_store: store.id });
    if (error) throw error;
    return data as Q[];
  }, [store?.id]);

  async function answer(id: string) {
    setBusy(id);
    const { error } = await sb.rpc('answer_question', { p_id: id, p_answer: drafts[id] ?? '' });
    setBusy(null);
    if (error) return toast.error(errorMessage(error));
    toast.success('نُشرت الإجابة'); reload();
  }

  return (
    <div>
      <PageHeader title="أسئلة العملاء" subtitle="تظهر إجابتك على صفحة المنتج باسم «البائع». الإجابة السريعة ترفع المبيعات." />
      {loading ? <Skeleton className="h-64" /> : !data?.length ? <EmptyState icon={<MessageCircleQuestion />} title="لا توجد أسئلة" /> : (
        <div className="space-y-3">
          {data.map((q) => (
            <div key={q.id} className="card p-4">
              <p className="text-xs text-ink-muted"><Link href={`/p/${q.product_slug}`} className="font-semibold text-brand-600">{q.product}</Link> · {timeAgo(q.at)}</p>
              <p className="mt-1 font-semibold">{q.question}</p>
              {q.answer ? <p className="mt-2 rounded-xl bg-mist p-3 text-sm"><b>إجابتك: </b>{q.answer}</p> : (
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                  <Textarea className="min-h-[56px]" maxLength={1000} value={drafts[q.id] ?? ''} onChange={(e) => setDrafts({ ...drafts, [q.id]: e.target.value })} placeholder="اكتب إجابتك" />
                  <Button loading={busy === q.id} disabled={(drafts[q.id] ?? '').trim().length < 2} onClick={() => answer(q.id)}>نشر</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
