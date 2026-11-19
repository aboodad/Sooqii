'use client';
import { useState } from 'react';
import { KeyRound, Lock, PackageOpen, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useMerchant } from '@/hooks/use-merchant';
import { useQuery } from '@/hooks/use-query';
import { formatDate } from '@/lib/format';
import { BATCH_STATUS, SUB_STATUS } from '@/lib/status';
import { errorMessage } from '@/lib/utils';
import { PageHeader } from '@/components/dashboard/shell';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/misc';

type Batch = { id: string; batch_no: string; status: string; pickup_code: string | null; created_at: string; closed_at: string | null; picked_up_at: string | null; location: string | null;
  subs: { id: string; sub_no: string; status: string; items: { name: string; variant: string | null; qty: number; line_code: string }[] }[] };

/** دفعات التجهيز: عند التوصيل عبر مركز سوقي تُجمع الطلبات الجاهزة في دفعة يستلمها المندوب برمز (بدون بيانات العميل) */
export default function Batches() {
  const sb = getSupabase();
  const { store } = useMerchant();
  const [busy, setBusy] = useState<string | null>(null);
  const { data, loading, reload } = useQuery(async () => {
    if (!store) return [];
    const { data, error } = await sb.rpc('merchant_batches_list', { p_store: store.id });
    if (error) throw error;
    return data as Batch[];
  }, [store?.id]);

  async function close(id: string) {
    setBusy(id);
    const { data: r, error } = await sb.rpc('merchant_close_batch', { p_batch: id });
    setBusy(null);
    if (error) return toast.error(errorMessage(error));
    toast.success(`أُغلقت الدفعة — رمز الاستلام ${r.pickup_code}`); reload();
  }

  return (
    <div>
      <PageHeader title="دفعات التجهيز" subtitle="قائمة التجهيز (Manifest) لكل دفعة. سلّم الدفعة للمندوب فقط بعد أن يُدخل رمز الاستلام." />
      {loading ? <Skeleton className="h-64" /> : !data?.length ? (
        <EmptyState icon={<PackageOpen />} title="لا توجد دفعات" text="تظهر الدفعات عند تفعيل التوصيل عبر مركز سوقي وتجهيز الطلبات (حالة «جاهز»)." />
      ) : (
        <div className="space-y-4">
          {data.map((b) => (
            <div key={b.id} className="card overflow-hidden print:break-inside-avoid">
              <div className="flex flex-wrap items-center gap-3 bg-gradient-to-l from-brand-50 to-white px-5 py-3">
                <b dir="ltr" className="text-lg">{b.batch_no}</b>
                <StatusBadge map={BATCH_STATUS} value={b.status} />
                <span className="text-xs text-ink-muted">{formatDate(b.created_at)}{b.location ? ` · إلى ${b.location}` : ''}</span>
                <div className="mr-auto flex gap-2 print:hidden">
                  {b.status === 'open' && <Button size="sm" loading={busy === b.id} onClick={() => close(b.id)}><Lock className="h-4 w-4" /> إغلاق الدفعة</Button>}
                  <Button size="sm" variant="ghost" onClick={() => window.print()}><Printer className="h-4 w-4" /></Button>
                </div>
              </div>
              {b.status === 'closed' && b.pickup_code && (
                <div className="flex items-center gap-3 bg-accent-50 px-5 py-3 text-sm text-accent-800">
                  <KeyRound className="h-5 w-5" /> رمز استلام المندوب: <b className="text-xl tracking-[.3em]" dir="ltr">{b.pickup_code}</b>
                  <span className="text-xs">— أعطه للمندوب عند الاستلام فقط</span>
                </div>
              )}
              <div className="divide-y divide-slate-100">
                {b.subs.map((s) => (
                  <div key={s.id} className="px-5 py-3">
                    <div className="mb-1 flex items-center gap-2"><b dir="ltr" className="text-sm">{s.sub_no}</b><StatusBadge map={SUB_STATUS} value={s.status} /></div>
                    <ul className="text-sm text-ink-soft">
                      {s.items.map((i) => <li key={i.line_code} className="flex justify-between gap-3"><span>☐ {i.name}{i.variant ? ` — ${i.variant}` : ''}</span><span dir="ltr" className="text-xs">{i.line_code} × {i.qty}</span></li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
