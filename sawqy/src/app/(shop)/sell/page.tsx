'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart3, PackagePlus, Rocket, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useSession } from '@/hooks/use-session';
import { storeSchema, firstError } from '@/lib/validation';
import { errorMessage, slugify } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { IconTile } from '@/components/ui/misc';

export default function SellPage() {
  const router = useRouter();
  const { refresh } = useSession();
  const [cities, setCities] = useState<{ id: number; name_ar: string; governorates: { name_ar: string } }[]>([]);
  const [f, setF] = useState({ name: '', slug: '', phone: '', city_id: '', description: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getSupabase().from('cities').select('id,name_ar,governorates(name_ar)').order('governorate_id').then(({ data }) => setCities((data as never) ?? []));
  }, []);

  async function submit() {
    const parsed = storeSchema.safeParse(f);
    if (!parsed.success) return toast.error(firstError(parsed));
    setBusy(true);
    const { error } = await getSupabase().rpc('become_seller', { p_name: parsed.data.name, p_slug: parsed.data.slug, p_phone: parsed.data.phone, p_city: parsed.data.city_id, p_description: parsed.data.description || null });
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    toast.success('تم إرسال طلبك! سنراجعه قريبًا.');
    await refresh();
    router.push('/merchant');
  }

  return (
    <div className="container grid gap-8 py-10 lg:grid-cols-2">
      <div>
        <h1 className="text-4xl font-extrabold leading-tight">ابدأ البيع على <span className="text-gradient">سوقي</span></h1>
        <p className="mt-4 text-lg text-ink-soft">افتح متجرك خلال دقائق، وصل لآلاف العملاء في كل المحافظات، ونحن نتولى السلة والدفع والتوصيل.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {[
            { i: <PackagePlus />, t: 'إدارة سهلة للمنتجات', c: '#0EA5A8' }, { i: <BarChart3 />, t: 'تحليلات المبيعات', c: '#8B5CF6' },
            { i: <Wallet />, t: 'تسويات شفافة', c: '#F97316' }, { i: <Rocket />, t: 'ظهور في السوق الموحد', c: '#0B7C7E' },
          ].map((x) => <div key={x.t} className="card flex items-center gap-3 p-4"><IconTile color={x.c}>{x.i}</IconTile><b className="text-sm">{x.t}</b></div>)}
        </div>
      </div>
      <div className="card space-y-4 p-6">
        <h2 className="text-xl font-bold">بيانات المتجر</h2>
        <Field label="اسم المتجر"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="رابط المتجر (بالإنجليزية)" hint={`sawqy.com/s/${f.slug || 'my-store'}`}>
          <Input dir="ltr" className="text-left" value={f.slug} onChange={(e) => setF({ ...f, slug: slugify(e.target.value) })} placeholder="my-store" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="هاتف المتجر"><Input dir="ltr" className="text-left" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="المدينة"><Select value={f.city_id} onChange={(e) => setF({ ...f, city_id: e.target.value })}><option value="">اختر</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.governorates?.name_ar} — {c.name_ar}</option>)}</Select></Field>
        </div>
        <Field label="نبذة عن المتجر"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={2000} /></Field>
        <Button className="w-full" size="lg" loading={busy} onClick={submit}>إرسال طلب الانضمام</Button>
        <p className="text-center text-xs text-ink-muted">تتم مراجعة كل متجر من فريق الإدارة قبل التفعيل.</p>
      </div>
    </div>
  );
}
