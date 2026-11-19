'use client';
import { useState } from 'react';
import { MapPin, Plus, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import type { Address } from '@/lib/types';
import { AddressForm } from '@/components/account/address-form';
import { Button } from '@/components/ui/button';
import { EmptyState, Modal, Skeleton } from '@/components/ui/misc';

export default function AddressesPage() {
  const sb = getSupabase();
  const [open, setOpen] = useState(false);
  const { data, loading, reload } = useQuery(async () => {
    const { data } = await sb.from('addresses').select('*, cities(name_ar, governorates(name_ar))').is('archived_at', null).order('created_at', { ascending: false });
    return (data as Address[]) ?? [];
  });
  // الحذف أرشفة (لا حذف فعلي للسجلات)
  async function archive(id: string) {
    const { error } = await sb.from('addresses').update({ archived_at: new Date().toISOString() }).eq('id', id);
    if (error) toast.error('تعذر الحذف'); else reload();
  }
  async function makeDefault(id: string) {
    await sb.from('addresses').update({ is_default: false }).neq('id', id);
    await sb.from('addresses').update({ is_default: true }).eq('id', id);
    reload();
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-xl font-semibold md:text-2xl">العناوين</h1><Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> عنوان جديد</Button></div>
      {loading ? <Skeleton className="h-40" /> : !data?.length ? (
        <div className="card"><EmptyState icon={<MapPin />} title="لا توجد عناوين" text="أضف عنوانًا لتسريع إتمام طلباتك." /></div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.map((a) => (
            <div key={a.id} className="card p-4">
              <div className="flex items-start justify-between">
                <p className="font-bold">{a.label} {a.is_default && <span className="mr-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] text-brand-700">افتراضي</span>}</p>
                <div className="flex gap-1">
                  {!a.is_default && <button onClick={() => makeDefault(a.id)} className="rounded-lg p-1.5 text-ink-muted hover:bg-slate-100" aria-label="اجعله افتراضيًا"><Star className="h-4 w-4" /></button>}
                  <button onClick={() => archive(a.id)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50" aria-label="حذف"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              <p className="mt-1 text-sm">{a.recipient_name} · <span dir="ltr">{a.phone}</span></p>
              <p className="text-sm text-ink-soft">{a.cities?.governorates?.name_ar}، {a.cities?.name_ar}{a.district ? `، ${a.district}` : ''}{a.street ? `، ${a.street}` : ''}</p>
            </div>
          ))}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="عنوان جديد" wide><AddressForm onSaved={() => { setOpen(false); reload(); }} /></Modal>
    </div>
  );
}
