'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { errorMessage } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setError('كلمة المرور 8 أحرف على الأقل');
    if (pw !== pw2) return setError('كلمتا المرور غير متطابقتين');
    setLoading(true);
    const { error } = await getSupabase().auth.updateUser({ password: pw });
    setLoading(false);
    if (error) return setError(errorMessage(error));
    toast.success('تم تحديث كلمة المرور');
    router.replace('/account');
  }
  return (
    <form onSubmit={submit} className="space-y-5">
      <h1 className="text-3xl font-extrabold">كلمة مرور جديدة</h1>
      <Field label="كلمة المرور الجديدة"><Input type="password" autoComplete="new-password" dir="ltr" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
      <Field label="تأكيد كلمة المرور"><Input type="password" autoComplete="new-password" dir="ltr" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      <Button className="w-full" size="lg" loading={loading}>حفظ</Button>
    </form>
  );
}
