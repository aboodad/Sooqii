'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Mail, Lock, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { loginSchema, firstError } from '@/lib/validation';
import { authRedirect, errorMessage, safeNext } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const linkError = params.get('error') === 'link';
  const [form, setForm] = useState({ email: '', password: '' });
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mfa, setMfa] = useState<{ factorId: string } | null>(null);
  const [code, setCode] = useState('');
  const [unconfirmed, setUnconfirmed] = useState(false);

  async function resend() {
    setLoading(true);
    try {
      const { error } = await getSupabase().auth.resend({ type: 'signup', email: form.email.trim(), options: { emailRedirectTo: authRedirect(next) } });
      if (error) setError(errorMessage(error)); else { toast.success('أُعيد إرسال رابط التفعيل إلى بريدك'); setUnconfirmed(false); }
    } finally { setLoading(false); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = loginSchema.safeParse(form);
    if (!parsed.success) return setError(firstError(parsed));
    setLoading(true); setError(null); setUnconfirmed(false);
    const sb = getSupabase();
    try {
      const { error } = await sb.auth.signInWithPassword({ email: parsed.data.email.trim(), password: parsed.data.password });
      if (error) {
        if (/Email not confirmed/i.test(error.message)) setUnconfirmed(true);
        setLoading(false);
        return setError(errorMessage(error));
      }
      // التحقق الثنائي إن كان مفعّلًا
      const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
        const { data: f } = await sb.auth.mfa.listFactors();
        const totp = f?.totp?.[0];
        if (totp) { setMfa({ factorId: totp.id }); setLoading(false); return; }
      }
      toast.success('مرحبًا بعودتك');
      router.replace(next); router.refresh();
    } catch (err) {
      setLoading(false);
      setError(errorMessage(err));
    }
  }

  async function verifyMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!mfa) return;
    setLoading(true);
    const sb = getSupabase();
    try {
      const { data: ch, error: e1 } = await sb.auth.mfa.challenge({ factorId: mfa.factorId });
      if (e1) return setError(errorMessage(e1));
      const { error: e2 } = await sb.auth.mfa.verify({ factorId: mfa.factorId, challengeId: ch.id, code: code.trim() });
      if (e2) return setError('رمز التحقق غير صحيح');
      router.replace(next); router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (mfa) {
    return (
      <form onSubmit={verifyMfa} className="space-y-5">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600"><ShieldCheck className="h-7 w-7" /></div>
        <h1 className="text-3xl font-extrabold">التحقق الثنائي</h1>
        <p className="text-ink-soft">أدخل الرمز من تطبيق المصادقة.</p>
        <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="text-center text-2xl tracking-[.5em]" dir="ltr" autoFocus />
        {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
        <Button className="w-full" size="lg" loading={loading} disabled={code.length !== 6}>تحقق</Button>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div>
        <h1 className="text-[28px] font-bold md:text-4xl">مرحبًا بك في سوقي</h1>
        <p className="mt-2 text-ink-soft">سجّل دخولك لمتابعة طلباتك وسلتك ومتاجرك المفضلة.</p>
      </div>
      <Field label="البريد الإلكتروني">
        <div className="relative">
          <Mail className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <Input type="email" autoComplete="email" dir="ltr" className="pr-10 text-left" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
      </Field>
      <Field label="كلمة المرور">
        <div className="relative">
          <Lock className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <Input type={show ? 'text' : 'password'} autoComplete="current-password" dir="ltr" className="px-10 text-left" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <button type="button" onClick={() => setShow((v) => !v)} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-label="إظهار كلمة المرور">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
        </div>
      </Field>
      <div className="flex justify-end"><Link href="/auth/forgot" className="text-sm font-semibold text-brand-600">نسيت كلمة المرور؟</Link></div>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      {linkError && !error && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-700">انتهت صلاحية الرابط أو فُتح من متصفح آخر. إن كنت أكّدت بريدك فسجّل الدخول مباشرة، وإلا أعد طلب رابط جديد.</p>}
      {unconfirmed && <button type="button" onClick={resend} disabled={loading} className="w-full rounded-xl border border-brand-200 p-2.5 text-sm font-bold text-brand-700 hover:bg-brand-50">إعادة إرسال رابط التفعيل</button>}
      <Button className="h-14 w-full rounded-2xl text-base" variant="accent" loading={loading}>تسجيل الدخول</Button>
      <div className="flex items-center gap-3 text-xs text-ink-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">أو</div>
      <Link href={`/auth/register?next=${encodeURIComponent(next)}`} className="flex h-14 items-center justify-center rounded-2xl bg-mist text-sm font-medium text-ink transition hover:bg-brand-50">إنشاء حساب جديد</Link>
      <p className="text-center text-sm text-ink-soft">تريد التصفح أولًا؟ <Link href="/" className="font-semibold text-brand-600">تابع كضيف</Link></p>
    </form>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
