'use client';
import { useEffect, useState } from 'react';
import { KeyRound, ShieldCheck, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useSession } from '@/hooks/use-session';
import { errorMessage } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

export default function SecurityPage() {
  const sb = getSupabase();
  const { isStaff, isMerchant, refresh } = useSession();
  const [factors, setFactors] = useState<{ id: string; status: string; friendly_name?: string }[]>([]);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => sb.auth.mfa.listFactors().then(({ data }) => setFactors((data?.totp ?? []) as typeof factors));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function startEnroll() {
    // إزالة أي عامل غير مكتمل سابق
    for (const f of factors.filter((x) => x.status !== 'verified')) await sb.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `sawqy-${Date.now()}` });
    if (error) return toast.error(errorMessage(error));
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }
  async function verify() {
    if (!enroll) return;
    setBusy(true);
    const { data: ch, error: e1 } = await sb.auth.mfa.challenge({ factorId: enroll.id });
    if (e1) { setBusy(false); return toast.error(errorMessage(e1)); }
    const { error } = await sb.auth.mfa.verify({ factorId: enroll.id, challengeId: ch.id, code });
    setBusy(false);
    if (error) return toast.error('الرمز غير صحيح');
    toast.success('تم تفعيل التحقق الثنائي'); setEnroll(null); setCode(''); load(); refresh();
  }
  async function changePassword() {
    if (pw.length < 8) return toast.error('8 أحرف على الأقل');
    setBusy(true);
    const { error } = await sb.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    toast.success('تم تغيير كلمة المرور'); setPw('');
  }
  const verified = factors.filter((f) => f.status === 'verified');

  return (
    <div className="space-y-5">
      <div className="tile p-4 md:p-6">
        <h1 className="mb-1 flex items-center gap-2 text-xl font-extrabold">{verified.length ? <ShieldCheck className="h-6 w-6 text-emerald-500" /> : <ShieldAlert className="h-6 w-6 text-orange-500" />} التحقق الثنائي (2FA)</h1>
        <p className="mb-4 text-sm text-ink-soft">
          {verified.length ? 'مفعّل — سيُطلب رمز من تطبيق المصادقة عند كل تسجيل دخول.' : 'غير مفعّل. ننصح بتفعيله' + (isStaff || isMerchant ? ' وهو مطلوب لحسابات الإدارة وأصحاب المتاجر.' : '.')}
        </p>
        {!verified.length && !enroll && <Button onClick={startEnroll}>تفعيل التحقق الثنائي</Button>}
        {enroll && (
          <div className="grid gap-5 md:grid-cols-[200px_minmax(0,1fr)]">
            {/* QR من Supabase بصيغة data:image/svg */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enroll.qr} alt="رمز QR" className="h-48 w-48 rounded-2xl bg-white p-2 ring-1 ring-slate-200" />
            <div className="space-y-3">
              <p className="text-sm">1. امسح الرمز بتطبيق Google Authenticator أو Authy.</p>
              <p className="text-xs text-ink-muted">أو أدخل المفتاح يدويًا: <code dir="ltr" className="rounded bg-slate-100 px-1">{enroll.secret}</code></p>
              <Field label="2. أدخل الرمز المكوّن من 6 أرقام"><Input dir="ltr" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="w-40 text-center tracking-widest" /></Field>
              <Button loading={busy} disabled={code.length !== 6} onClick={verify}>تأكيد التفعيل</Button>
            </div>
          </div>
        )}
      </div>
      <div className="tile p-4 md:p-6">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-extrabold"><KeyRound className="h-6 w-6 text-brand-500" /> تغيير كلمة المرور</h2>
        <div className="flex max-w-md gap-2"><Input type="password" dir="ltr" autoComplete="new-password" placeholder="كلمة المرور الجديدة" value={pw} onChange={(e) => setPw(e.target.value)} /><Button loading={busy} onClick={changePassword}>حفظ</Button></div>
      </div>
    </div>
  );
}
