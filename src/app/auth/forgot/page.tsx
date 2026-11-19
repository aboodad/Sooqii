'use client';
import Link from 'next/link';
import { useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { authRedirect } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

export default function ForgotPage() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await getSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo: authRedirect('/auth/update-password') });
    } catch { /* نفس الرسالة دائمًا */ }
    setLoading(false); setDone(true); // نفس الرسالة دائمًا لمنع كشف وجود الحساب
  }
  return done ? (
    <div><h1 className="text-2xl font-extrabold">تم الإرسال</h1><p className="mt-2 text-ink-soft">إن كان البريد مسجلًا فستصلك رسالة لإعادة تعيين كلمة المرور.</p><Link href="/auth/login" className="mt-4 inline-block font-bold text-brand-600">العودة</Link></div>
  ) : (
    <form onSubmit={submit} className="space-y-5">
      <h1 className="text-3xl font-extrabold">استعادة كلمة المرور</h1>
      <Field label="البريد الإلكتروني"><Input type="email" required dir="ltr" className="text-left" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Button className="w-full" size="lg" loading={loading}>إرسال رابط الاستعادة</Button>
    </form>
  );
}
