'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { errorMessage } from '@/lib/utils';
import { PageHeader } from '@/components/dashboard/shell';
import { Table, Td } from '@/components/dashboard/widgets';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { PlatformSettings } from './platform-settings';

const SETTINGS: Record<string, string> = { public_default_shipping: 'رسوم الشحن الافتراضية', public_free_shipping_min: 'حد الشحن المجاني', public_return_days: 'مهلة الإرجاع (أيام)' };

export default function AdminSettings() {
  const sb = getSupabase();
  const [rates, setRates] = useState<Record<number, { fee: string; min: string; max: string }>>({});
  const ship = useQuery(async () => ((await sb.from('shipping_rates').select('governorate_id,fee,eta_days_min,eta_days_max, governorates(name_ar,sort)')).data ?? []) as unknown as { governorate_id: number; fee: number; eta_days_min: number; eta_days_max: number; governorates: { name_ar: string; sort: number } }[]);
  const settings = useQuery(async () => (await sb.from('app_settings').select('key,value')).data ?? []);
  const [vals, setVals] = useState<Record<string, string>>({});

  async function saveRate(id: number) {
    const r = rates[id];
    const row = { fee: Number(r.fee), eta_days_min: Number(r.min), eta_days_max: Number(r.max) };
    if (row.fee < 0 || row.eta_days_max < row.eta_days_min) return toast.error('قيم غير صالحة');
    const { error } = await sb.from('shipping_rates').update(row).eq('governorate_id', id);
    if (error) return toast.error(errorMessage(error));
    toast.success('تم'); ship.reload();
  }
  async function saveSetting(key: string) {
    const v = Number(vals[key]);
    if (!Number.isFinite(v) || v < 0) return toast.error('رقم غير صالح');
    const { error } = await sb.from('app_settings').update({ value: v, updated_at: new Date().toISOString() }).eq('key', key);
    if (error) return toast.error(errorMessage(error));
    toast.success('تم'); settings.reload();
  }
  return (
    <div className="space-y-8">
      <PageHeader title="الشحن والإعدادات" />
      <PlatformSettings />
      <div className="card grid gap-4 p-5 md:grid-cols-3">
        {Object.entries(SETTINGS).map(([k, l]) => (
          <Field key={k} label={l}>
            <div className="flex gap-2"><Input inputMode="numeric" placeholder={String(settings.data?.find((s) => s.key === k)?.value ?? '')} value={vals[k] ?? ''} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} /><Button size="sm" onClick={() => saveSetting(k)}>حفظ</Button></div>
          </Field>
        ))}
      </div>
      <Table head={['المحافظة', 'رسوم الشحن', 'أقل مدة (أيام)', 'أقصى مدة', '']}>
        {ship.data?.sort((a, b) => a.governorates.sort - b.governorates.sort).map((r) => {
          const e = rates[r.governorate_id] ?? { fee: String(r.fee), min: String(r.eta_days_min), max: String(r.eta_days_max) };
          const set = (patch: Partial<typeof e>) => setRates({ ...rates, [r.governorate_id]: { ...e, ...patch } });
          return (
            <tr key={r.governorate_id}>
              <Td className="font-semibold">{r.governorates.name_ar}</Td>
              <Td><input className="input h-9 w-28 py-1" value={e.fee} onChange={(x) => set({ fee: x.target.value.replace(/\D/g, '') })} /></Td>
              <Td><input className="input h-9 w-20 py-1" value={e.min} onChange={(x) => set({ min: x.target.value.replace(/\D/g, '') })} /></Td>
              <Td><input className="input h-9 w-20 py-1" value={e.max} onChange={(x) => set({ max: x.target.value.replace(/\D/g, '') })} /></Td>
              <Td>{rates[r.governorate_id] && <Button size="sm" onClick={() => saveRate(r.governorate_id)}>حفظ</Button>}</Td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}
