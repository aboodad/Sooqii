'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MailCheck } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { registerSchema, firstError } from '@/lib/validation';
import { authRedirect, errorMessage, safeNext } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

function RegisterForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const [form, setForm] = useState({ full_name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = registerSchema.safeParse(form);
    if (!parsed.success) return setError(firstError(parsed));
    setLoading(true); setError(null);
    try {
      const { data, error } = await getSupabase().auth.signUp({
        email: parsed.data.email.trim(), password: parsed.data.password,
        options: { data: { full_name: parsed.data.full_name }, emailRedirectTo: authRedirect(next) },
      });
      if (error) return setError(errorMessage(error));
      // Supabase يعيد مستخدمًا بلا هويات إذا كان البريد مسجلًا مسبقًا
      if (data.user && data.user.identities?.length === 0) return setError('هذا البريد مسجل مسبقًا، سجّل الدخول أو استعد كلمة المرور');
      if (data.session) { router.replace(next); router.refresh(); } else setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="text-center">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-glow"><MailCheck className="h-10 w-10" /></div>
        <h1 className="mt-6 text-2xl font-extrabold">تحقق من بريدك</h1>
        <p className="mt-2 text-ink-soft">أرسلنا رابط التفعيل إلى <b dir="ltr">{form.email}</b></p>
        <p className="mt-1 text-sm text-ink-muted">لم تصلك؟ تفقد مجلد الرسائل غير المرغوب فيها (Spam)، وافتح الرابط من نفس المتصفح.</p>
        <Link href="/auth/login" className="mt-6 inline-block font-bold text-brand-600">العودة لتسجيل الدخول</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div><h1 className="text-[28px] font-bold md:text-4xl">إنشاء حساب</h1><p className="mt-2 text-ink-soft">حساب واحد لكل متاجر سوقي. يستغرق دقيقة.</p></div>
      <Field label="الاسم الكامل"><Input autoComplete="name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
      <Field label="البريد الإلكتروني"><Input type="email" autoComplete="email" dir="ltr" className="text-left" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
      <Field label="كلمة المرور" hint="8 أحرف على الأقل"><Input type="password" autoComplete="new-password" dir="ltr" className="text-left" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      <Button className="h-14 w-full rounded-2xl text-base" variant="accent" loading={loading}>إنشاء الحساب</Button>
      <p className="text-center text-sm text-ink-soft">لديك حساب؟ <Link href="/auth/login" className="font-bold text-brand-600">سجّل الدخول</Link></p>
    </form>
  );
}
export default function RegisterPage() { return <Suspense><RegisterForm /></Suspense>; }
