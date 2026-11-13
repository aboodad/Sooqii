'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { CircleDashed, PlayCircle, Search } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { formatDate, formatNumber } from '@/lib/format';
import { errorMessage } from '@/lib/utils';
import { PageHeader } from '@/components/dashboard/shell';
import { StatCard, Table, Td, Tabs } from '@/components/dashboard/widgets';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Modal, Skeleton } from '@/components/ui/misc';
import { StoryAvatar } from '@/components/stories/story-avatar';

type Row = {
  id: string; name: string; slug: string; status: string; logo_url: string | null;
  active: boolean; ends_at: string | null; last_ends_at: string | null; plans: number; live_stories: number;
};

/** إدارة اشتراكات الاستوري: التفعيل لمدة شهر من تاريخ البدء، التمديد، والإيقاف */
export default function AdminStories() {
  const sb = getSupabase();
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [grant, setGrant] = useState<Row | null>(null);
  const [cancel, setCancel] = useState<Row | null>(null);
  const [days, setDays] = useState('30');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const { data, loading, reload } = useQuery(async () => {
    const { data, error } = await sb.rpc('admin_story_stores');
    if (error) throw error;
    return (data as Row[]) ?? [];
  });

  const rows = (data ?? [])
    .filter((r) => tab === 'all' || (tab === 'active' ? r.active : !r.active))
    .filter((r) => !q || r.name.includes(q.trim()) || r.slug.includes(q.trim().toLowerCase()));
  const activeCount = (data ?? []).filter((r) => r.active).length;
  const liveCount = (data ?? []).reduce((s, r) => s + Number(r.live_stories), 0);
  const soon = (data ?? []).filter((r) => r.active && r.ends_at && new Date(r.ends_at).getTime() - Date.now() < 5 * 86400000).length;

  async function doGrant() {
    if (!grant) return;
    const n = Math.round(Number(days));
    if (!Number.isFinite(n) || n < 1 || n > 366) return toast.error('المدة بين 1 و366 يومًا');
    setBusy(true);
    const { data: res, error } = await sb.rpc('admin_grant_story', { p_store: grant.id, p_days: n, p_note: note.trim() || null });
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    const r = res as { starts_at: string; ends_at: string };
    toast.success(`تم التفعيل حتى ${formatDate(r.ends_at)}`);
    setGrant(null); setNote(''); setDays('30'); reload();
  }

  async function doCancel() {
    if (!cancel) return;
    setBusy(true);
    const { error } = await sb.rpc('admin_cancel_story', { p_store: cancel.id, p_reason: note.trim() || null });
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    toast.success('أُوقف الاستوري لهذا المتجر');
    setCancel(null); setNote(''); reload();
  }

  return (
    <div>
      <PageHeader title="اشتراكات الاستوري" subtitle="فعّل خاصية الحالات لكل متجر لمدة شهر تبدأ من لحظة التفعيل. التفعيل لمتجر مشترك يمدّد اشتراكه من تاريخ انتهائه." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="متاجر مشتركة الآن" value={formatNumber(activeCount)} icon={<CircleDashed />} />
        <StatCard label="حالات منشورة حاليًا" value={formatNumber(liveCount)} icon={<PlayCircle />} color="#FF7916" index={1} />
        <StatCard label="تنتهي خلال 5 أيام" value={formatNumber(soon)} icon={<CircleDashed />} color="#7C3AED" index={2} />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={tab} onChange={setTab} tabs={[
          { v: 'all', l: 'الكل', n: data?.length ?? 0 },
          { v: 'active', l: 'مفعّل', n: activeCount },
          { v: 'inactive', l: 'غير مفعّل', n: (data?.length ?? 0) - activeCount },
        ]} />
        <div className="relative mr-auto w-full max-w-xs"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" /><input className="input pr-9" placeholder="بحث باسم المتجر" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      {loading ? <Skeleton className="h-64" /> : (
        <Table head={['المتجر', 'الاشتراك', 'ينتهي في', 'حالات منشورة', 'مرات التفعيل', 'الإجراءات']} empty={!rows.length}>
          {rows.map((r) => (
            <tr key={r.id}>
              <Td>
                <div className="flex items-center gap-3">
                  <StoryAvatar store={r} seen={!r.active} size={44} />
                  <div><p className="font-semibold">{r.name}</p><p className="text-xs text-ink-muted" dir="ltr">/{r.slug}</p></div>
                </div>
              </Td>
              <Td>{r.active ? <Badge tone="green" dot>مفعّل</Badge> : r.ends_at ? <Badge tone="blue">مجدول</Badge> : <Badge tone="gray">غير مفعّل</Badge>}{r.status !== 'active' && <Badge tone="red" className="mr-1">المتجر معلّق</Badge>}</Td>
              <Td className="text-xs">{r.ends_at ? formatDate(r.ends_at) : r.last_ends_at ? <span className="text-ink-muted">انتهى {formatDate(r.last_ends_at)}</span> : '—'}</Td>
              <Td>{formatNumber(r.live_stories)}</Td>
              <Td>{formatNumber(r.plans)}</Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" disabled={r.status !== 'active'} onClick={() => { setDays('30'); setNote(''); setGrant(r); }}>{r.ends_at ? 'تمديد شهر' : 'تفعيل شهر'}</Button>
                  {r.ends_at && <Button size="sm" variant="danger" onClick={() => { setNote(''); setCancel(r); }}>إيقاف</Button>}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={!!grant} onClose={() => setGrant(null)} title={grant?.ends_at ? `تمديد الاستوري — ${grant?.name}` : `تفعيل الاستوري — ${grant?.name}`}>
        <p className="mb-4 rounded-2xl bg-mist p-3 text-sm leading-6 text-ink-soft">
          {grant?.ends_at
            ? `يبدأ التمديد من نهاية الاشتراك الحالي (${formatDate(grant.ends_at)}).`
            : 'يبدأ الاشتراك فورًا، ويستطيع المتجر النشر مباشرة. يصل إشعار لصاحب المتجر.'}
        </p>
        <Field label="المدة بالأيام" hint="الافتراضي 30 يومًا (شهر)"><Input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/[^0-9]/g, ''))} /></Field>
        <Field label="ملاحظة داخلية (اختياري)" className="mt-3"><Textarea rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثال: إيصال الدفع رقم 1024" /></Field>
        <Button className="mt-4 w-full" onClick={doGrant} loading={busy}>تأكيد التفعيل</Button>
      </Modal>

      <Modal open={!!cancel} onClose={() => setCancel(null)} title={`إيقاف الاستوري — ${cancel?.name}`}>
        <p className="mb-4 text-sm leading-6 text-ink-soft">تختفي حالات المتجر من الرئيسية فورًا ولن يتمكن من النشر حتى يُعاد التفعيل.</p>
        <Field label="السبب (يظهر لصاحب المتجر)"><Textarea rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <Button className="mt-4 w-full" variant="danger" onClick={doCancel} loading={busy}>تأكيد الإيقاف</Button>
      </Modal>
    </div>
  );
}
