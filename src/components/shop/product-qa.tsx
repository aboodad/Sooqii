'use client';
import Link from 'next/link';
import { useState } from 'react';
import { MessageCircle as HelpCircle, MessageCircleQuestion } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { useSession } from '@/hooks/use-session';
import { formatDate } from '@/lib/format';
import { errorMessage } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/field';

type QA = { id: string; question: string; answer: string | null; at: string; answered_at: string | null; mine: boolean; asker: string };

/** أسئلة وأجوبة المنتج — يُجيب البائع باسم «البائع» دون كشف اسم المتجر */
export function ProductQA({ productId }: { productId: string }) {
  const sb = getSupabase();
  const { user } = useSession();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const { data, reload } = useQuery(async () => {
    const { data, error } = await sb.rpc('get_product_questions', { p_product: productId });
    if (error) throw error;
    return data as QA[];
  }, [productId, user?.id]);

  async function ask() {
    if (q.trim().length < 5) return toast.error('اكتب سؤالًا أوضح');
    setBusy(true);
    const { error } = await sb.rpc('ask_question', { p_product: productId, p_question: q });
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    toast.success('أُرسل سؤالك، سيظهر بعد إجابة البائع'); setQ(''); reload();
  }

  return (
    <section className="mt-12">
      <h2 className="section-title mb-4 flex items-center gap-2"><MessageCircleQuestion className="h-6 w-6 text-brand-500" /> أسئلة وأجوبة</h2>
      <div className="card p-4 md:p-5">
        {user ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Textarea className="min-h-[56px]" maxLength={500} placeholder="اسأل عن المقاس، الخامة، الضمان…" value={q} onChange={(e) => setQ(e.target.value)} />
            <Button loading={busy} onClick={ask}>اسأل</Button>
          </div>
        ) : <p className="text-sm text-ink-soft"><Link href="/auth/login" className="font-bold text-brand-600">سجّل الدخول</Link> لطرح سؤال عن هذا المنتج.</p>}
        <div className="mt-4 divide-y divide-slate-100">
          {data?.map((x) => (
            <div key={x.id} className="py-3 text-sm">
              <p className="flex gap-2 font-semibold"><HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />{x.question}</p>
              {x.answer ? <p className="mr-6 mt-1 leading-6 text-ink-soft"><b className="text-ink">البائع: </b>{x.answer}</p>
                : <p className="mr-6 mt-1 text-xs text-ink-muted">بانتظار إجابة البائع</p>}
              <p className="mr-6 mt-1 text-[11px] text-ink-muted">{x.asker} · {formatDate(x.at)}</p>
            </div>
          ))}
          {data && !data.length && <p className="py-3 text-center text-sm text-ink-muted">لا توجد أسئلة بعد. كن أول من يسأل!</p>}
        </div>
      </div>
    </section>
  );
}
