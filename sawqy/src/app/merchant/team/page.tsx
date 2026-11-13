'use client';
import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useMerchant } from '@/hooks/use-merchant';
import { useQuery } from '@/hooks/use-query';
import { errorMessage } from '@/lib/utils';
import { PageHeader } from '@/components/dashboard/shell';
import { Table, Td } from '@/components/dashboard/widgets';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, Input, Select } from '@/components/ui/field';
import { Modal, Skeleton } from '@/components/ui/misc';

const PERMS: Record<string, string> = { orders: 'الطلبات', products: 'المنتجات', inventory: 'المخزون', pricing: 'الأسعار والخصومات', finance: 'المالية', stories: 'الاستوري' };
const ROLES: Record<string, string> = { owner: 'المالك', manager: 'مدير', staff: 'موظف' };

export default function Team() {
  const sb = getSupabase();
  const { store } = useMerchant();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ email: '', role: 'staff', perms: ['orders'] as string[] });
  const { data, loading, error, reload } = useQuery(async () => {
    if (!store) return [];
    const { data, error } = await sb.rpc('store_team', { p_store: store.id });
    if (error) throw error;
    return data as { id: number; role: string; permissions: string[]; is_active: boolean; name: string; email: string }[];
  }, [store?.id]);

  async function invite() {
    const { error } = await sb.rpc('invite_store_member', { p_store: store!.id, p_email: f.email, p_role: f.role, p_permissions: f.perms });
    if (error) return toast.error(errorMessage(error));
    toast.success('تمت الإضافة'); setOpen(false); reload();
  }
  if (error) return <p className="card p-6 text-ink-soft">إدارة الفريق متاحة لمالك المتجر ومديره فقط.</p>;
  return (
    <div>
      <PageHeader title="فريق المتجر" subtitle="امنح موظفيك صلاحيات دقيقة. الموظف لا يرى المبالغ المالية إلا بصلاحية المالية." actions={<Button onClick={() => setOpen(true)}><UserPlus className="h-4 w-4" /> إضافة عضو</Button>} />
      {loading ? <Skeleton className="h-40" /> : (
        <Table head={['العضو', 'الدور', 'الصلاحيات', 'الحالة', '']} empty={!data?.length}>
          {data?.map((m) => (
            <tr key={m.id}>
              <Td><p className="font-semibold">{m.name}</p><p className="text-xs text-ink-muted" dir="ltr">{m.email}</p></Td>
              <Td>{ROLES[m.role]}</Td>
              <Td><div className="flex flex-wrap gap-1">{m.role === 'staff' ? m.permissions.map((p) => <Badge key={p} tone="teal">{PERMS[p] ?? p}</Badge>) : <Badge tone="violet">كل الصلاحيات</Badge>}</div></Td>
              <Td><Badge tone={m.is_active ? 'green' : 'gray'} dot>{m.is_active ? 'نشط' : 'معطّل'}</Badge></Td>
              <Td>{m.role !== 'owner' && <Button size="sm" variant="ghost" onClick={async () => { const { error } = await sb.rpc('set_store_member_active', { p_member: m.id, p_active: !m.is_active }); if (error) toast.error(errorMessage(error)); else reload(); }}>{m.is_active ? 'تعطيل' : 'تفعيل'}</Button>}</Td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="إضافة عضو للفريق">
        <div className="space-y-3">
          <Field label="البريد الإلكتروني (يجب أن يكون مسجلًا في سوقي)"><Input dir="ltr" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="الدور"><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="staff">موظف</option><option value="manager">مدير</option></Select></Field>
          {f.role === 'staff' && (
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(PERMS).map(([k, l]) => (
                <label key={k} className="flex items-center gap-2 rounded-xl bg-slate-50 p-2.5 text-sm">
                  <input type="checkbox" className="accent-brand-500" checked={f.perms.includes(k)} onChange={(e) => setF({ ...f, perms: e.target.checked ? [...f.perms, k] : f.perms.filter((x) => x !== k) })} />{l}
                </label>
              ))}
            </div>
          )}
          <Button className="w-full" onClick={invite}>إضافة</Button>
        </div>
      </Modal>
    </div>
  );
}
