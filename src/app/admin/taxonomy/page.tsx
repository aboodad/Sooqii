'use client';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { errorMessage, slugify } from '@/lib/utils';
import { PageHeader } from '@/components/dashboard/shell';
import { Table, Td } from '@/components/dashboard/widgets';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, Input, Select } from '@/components/ui/field';
import { Modal } from '@/components/ui/misc';
import { DynamicIcon, ICON_NAMES } from '@/components/ui/dynamic-icon';

type Cat = { id: number; parent_id: number | null; name_ar: string; slug: string; icon: string; color: string; sort: number; is_active: boolean };

export default function Taxonomy() {
  const sb = getSupabase();
  const [edit, setEdit] = useState<Partial<Cat> | null>(null);
  const [brand, setBrand] = useState({ name: '', slug: '' });
  const cats = useQuery(async () => ((await sb.from('categories').select('*').order('sort')).data ?? []) as Cat[]);
  const brands = useQuery(async () => (await sb.from('brands').select('*').order('name')).data ?? []);

  async function saveCat() {
    if (!edit?.name_ar || !edit.slug) return toast.error('الاسم والرابط مطلوبان');
    const row = { name_ar: edit.name_ar, slug: edit.slug, icon: edit.icon ?? 'package', color: edit.color ?? '#0EA5A8', sort: Number(edit.sort ?? 0), parent_id: edit.parent_id || null, is_active: edit.is_active ?? true };
    const { error } = edit.id ? await sb.from('categories').update(row).eq('id', edit.id) : await sb.from('categories').insert(row);
    if (error) return toast.error(error.code === '23505' ? 'الرابط مستخدم' : errorMessage(error));
    toast.success('تم الحفظ'); setEdit(null); cats.reload();
  }
  async function addBrand() {
    if (!brand.name || !brand.slug) return;
    const { error } = await sb.from('brands').insert(brand);
    if (error) return toast.error(errorMessage(error));
    setBrand({ name: '', slug: '' }); brands.reload();
  }
  const top = (cats.data ?? []).filter((c) => !c.parent_id);
  return (
    <div className="space-y-8">
      <PageHeader title="التصنيفات والعلامات" actions={<Button onClick={() => setEdit({ icon: 'package', color: '#0EA5A8', sort: 0, is_active: true })}><Plus className="h-4 w-4" /> تصنيف</Button>} />
      <Table head={['التصنيف', 'الرابط', 'الأب', 'الترتيب', 'الحالة', '']} empty={!cats.data?.length}>
        {cats.data?.map((c) => (
          <tr key={c.id}>
            <Td><span className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg text-white" style={{ background: c.color }}><DynamicIcon name={c.icon} className="h-4 w-4" /></span><b>{c.name_ar}</b></span></Td>
            <Td dir="ltr" className="text-xs">{c.slug}</Td><Td>{top.find((t) => t.id === c.parent_id)?.name_ar ?? '—'}</Td><Td>{c.sort}</Td>
            <Td><Badge tone={c.is_active ? 'green' : 'gray'}>{c.is_active ? 'ظاهر' : 'مخفي'}</Badge></Td>
            <Td><Button size="sm" variant="ghost" onClick={() => setEdit(c)}>تعديل</Button></Td>
          </tr>
        ))}
      </Table>
      <div className="card p-5">
        <h2 className="mb-3 font-bold">العلامات التجارية</h2>
        <div className="mb-4 flex flex-wrap gap-2">{brands.data?.map((b) => <Badge key={b.id} tone="teal">{b.name}</Badge>)}</div>
        <div className="flex max-w-lg gap-2"><Input placeholder="الاسم" value={brand.name} onChange={(e) => setBrand({ ...brand, name: e.target.value })} /><Input dir="ltr" placeholder="slug" value={brand.slug} onChange={(e) => setBrand({ ...brand, slug: slugify(e.target.value) })} /><Button onClick={addBrand}>إضافة</Button></div>
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'تعديل تصنيف' : 'تصنيف جديد'}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الاسم"><Input value={edit?.name_ar ?? ''} onChange={(e) => setEdit({ ...edit, name_ar: e.target.value })} /></Field>
          <Field label="الرابط"><Input dir="ltr" value={edit?.slug ?? ''} onChange={(e) => setEdit({ ...edit, slug: slugify(e.target.value) })} /></Field>
          <Field label="التصنيف الأب"><Select value={edit?.parent_id ?? ''} onChange={(e) => setEdit({ ...edit, parent_id: e.target.value ? Number(e.target.value) : null })}><option value="">رئيسي</option>{top.filter((t) => t.id !== edit?.id).map((t) => <option key={t.id} value={t.id}>{t.name_ar}</option>)}</Select></Field>
          <Field label="الترتيب"><Input type="number" value={edit?.sort ?? 0} onChange={(e) => setEdit({ ...edit, sort: Number(e.target.value) })} /></Field>
          <Field label="الأيقونة"><Select value={edit?.icon ?? 'package'} onChange={(e) => setEdit({ ...edit, icon: e.target.value })}>{ICON_NAMES.map((i) => <option key={i} value={i}>{i}</option>)}</Select></Field>
          <Field label="اللون"><Input type="color" className="h-11 p-1" value={edit?.color ?? '#0EA5A8'} onChange={(e) => setEdit({ ...edit, color: e.target.value })} /></Field>
          <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-500" checked={edit?.is_active ?? true} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} /> ظاهر للعملاء</label>
        </div>
        <Button className="mt-4 w-full" onClick={saveCat}>حفظ</Button>
      </Modal>
    </div>
  );
}
