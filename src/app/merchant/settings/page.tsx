'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useMerchant } from '@/hooks/use-merchant';
import { useSession } from '@/hooks/use-session';
import { errorMessage } from '@/lib/utils';
import { phoneSchema } from '@/lib/validation';
import { PageHeader } from '@/components/dashboard/shell';
import { ImageUploader } from '@/components/dashboard/image-uploader';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';

export default function StoreSettings() {
  const sb = getSupabase();
  const { store } = useMerchant();
  const { refresh } = useSession();
  const [f, setF] = useState({ description: '', phone: '', prep_time_hours: '24' });
  const [logo, setLogo] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!store) return;
    sb.from('stores').select('description,phone,prep_time_hours,logo_url').eq('id', store.id).single().then(({ data }) => {
      if (data) { setF({ description: data.description ?? '', phone: data.phone ?? '', prep_time_hours: String(data.prep_time_hours) }); setLogo(data.logo_url ? [data.logo_url] : []); }
    });
  }, [store, sb]);
  async function save() {
    if (f.phone && !phoneSchema.safeParse(f.phone).success) return toast.error('رقم غير صالح');
    const hours = Number(f.prep_time_hours);
    if (!(hours >= 1 && hours <= 240)) return toast.error('مدة التجهيز بين 1 و240 ساعة');
    setBusy(true);
    const { error } = await sb.from('stores').update({ description: f.description.slice(0, 2000) || null, phone: f.phone || null, prep_time_hours: hours, logo_url: logo[0] ?? null }).eq('id', store!.id);
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    toast.success('تم الحفظ'); refresh();
  }
  if (!store) return null;
  return (
    <div>
      <PageHeader title="ملف المتجر" subtitle="الاسم والرابط والعمولة تُدار من الإدارة" />
      <div className="card max-w-2xl space-y-4 p-6">
        <Field label="شعار المتجر"><ImageUploader storeId={store.id} bucket="store-assets" value={logo} onChange={(v) => setLogo(v.slice(-1))} max={1} /></Field>
        <Field label="نبذة"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={2000} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="الهاتف"><Input dir="ltr" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="مدة التجهيز (ساعات)"><Input inputMode="numeric" value={f.prep_time_hours} onChange={(e) => setF({ ...f, prep_time_hours: e.target.value.replace(/\D/g, '') })} /></Field>
        </div>
        <Button loading={busy} onClick={save}>حفظ</Button>
      </div>
    </div>
  );
}
