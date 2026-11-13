'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { addressSchema, firstError } from '@/lib/validation';
import { errorMessage } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { useSession } from '@/hooks/use-session';

type Gov = { id: number; name_ar: string; cities: { id: number; name_ar: string }[] };

export function AddressForm({ onSaved }: { onSaved: (id: string) => void }) {
  const { user } = useSession();
  const [govs, setGovs] = useState<Gov[]>([]);
  const [gov, setGov] = useState<number | ''>('');
  const [f, setF] = useState({ label: 'المنزل', recipient_name: '', phone: '', city_id: '', district: '', street: '', details: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getSupabase().from('governorates').select('id,name_ar,cities(id,name_ar)').eq('is_active', true).order('sort')
      .then(({ data }) => setGovs((data as Gov[]) ?? []));
  }, []);

  async function save() {
    const parsed = addressSchema.safeParse(f);
    if (!parsed.success) return toast.error(firstError(parsed));
    setLoading(true);
    const { data, error } = await getSupabase().from('addresses').insert({ ...parsed.data, user_id: user!.id }).select('id').single();
    setLoading(false);
    if (error) return toast.error(errorMessage(error));
    toast.success('تم حفظ العنوان');
    onSaved(data.id);
  }

  const cities = govs.find((g) => g.id === gov)?.cities ?? [];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="اسم المستلم"><Input value={f.recipient_name} onChange={(e) => setF({ ...f, recipient_name: e.target.value })} /></Field>
      <Field label="رقم الهاتف"><Input dir="ltr" inputMode="tel" className="text-left" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
      <Field label="المحافظة">
        <Select value={gov} onChange={(e) => { setGov(Number(e.target.value)); setF({ ...f, city_id: '' }); }}>
          <option value="">اختر المحافظة</option>{govs.map((g) => <option key={g.id} value={g.id}>{g.name_ar}</option>)}
        </Select>
      </Field>
      <Field label="المديرية / المدينة">
        <Select value={f.city_id} disabled={!gov} onChange={(e) => setF({ ...f, city_id: e.target.value })}>
          <option value="">اختر</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}
        </Select>
      </Field>
      <Field label="الحي"><Input value={f.district} onChange={(e) => setF({ ...f, district: e.target.value })} /></Field>
      <Field label="الشارع"><Input value={f.street} onChange={(e) => setF({ ...f, street: e.target.value })} /></Field>
      <Field label="تفاصيل إضافية (معلم قريب)" className="sm:col-span-2"><Input value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} /></Field>
      <Field label="تسمية العنوان"><Input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
      <div className="flex items-end"><Button className="w-full" loading={loading} onClick={save}>حفظ العنوان</Button></div>
    </div>
  );
}
