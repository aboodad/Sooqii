'use client';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { errorMessage } from '@/lib/utils';
import { PageHeader } from '@/components/dashboard/shell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, Input, Select } from '@/components/ui/field';
import { Modal } from '@/components/ui/misc';

type B = { id?: string; kind: string; title: string; subtitle: string | null; link: string | null; theme: string; sort: number; is_active: boolean };
const THEMES: Record<string, string> = { teal: 'from-brand-600 to-brand-400', orange: 'from-accent-600 to-accent-400', ink: 'from-brand-900 to-brand-700', violet: 'from-violet-600 to-fuchsia-500' };

export default function Content() {
  const sb = getSupabase();
  const [edit, setEdit] = useState<B | null>(null);
  const { data, reload } = useQuery(async () => ((await sb.from('content_blocks').select('*').order('kind').order('sort')).data ?? []) as B[]);
  async function save() {
    if (!edit?.title) return toast.error('العنوان مطلوب');
    if (edit.link && !edit.link.startsWith('/')) return toast.error('الرابط يجب أن يكون داخليًا ويبدأ بـ /');
    const { id, ...row } = edit;
    const { error } = id ? await sb.from('content_blocks').update(row).eq('id', id) : await sb.from('content_blocks').insert(row);
    if (error) return toast.error(errorMessage(error));
    toast.success('تم'); setEdit(null); reload();
  }
  return (
    <div>
      <PageHeader title="المحتوى والبانرات" subtitle="شرائح الواجهة الرئيسية والعروض الترويجية" actions={<Button onClick={() => setEdit({ kind: 'hero', title: '', subtitle: '', link: '/search', theme: 'teal', sort: 0, is_active: true })}><Plus className="h-4 w-4" /> بانر</Button>} />
      <div className="grid gap-4 md:grid-cols-2">
        {data?.map((b) => (
          <div key={b.id} className="card overflow-hidden">
            <div className={`bg-gradient-to-l p-5 text-white ${THEMES[b.theme]}`}><p className="text-xs opacity-80">{b.kind === 'hero' ? 'شريحة رئيسية' : 'عرض'}</p><h3 className="text-xl font-extrabold">{b.title}</h3><p className="text-sm opacity-90">{b.subtitle}</p></div>
            <div className="flex items-center gap-2 p-3">
              <Badge tone={b.is_active ? 'green' : 'gray'}>{b.is_active ? 'ظاهر' : 'مخفي'}</Badge><span className="text-xs text-ink-muted" dir="ltr">{b.link}</span>
              <Button size="sm" variant="ghost" className="mr-auto" onClick={() => setEdit(b)}>تعديل</Button>
              <button onClick={async () => { if (!confirm('حذف البانر؟')) return; await sb.from('content_blocks').delete().eq('id', b.id!); reload(); }} className="rounded-lg p-2 text-red-500 hover:bg-red-50" aria-label="حذف"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title="بانر">
        {edit && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="النوع"><Select value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}><option value="hero">شريحة رئيسية</option><option value="promo">عرض ترويجي</option></Select></Field>
            <Field label="اللون"><Select value={edit.theme} onChange={(e) => setEdit({ ...edit, theme: e.target.value })}><option value="teal">تركوازي</option><option value="orange">برتقالي</option><option value="ink">داكن</option><option value="violet">بنفسجي</option></Select></Field>
            <Field label="العنوان" className="col-span-2"><Input value={edit.title} maxLength={120} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            <Field label="الوصف" className="col-span-2"><Input value={edit.subtitle ?? ''} maxLength={300} onChange={(e) => setEdit({ ...edit, subtitle: e.target.value })} /></Field>
            <Field label="الرابط"><Input dir="ltr" value={edit.link ?? ''} onChange={(e) => setEdit({ ...edit, link: e.target.value })} /></Field>
            <Field label="الترتيب"><Input type="number" value={edit.sort} onChange={(e) => setEdit({ ...edit, sort: Number(e.target.value) })} /></Field>
            <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-500" checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} /> ظاهر</label>
          </div>
        )}
        <Button className="mt-4 w-full" onClick={save}>حفظ</Button>
      </Modal>
    </div>
  );
}
