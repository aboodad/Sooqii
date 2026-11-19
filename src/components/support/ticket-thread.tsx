'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Send } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { formatDate } from '@/lib/format';
import { TICKET_CATEGORY, TICKET_STATUS } from '@/lib/status';
import { errorMessage, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/badge';

type Ticket = { id: string; ticket_no: string; subject: string; category: string; status: string; created_at: string; order_id: string | null; orders: { order_no: string } | null };
type Msg = { id: number; body: string; is_staff: boolean; created_at: string };

export function TicketThread({ id, staff }: { id: string; staff?: boolean }) {
  const sb = getSupabase();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const { data, loading, reload } = useQuery(async () => {
    const [{ data: t, error }, { data: m }] = await Promise.all([
      sb.from('support_tickets').select('id,ticket_no,subject,category,status,created_at,order_id, orders(order_no)').eq('id', id).single(),
      sb.from('support_messages').select('id,body,is_staff,created_at').eq('ticket_id', id).order('created_at'),
    ]);
    if (error) throw error;
    return { t: t as unknown as Ticket, m: (m ?? []) as Msg[] };
  }, [id]);

  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    const { error } = await sb.rpc('reply_ticket', { p_ticket: id, p_body: body });
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    setBody(''); reload();
  }
  async function setStatus(s: string) {
    const { error } = await sb.rpc('set_ticket_status', { p_ticket: id, p_status: s });
    if (error) return toast.error(errorMessage(error));
    reload();
  }

  if (loading && !data) return <Skeleton className="h-80" />;
  if (!data) return <p className="card p-6">التذكرة غير موجودة</p>;
  const { t, m } = data;
  return (
    <div className="card p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-slate-100 pb-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold">{t.subject}</h1>
          <p className="text-xs text-ink-muted"><span dir="ltr">{t.ticket_no}</span> · {TICKET_CATEGORY[t.category]} · {formatDate(t.created_at)}
            {t.orders && <> · الطلب <Link className="underline" dir="ltr" href={staff ? `/admin/orders?q=${t.orders.order_no}` : `/account/orders/${t.order_id}`}>{t.orders.order_no}</Link></>}</p>
        </div>
        <StatusBadge map={TICKET_STATUS} value={t.status} />
        {staff ? (
          <select className="input h-9 w-auto py-0 text-sm" value={t.status} onChange={(e) => setStatus(e.target.value)}>
            {Object.entries(TICKET_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        ) : t.status !== 'closed' && <Button size="sm" variant="ghost" onClick={() => setStatus('closed')}>إغلاق التذكرة</Button>}
      </div>
      <div className="space-y-3">
        {m.map((x) => {
          const mine = staff ? x.is_staff : !x.is_staff;
          return (
            <div key={x.id} className={cn('flex', mine ? 'justify-start' : 'justify-end')}>
              <div className={cn('max-w-[85%] rounded-2xl px-4 py-2.5 text-sm', mine ? 'bg-brand-500 text-white' : 'bg-mist text-ink')}>
                {x.is_staff && !staff && <p className="mb-0.5 text-[11px] font-bold text-brand-700">فريق سوقي</p>}
                <p className="whitespace-pre-line leading-6">{x.body}</p>
                <p className={cn('mt-1 text-[10px]', mine ? 'text-white/70' : 'text-ink-muted')}>{formatDate(x.created_at)}</p>
              </div>
            </div>
          );
        })}
      </div>
      {t.status !== 'closed' && (
        <div className="mt-5 flex items-end gap-2">
          <Textarea className="min-h-[60px]" placeholder="اكتب ردك…" maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} />
          <Button size="icon" loading={busy} onClick={send} aria-label="إرسال"><Send className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  );
}
