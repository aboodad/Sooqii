'use client';
import { useState } from 'react';
import { Search, ShieldPlus } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { useSession } from '@/hooks/use-session';
import { formatDate } from '@/lib/format';
import { ROLE_LABEL } from '@/lib/status';
import { errorMessage } from '@/lib/utils';
import { PageHeader } from '@/components/dashboard/shell';
import { Table, Td } from '@/components/dashboard/widgets';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal, Skeleton } from '@/components/ui/misc';

type U = { id: string; full_name: string; email: string; phone: string | null; status: string; created_at: string; last_sign_in_at: string | null; roles: string[]; stores: string[] };

export default function AdminUsers() {
  const sb = getSupabase();
  const { user, ctx } = useSession();
  const isSuper = ctx?.roles.includes('super_admin');
  const [q, setQ] = useState(''); const [term, setTerm] = useState('');
  const [roleFor, setRoleFor] = useState<U | null>(null);
  const { data, loading, error, reload } = useQuery(async () => {
    const { data, error } = await sb.rpc('admin_list_users', { p_q: term || null, p_limit: 50, p_offset: 0 });
    if (error) throw error;
    return data as { total: number; items: U[] };
  }, [term]);

  async function setRole(u: U, role: string, grant: boolean) {
    const { error } = await sb.rpc('admin_set_role', { p_user: u.id, p_role: role, p_grant: grant });
    if (error) return toast.error(errorMessage(error));
    toast.success('تم تحديث الأدوار'); reload();
    setRoleFor((r) => r && { ...r, roles: grant ? [...r.roles, role] : r.roles.filter((x) => x !== role) });
  }
  async function setStatus(u: U) {
    const { error } = await sb.rpc('admin_set_user_status', { p_user: u.id, p_status: u.status === 'active' ? 'suspended' : 'active' });
    if (error) return toast.error(errorMessage(error));
    toast.success('تم'); reload();
  }
  if (error) return <p className="card p-6 text-red-600">{error}</p>;
  return (
    <div>
      <PageHeader title="المستخدمون والأدوار" subtitle={`${data?.total ?? 0} مستخدم · الأدوار الإدارية يمنحها المدير العام فقط`} />
      <form onSubmit={(e) => { e.preventDefault(); setTerm(q); }} className="relative mb-4 max-w-sm"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" /><input className="input pr-9" placeholder="بحث بالاسم أو البريد" value={q} onChange={(e) => setQ(e.target.value)} /></form>
      {loading ? <Skeleton className="h-64" /> : (
        <Table head={['المستخدم', 'الأدوار', 'المتاجر', 'آخر دخول', 'الحالة', '']} empty={!data?.items.length}>
          {data?.items.map((u) => (
            <tr key={u.id}>
              <Td><p className="font-semibold">{u.full_name}</p><p className="text-xs text-ink-muted" dir="ltr">{u.email}</p></Td>
              <Td><div className="flex flex-wrap gap-1">{u.roles.length ? u.roles.map((r) => <Badge key={r} tone={r === 'super_admin' ? 'violet' : 'teal'}>{ROLE_LABEL[r]}</Badge>) : <span className="text-xs text-ink-muted">عميل</span>}</div></Td>
              <Td className="text-xs">{u.stores.join('، ') || '—'}</Td>
              <Td className="text-xs text-ink-muted">{u.last_sign_in_at ? formatDate(u.last_sign_in_at) : '—'}</Td>
              <Td><Badge tone={u.status === 'active' ? 'green' : 'red'} dot>{u.status === 'active' ? 'نشط' : 'موقوف'}</Badge></Td>
              <Td>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setRoleFor(u)}><ShieldPlus className="h-4 w-4" /> الأدوار</Button>
                  {u.id !== user?.id && <Button size="sm" variant={u.status === 'active' ? 'danger' : 'soft'} onClick={() => setStatus(u)}>{u.status === 'active' ? 'إيقاف' : 'تفعيل'}</Button>}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={!!roleFor} onClose={() => setRoleFor(null)} title={`أدوار ${roleFor?.full_name ?? ''}`}>
        <div className="space-y-2">
          {Object.entries(ROLE_LABEL).map(([r, l]) => {
            const has = roleFor?.roles.includes(r);
            const locked = ['super_admin', 'admin'].includes(r) && !isSuper;
            return (
              <div key={r} className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                <span className="font-semibold">{l}</span>
                <Button size="sm" variant={has ? 'danger' : 'soft'} disabled={locked} onClick={() => roleFor && setRole(roleFor, r, !has)}>{has ? 'سحب' : 'منح'}</Button>
              </div>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
