'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSession } from '@/hooks/use-session';
import { getSupabase } from '@/lib/supabase/client';
import { errorMessage } from '@/lib/utils';
import { phoneSchema } from '@/lib/validation';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { usePublicSettings, useCurrencyStore } from '@/hooks/use-settings';

export default function ProfilePage() {
  const { user, ctx, refresh } = useSession();
  const [f, setF] = useState({ full_name: '', phone: '' });
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (ctx?.profile) setF({ full_name: ctx.profile.full_name ?? '', phone: ctx.profile.phone ?? '' }); }, [ctx?.profile]);

  async function save() {
    if (f.full_name.trim().length < 2) return toast.error('الاسم قصير');
    if (f.phone && !phoneSchema.safeParse(f.phone).success) return toast.error('رقم هاتف غير صالح');
    setSaving(true);
    const { error } = await getSupabase().from('profiles').update({ full_name: f.full_name.trim(), phone: f.phone.trim() || null }).eq('id', user!.id);
    setSaving(false);
    if (error) return toast.error(errorMessage(error));
    toast.success('تم الحفظ'); refresh();
  }
  return (
    <div className="tile p-4 md:p-6">
      <h1 className="mb-5 text-xl font-semibold md:text-2xl">الملف الشخصي</h1>
      <div className="grid max-w-xl gap-4">
        <Field label="البريد الإلكتروني"><Input value={user?.email ?? ''} disabled dir="ltr" className="text-left" /></Field>
        <Field label="الاسم الكامل"><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
        <Field label="رقم الهاتف"><Input dir="ltr" className="text-left" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Button className="w-full sm:w-fit" loading={saving} onClick={save}>حفظ التغييرات</Button>
        <CurrencyPicker />
      </div>
    </div>
  );
}

/** عملة عرض الأسعار — الدفع والمحاسبة تبقى بالريال اليمني */
function CurrencyPicker() {
  const { currencies } = usePublicSettings();
  const { code, setCode } = useCurrencyStore();
  const { user } = useSession();
  if (currencies.length < 2) return null;
  return (
    <Field label="عملة عرض الأسعار" hint="للعرض التقريبي فقط؛ تُحسب الطلبات وتُدفع بالريال اليمني.">
      <Select value={code} onChange={async (e) => {
        setCode(e.target.value);
        if (user) await getSupabase().from('profiles').update({ currency: e.target.value }).eq('id', user.id);
      }}>
        {currencies.map((c) => <option key={c.code} value={c.code}>{c.name_ar} ({c.symbol})</option>)}
      </Select>
    </Field>
  );
}
