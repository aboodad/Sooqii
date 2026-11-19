'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Boxes, MapPin, Plus, Search, Truck, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { ROLE_LABEL } from '@/lib/status';
import { errorMessage } from '@/lib/utils';
import { PageHeader } from '@/components/dashboard/shell';
import { Table, Td, Tabs } from '@/components/dashboard/widgets';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, Input, Select } from '@/components/ui/field';
import { Modal, Skeleton } from '@/components/ui/misc';

type Loc = { id: number; type: string; name: string; governorate_id: number | null; city_id: number | null; address: string | null; phone: string | null; hours: string | null; is_active: boolean; governorates: { name_ar: string } | null };
const TYPE: Record<string, string> = { hub: 'مركز تجميع رئيسي', branch: 'فرع محافظة', pickup: 'نقطة استلام' };
const EMPTY = { id: null as number | null, type: 'pickup', name: '', governorate_id: '', address: '', phone: '', hours: '', is_active: true };

export default function Logistics() {
  const sb = getSupabase();
  const [tab, setTab] = useState('locations');
  const [edit, setEdit] = useState<typeof EMPTY | null>(null);
  const [busy, setBusy] = useState(false);
  const locs = useQuery(async () => ((await sb.from('locations').select('*, governorates(name_ar)').order('type').order('name')).data ?? []) as unknown as Loc[]);
  const govs = useQuery(async () => ((await sb.from('governorates').select('id,name_ar').order('sort')).data ?? []) as { id: number; name_ar: string }[]);

  async function saveLoc() {
    if (!edit) return;
    if (edit.name.trim().length < 2) return toast.error('أدخل الاسم');
    if (edit.phone && !/^[0-9+ ]{7,20}$/.test(edit.phone)) return toast.error('رقم هاتف غير صالح');
    setBusy(true);
    const { error } = await sb.rpc('admin_save_location', {
      p_id: edit.id, p_type: edit.type, p_name: edit.name.trim(), p_gov: edit.governorate_id ? Number(edit.governorate_id) : null, p_city: null,
      p_address: edit.address, p_phone: edit.phone, p_hours: edit.hours, p_active: edit.is_active,
    });
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    toast.success('تم الحفظ'); setEdit(null); locs.reload();
  }

  return (
    <div>
      <PageHeader title="اللوجستيات والمندوبون" subtitle="المراكز والفروع ونقاط الاستلام، وفريق التوصيل. فعّل مسار المركز ونقاط الاستلام من صفحة الإعدادات."
        actions={<Link href="/hub"><Button variant="outline"><Boxes className="h-4 w-4" /> فتح تطبيق المركز</Button></Link>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ v: 'locations', l: 'المواقع' }, { v: 'team', l: 'فريق التوصيل والمركز' }]} />
      {tab === 'locations' ? (
        <>
          <div className="mb-3 flex justify-end"><Button onClick={() => setEdit({ ...EMPTY })}><Plus className="h-4 w-4" /> موقع جديد</Button></div>
          {locs.loading ? <Skeleton className="h-48" /> : (
            <Table head={['الاسم', 'النوع', 'المحافظة', 'الهاتف', 'الدوام', 'الحالة', '']} empty={!locs.data?.length}>
              {locs.data?.map((l) => (
                <tr key={l.id}>
                  <Td className="font-semibold"><MapPin className="ml-1 inline h-4 w-4 text-brand-600" />{l.name}{l.address && <span className="block text-xs font-normal text-ink-muted">{l.address}</span>}</Td>
                  <Td>{TYPE[l.type]}</Td><Td>{l.governorates?.name_ar ?? '—'}</Td><Td dir="ltr">{l.phone ?? '—'}</Td><Td className="text-xs">{l.hours ?? '—'}</Td>
                  <Td>{l.is_active ? <Badge tone="green">نشط</Badge> : <Badge>متوقف</Badge>}</Td>
                  <Td><Button size="sm" variant="ghost" onClick={() => setEdit({ id: l.id, type: l.type, name: l.name, governorate_id: l.governorate_id ? String(l.governorate_id) : '', address: l.address ?? '', phone: l.phone ?? '', hours: l.hours ?? '', is_active: l.is_active })}>تعديل</Button></Td>
                </tr>
              ))}
            </Table>
          )}
        </>
      ) : <Team />}

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'تعديل موقع' : 'موقع جديد'}>
        {edit && (
          <div className="space-y-3">
            <Field label="النوع"><Select value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}>{Object.entries(TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="الاسم"><Input maxLength={80} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="المحافظة" hint="الفرع يخدم طلبات محافظته؛ وإلا تُوجَّه للمركز الرئيسي."><Select value={edit.governorate_id} onChange={(e) => setEdit({ ...edit, governorate_id: e.target.value })}>
              <option value="">—</option>{govs.data?.map((g) => <option key={g.id} value={g.id}>{g.name_ar}</option>)}</Select></Field>
            <Field label="العنوان"><Input maxLength={300} value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="الهاتف"><Input dir="ltr" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
              <Field label="أوقات الدوام"><Input maxLength={120} value={edit.hours} onChange={(e) => setEdit({ ...edit, hours: e.target.value })} /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} /> نشط</label>
            <Button className="w-full" loading={busy} onClick={saveLoc}>حفظ</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Team() {
  const sb = getSupabase();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const team = useQuery(async () => {
    const { data } = await sb.from('user_roles').select('user_id, role, profiles(full_name, phone)').in('role', ['courier', 'hub', 'operations']);
    return (data ?? []) as unknown as { user_id: string; role: string; profiles: { full_name: string | null; phone: string | null } | null }[];
  });
  const found = useQuery(async () => {
    if (query.trim().length < 2) return [];
    const { data, error } = await sb.rpc('admin_list_users', { p_q: query, p_limit: 10, p_offset: 0 });
    if (error) throw error;
    return data.items as { id: string; full_name: string | null; email: string; roles: string[] }[];
  }, [query]);

  async function setRole(user: string, role: string, grant: boolean) {
    const { error } = await sb.rpc('admin_set_role', { p_user: user, p_role: role, p_grant: grant });
    if (error) return toast.error(errorMessage(error));
    toast.success(grant ? 'تمت الإضافة' : 'أُزيل الدور'); team.reload(); found.reload();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h2 className="mb-3 flex items-center gap-2 font-bold"><Truck className="h-5 w-5 text-brand-600" /> الفريق الحالي</h2>
        <Table head={['الاسم', 'الدور', '']} empty={!team.data?.length}>
          {team.data?.map((t) => (
            <tr key={`${t.user_id}-${t.role}`}><Td>{t.profiles?.full_name ?? '—'}<span className="block text-xs text-ink-muted" dir="ltr">{t.profiles?.phone}</span></Td><Td>{ROLE_LABEL[t.role]}</Td>
              <Td><Button size="sm" variant="ghost" onClick={() => setRole(t.user_id, t.role, false)}>إزالة</Button></Td></tr>
          ))}
        </Table>
      </div>
      <div className="card p-5">
        <h2 className="mb-3 flex items-center gap-2 font-bold"><UserPlus className="h-5 w-5 text-brand-600" /> إضافة عضو</h2>
        <p className="mb-3 text-xs text-ink-muted">يسجّل المندوب حسابًا عاديًا أولًا، ثم ابحث عنه بالبريد أو الاسم وامنحه الدور.</p>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setQuery(q); }}>
          <Input placeholder="البريد أو الاسم" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button type="submit" size="icon" aria-label="بحث"><Search className="h-4 w-4" /></Button>
        </form>
        <div className="mt-3 divide-y divide-slate-100">
          {found.data?.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
              <div className="min-w-0 flex-1"><p className="font-semibold">{u.full_name ?? '—'}</p><p className="truncate text-xs text-ink-muted" dir="ltr">{u.email}</p></div>
              {(['courier', 'hub'] as const).map((r) => (
                <Button key={r} size="sm" variant={u.roles.includes(r) ? 'soft' : 'outline'} onClick={() => setRole(u.id, r, !u.roles.includes(r))}>
                  {u.roles.includes(r) ? '✓ ' : '+ '}{ROLE_LABEL[r]}
                </Button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
