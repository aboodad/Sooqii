'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { MERCHANT_DIRECT_HANDOVER, MERCHANT_NEXT, OPS_NEXT } from '@/lib/status';
import { errorMessage } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/misc';
import { Input, Textarea } from '@/components/ui/field';

/** أزرار نقل حالة الطلب الفرعي — الخادم يتحقق من الدور والانتقال */
export function StatusActions({ subId, status, mode, onDone, direct = true }: { subId: string; status: string; mode: 'merchant' | 'ops'; onDone: () => void; direct?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [cancel, setCancel] = useState(false);
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [otpOpen, setOtpOpen] = useState(false);
  const [otp, setOtp] = useState('');
  const next = mode === 'ops'
    ? (OPS_NEXT[status] ?? []).filter((n) => direct || !(status === 'ready' && n.to === 'handed_over'))
    : [...(MERCHANT_NEXT[status] ?? []), ...(direct && status === 'ready' ? [MERCHANT_DIRECT_HANDOVER] : [])];
  const canCancel = ['pending_merchant', 'accepted', 'preparing'].includes(status);

  async function move(to: string, why?: string) {
    setBusy(to);
    const { error } = await getSupabase().rpc('update_sub_order_status', { p_sub: subId, p_to: to, p_reason: why || null, p_otp: null });
    setBusy(null);
    if (error) return toast.error(errorMessage(error));
    toast.success('تم تحديث الحالة'); setCancel(false); setReasonFor(null); setReason(''); onDone();
  }
  async function confirmOtp() {
    setBusy('delivered');
    const { data, error } = await getSupabase().rpc('confirm_delivery', { p_sub: subId, p_otp: otp });
    setBusy(null);
    if (error) return toast.error(errorMessage(error));
    if (!data.ok) return toast.error(data.message);
    toast.success(data.message); setOtpOpen(false); setOtp(''); onDone();
  }

  return (
    <div className="flex flex-wrap gap-2">
      {next.map((n) => (
        <Button key={n.to} size="sm" variant={n.to === 'delivery_failed' ? 'outline' : 'primary'} loading={busy === n.to}
          onClick={() => (n.to === 'delivery_failed' ? setReasonFor(n.to) : move(n.to))}>{n.label}</Button>
      ))}
      {mode === 'ops' && status === 'in_transit' && <Button size="sm" variant="accent" onClick={() => setOtpOpen(true)}>تأكيد التسليم (OTP)</Button>}
      {canCancel && <Button size="sm" variant="danger" onClick={() => setCancel(true)}>إلغاء</Button>}

      <Modal open={cancel || !!reasonFor} onClose={() => { setCancel(false); setReasonFor(null); }} title={cancel ? 'إلغاء الطلب الفرعي' : 'سبب تعذّر التسليم'}>
        <Textarea placeholder="اذكر السبب (مطلوب)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        <Button variant="danger" className="mt-4 w-full" loading={!!busy} disabled={reason.trim().length < 3}
          onClick={() => move(cancel ? 'cancelled' : reasonFor!, reason)}>تأكيد</Button>
      </Modal>
      <Modal open={otpOpen} onClose={() => setOtpOpen(false)} title="تأكيد التسليم">
        <p className="mb-3 text-sm text-ink-soft">أدخل الرمز المكوّن من 4 أرقام الذي يظهر لدى العميل.</p>
        <Input dir="ltr" inputMode="numeric" maxLength={4} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} className="text-center text-2xl tracking-[.5em]" />
        <Button className="mt-4 w-full" loading={busy === 'delivered'} disabled={otp.length !== 4} onClick={confirmOtp}>تأكيد</Button>
      </Modal>
    </div>
  );
}
