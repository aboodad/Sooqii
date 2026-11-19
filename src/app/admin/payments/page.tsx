'use client';
import { useState } from 'react';
import { MessageCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { formatDate, formatPrice, timeAgo } from '@/lib/format';
import { PAYMENT_CHANNEL } from '@/lib/status';
import { supportWhatsAppLink } from '@/lib/whatsapp';
import { errorMessage } from '@/lib/utils';
import { PageHeader } from '@/components/dashboard/shell';
import { Table, Td, Tabs } from '@/components/dashboard/widgets';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Modal, Skeleton } from '@/components/ui/misc';

type Pending = { id: string; order_no: string; channel: string; total: number; currency: string; due_at: string | null; created_at: string; customer: string; phone: string };
type Refund = { id: string; order_no: string; total: number; channel: string; phone: string };

export default function PaymentsPage() {
  const sb = getSupabase();
  const [tab, setTab] = useState('pending');
  const [confirm, setConfirm] = useState<Pending | null>(null);
  const [refund, setRefund] = useState<Refund | null>(null);
  const [ref, setRef] = useState(''); const [amount, setAmount] = useState(''); const [busy, setBusy] = useState(false);
  const { data, loading, reload, error } = useQuery(async () => {
    const { data, error } = await sb.rpc('admin_finance_overview');
    if (error) throw error;
    return { pending: data.pending_payments as Pending[], refunds: data.refunds_due as Refund[] };
  });

  async function doConfirm() {
    if (!confirm) return;
    setBusy(true);
    const { error } = await sb.rpc('admin_confirm_payment', { p_order: confirm.id, p_ref: ref, p_amount: amount ? Number(amount) : null });
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    toast.success('تم تأكيد الدفع وإرسال الطلب للمتاجر'); setConfirm(null); setRef(''); setAmount(''); reload();
  }
  async function doRefund() {
    if (!refund) return;
    setBusy(true);
    const { error } = await sb.rpc('admin_refund_payment', { p_order: refund.id, p_ref: ref });
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    toast.success('سُجّل الاسترداد'); setRefund(null); setRef(''); reload();
  }

  if (error) return <p className="card p-6 text-red-600">{error}</p>;
  return (
    <div>
      <PageHeader title="تأكيد المدفوعات" subtitle="يرسل العميل إثبات التحويل عبر واتساب؛ طابق المبلغ ورقم العملية ثم أكّد هنا ليبدأ التجهيز."
        actions={<Button variant="outline" onClick={reload}><RefreshCw className="h-4 w-4" /> تحديث</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ v: 'pending', l: 'بانتظار التأكيد', n: data?.pending.length }, { v: 'refunds', l: 'مبالغ للاسترداد', n: data?.refunds.length }]} />
      {loading && !data ? <Skeleton className="h-64" /> : tab === 'pending' ? (
        <Table head={['الطلب', 'العميل', 'الطريقة', 'المبلغ', 'المهلة', '']} empty={!data?.pending.length}>
          {data?.pending.map((p) => {
            const late = p.due_at && new Date(p.due_at) < new Date();
            const wa = supportWhatsAppLink(p.phone, `مرحبًا ${p.customer}، بخصوص دفع طلبك ${p.order_no} على سوقي`);
            return (
              <tr key={p.id}>
                <Td dir="ltr" className="font-semibold">{p.order_no}<span className="block text-[11px] font-normal text-ink-muted">{timeAgo(p.created_at)}</span></Td>
                <Td>{p.customer}<span className="block text-xs text-ink-muted" dir="ltr">{p.phone}</span></Td>
                <Td>{PAYMENT_CHANNEL[p.channel] ?? p.channel}</Td>
                <Td className="font-bold">{formatPrice(p.total)}</Td>
                <Td className={late ? 'text-xs text-red-600' : 'text-xs'}>{p.due_at ? formatDate(p.due_at) : '—'}</Td>
                <Td><div className="flex gap-1">
                  <Button size="sm" onClick={() => { setConfirm(p); setAmount(String(p.total)); }}>تأكيد الدفع</Button>
                  {wa && <a href={wa} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="ghost" aria-label="واتساب"><MessageCircle className="h-4 w-4" /></Button></a>}
                </div></Td>
              </tr>
            );
          })}
        </Table>
      ) : (
        <Table head={['الطلب', 'الهاتف', 'الطريقة', 'المبلغ', '']} empty={!data?.refunds.length}>
          {data?.refunds.map((r) => (
            <tr key={r.id}><Td dir="ltr" className="font-semibold">{r.order_no}</Td><Td dir="ltr">{r.phone}</Td><Td>{PAYMENT_CHANNEL[r.channel] ?? r.channel}</Td><Td className="font-bold">{formatPrice(r.total)}</Td>
              <Td><Button size="sm" variant="accent" onClick={() => setRefund(r)}>تسجيل الاسترداد</Button></Td></tr>
          ))}
        </Table>
      )}

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={`تأكيد دفع ${confirm?.order_no ?? ''}`}>
        <div className="space-y-3">
          <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">تأكد من وصول المبلغ فعليًا إلى حساب {PAYMENT_CHANNEL[confirm?.channel ?? ''] ?? ''} قبل التأكيد. الإجراء مُسجّل في سجل التدقيق والقيود المحاسبية.</p>
          <Field label="رقم العملية / مرجع الحوالة"><Input dir="ltr" maxLength={120} value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
          <Field label="المبلغ المستلم (ر.ي)"><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} /></Field>
          <Button className="w-full" loading={busy} disabled={!ref.trim()} onClick={doConfirm}>تأكيد</Button>
        </div>
      </Modal>
      <Modal open={!!refund} onClose={() => setRefund(null)} title={`استرداد ${refund?.order_no ?? ''}`}>
        <Field label="مرجع إعادة المبلغ"><Input dir="ltr" maxLength={120} value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
        <Button className="mt-4 w-full" variant="accent" loading={busy} disabled={!ref.trim()} onClick={doRefund}>تأكيد الاسترداد</Button>
      </Modal>
    </div>
  );
}
