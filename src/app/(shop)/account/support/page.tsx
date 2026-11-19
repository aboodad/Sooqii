'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LifeBuoy, MessageCircle, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { usePublicSettings } from '@/hooks/use-settings';
import { formatDate } from '@/lib/format';
import { TICKET_CATEGORY as CATEGORIES, TICKET_STATUS } from '@/lib/status';
import { supportWhatsAppLink } from '@/lib/whatsapp';
import { errorMessage } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Modal, Skeleton, EmptyState } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/badge';


function Support() {
  const sb = getSupabase();
  const router = useRouter();
  const sp = useSearchParams();
  const orderId = sp.get('order');
  const { settings } = usePublicSettings();
  const [open, setOpen] = useState(!!orderId);
  const [f, setF] = useState({ category: orderId ? 'order' : 'other', subject: '', body: '' });
  const [busy, setBusy] = useState(false);
  const { data, loading } = useQuery(async () => (await sb.from('support_tickets').select('id,ticket_no,subject,category,status,updated_at').order('updated_at', { ascending: false })).data ?? []);
  const wa = settings.support_phone ? supportWhatsAppLink(settings.support_phone, 'مرحبًا سوقي، أحتاج مساعدة') : null;

  async function submit() {
    if (f.subject.trim().length < 3 || f.body.trim().length < 5) return toast.error('اكتب عنوانًا وتفاصيل كافية');
    setBusy(true);
    const { data: r, error } = await sb.rpc('open_ticket', { p_category: f.category, p_subject: f.subject, p_body: f.body, p_order: orderId });
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    toast.success(`تم فتح التذكرة ${r.ticket_no}`);
    router.push(`/account/support/${r.id}`);
  }

  return (
    <div className="tile p-4 md:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold md:text-2xl">الدعم الفني</h1>
        <div className="flex gap-2">
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm"><MessageCircle className="h-4 w-4" /> واتساب</Button></a>}
          <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> تذكرة جديدة</Button>
        </div>
      </div>
      {loading ? <Skeleton className="h-40" /> : data?.length ? (
        <div className="divide-y divide-slate-100">
          {data.map((t) => (
            <Link key={t.id} href={`/account/support/${t.id}`} className="flex flex-wrap items-center gap-3 py-3 hover:bg-mist/50">
              <div className="min-w-0 flex-1"><p className="truncate font-semibold">{t.subject}</p><p className="text-xs text-ink-muted"><span dir="ltr">{t.ticket_no}</span> · {CATEGORIES[t.category]} · {formatDate(t.updated_at)}</p></div>
              <StatusBadge map={TICKET_STATUS} value={t.status} />
            </Link>
          ))}
        </div>
      ) : <EmptyState icon={<LifeBuoy />} title="لا توجد تذاكر" text="فريقنا جاهز لمساعدتك في أي استفسار." />}

      <Modal open={open} onClose={() => setOpen(false)} title="تذكرة دعم جديدة">
        <div className="space-y-3">
          <Field label="القسم"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{Object.entries(CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="العنوان"><Input maxLength={120} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
          <Field label="التفاصيل"><Textarea maxLength={2000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
          {orderId && <p className="text-xs text-ink-muted">ستُربط التذكرة بالطلب تلقائيًا.</p>}
          <Button className="w-full" loading={busy} onClick={submit}>إرسال</Button>
        </div>
      </Modal>
    </div>
  );
}

export default function SupportPage() { return <Suspense><Support /></Suspense>; }
