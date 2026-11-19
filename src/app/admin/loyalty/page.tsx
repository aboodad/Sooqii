'use client';
import { useEffect, useState } from 'react';
import { Coins, Plus, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { saveSetting } from '@/lib/api/admin';
import { formatDate, formatNumber, formatPrice } from '@/lib/format';
import { errorMessage } from '@/lib/utils';
import { PageHeader } from '@/components/dashboard/shell';
import { StatCard, Table, Td, Tabs } from '@/components/dashboard/widgets';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Modal, Skeleton } from '@/components/ui/misc';

type Row = Record<string, unknown> & { id: number };
type Ov = { settings: Record<string, number | boolean>; stats: Record<string, number>; rewards: Row[]; packs: Row[]; gifts: Row[]; raffles: Row[]; campaigns: Row[] };

const LOYALTY_FIELDS: [string, string][] = [
  ['point_value', 'قيمة النقطة (ر.ي)'], ['max_redeem_percent', 'أقصى نسبة خصم بالنقاط %'], ['min_redeem', 'أقل نقاط للاستبدال'],
  ['signup_points', 'نقاط التسجيل'], ['daily_points', 'نقاط الحضور اليومي'], ['streak_days', 'أيام السلسلة'], ['streak_bonus', 'مكافأة السلسلة'],
  ['purchase_percent', 'نقاط الشراء % من القيمة'], ['review_points', 'نقاط التقييم'], ['referral_inviter', 'نقاط المُحيل'], ['referral_invitee', 'نقاط المدعو'],
];

type Kind = 'reward' | 'pack' | 'gift' | 'raffle' | 'campaign';
const toLocal = (v: unknown) => (v ? new Date(String(v)).toISOString().slice(0, 16) : '');

export default function LoyaltyAdmin() {
  const sb = getSupabase();
  const [tab, setTab] = useState('settings');
  const [edit, setEdit] = useState<{ kind: Kind; id: number | null; d: Record<string, string> } | null>(null);
  const [cfg, setCfg] = useState<Record<string, number | boolean> | null>(null);
  const [adj, setAdj] = useState({ user: '', amount: '', note: '' });
  const [busy, setBusy] = useState(false);
  const { data, loading, reload } = useQuery(async () => {
    const { data, error } = await sb.rpc('admin_loyalty_overview');
    if (error) throw error;
    return data as Ov;
  });
  useEffect(() => { if (data && !cfg) setCfg(data.settings); }, [data, cfg]);

  async function saveItem() {
    if (!edit) return;
    const d = edit.d; let payload: Record<string, unknown> = { ...d };
    try {
      if (edit.kind === 'pack') payload = { ...d, coupons: JSON.parse(d.coupons || '[]') };
      if (edit.kind === 'gift') payload = { ...d, options: JSON.parse(d.options || '[]') };
    } catch { return toast.error('صيغة JSON غير صحيحة'); }
    for (const k of ['ends_at', 'starts_at']) if (payload[k]) payload[k] = new Date(String(payload[k])).toISOString();
    for (const k of Object.keys(payload)) if (payload[k] === '') payload[k] = null;
    setBusy(true);
    const { error } = await sb.rpc('admin_save_loyalty_item', { p_kind: edit.kind, p_id: edit.id, p_data: payload });
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    toast.success('تم الحفظ'); setEdit(null); reload();
  }
  async function draw(id: number) {
    if (!confirm('سحب الفائزين الآن؟ لا يمكن التراجع.')) return;
    const { data: r, error } = await sb.rpc('admin_draw_raffle', { p_raffle: id });
    if (error) return toast.error(errorMessage(error));
    toast.success(`الفائزون: ${(r.winners as { name: string }[]).map((w) => w.name).join('، ') || 'لا مشاركين'}`); reload();
  }

  if (loading && !data) return <Skeleton className="h-96" />;
  if (!data || !cfg) return null;
  const open = (kind: Kind, row?: Row) => {
    const d: Record<string, string> = {};
    if (row) Object.entries(row).forEach(([k, v]) => { d[k] = typeof v === 'object' && v !== null ? JSON.stringify(v) : k.endsWith('_at') ? toLocal(v) : String(v ?? ''); });
    else if (kind === 'pack') d.coupons = '[{"value":50,"min_cart":1000}]';
    else if (kind === 'gift') { d.options = '[{"key":"a","title":"100 نقطة","type":"points","value":100}]'; d.pick_count = '3'; }
    setEdit({ kind, id: row?.id ?? null, d });
  };

  return (
    <div>
      <PageHeader title="النقاط والمكافآت" subtitle="برنامج الولاء: نقاط، تسجيل يومي، دعوات، متجر النقاط، باقات الكوبونات، الهدايا، السحوبات والحملات الموسمية" />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="نقاط ممنوحة" value={formatNumber(data.stats.issued)} icon={<Coins />} />
        <StatCard label="نقاط مستبدلة" value={formatNumber(data.stats.redeemed)} icon={<Coins />} color="#FF7916" index={1} />
        <StatCard label="قيد التفعيل" value={formatNumber(data.stats.pending)} icon={<Coins />} color="#7C3AED" index={2} />
        <StatCard label="حضور اليوم" value={formatNumber(data.stats.checkins_today)} icon={<Trophy />} color="#10B981" index={3} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { v: 'settings', l: 'الإعدادات' }, { v: 'reward', l: 'متجر النقاط', n: data.rewards.length }, { v: 'pack', l: 'باقات الكوبونات', n: data.packs.length },
        { v: 'gift', l: 'الهدايا', n: data.gifts.length }, { v: 'raffle', l: 'السحوبات', n: data.raffles.length }, { v: 'campaign', l: 'الحملات الموسمية', n: data.campaigns.length },
      ]} />

      {tab === 'settings' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="card space-y-4 p-5 lg:col-span-2">
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={!!cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} /> تفعيل برنامج النقاط</label>
            <div className="grid gap-3 sm:grid-cols-3">
              {LOYALTY_FIELDS.map(([k, l]) => <Field key={k} label={l}><Input inputMode="decimal" value={String(cfg[k] ?? '')} onChange={(e) => setCfg({ ...cfg, [k]: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })} /></Field>)}
            </div>
            <Button loading={busy} onClick={async () => { setBusy(true); try { await saveSetting(sb, 'public_loyalty', cfg); toast.success('تم الحفظ'); } catch (e) { toast.error(errorMessage(e)); } setBusy(false); }}>حفظ الإعدادات</Button>
          </div>
          <div className="card space-y-3 p-5">
            <h3 className="font-bold">تعديل رصيد عميل</h3>
            <Field label="معرّف المستخدم (UUID)"><Input dir="ltr" value={adj.user} onChange={(e) => setAdj({ ...adj, user: e.target.value.trim() })} /></Field>
            <Field label="الكمية (سالب للخصم)"><Input dir="ltr" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value.replace(/[^\d-]/g, '') })} /></Field>
            <Field label="السبب"><Input value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} /></Field>
            <Button variant="soft" onClick={async () => {
              const { error } = await sb.rpc('admin_adjust_points', { p_user: adj.user, p_amount: Number(adj.amount), p_note: adj.note });
              if (error) return toast.error(errorMessage(error));
              toast.success('تم'); setAdj({ user: '', amount: '', note: '' }); reload();
            }}>تنفيذ</Button>
          </div>
        </div>
      )}

      {tab !== 'settings' && <div className="mb-3 flex justify-end"><Button onClick={() => open(tab as Kind)}><Plus className="h-4 w-4" /> إضافة</Button></div>}
      {tab === 'reward' && (
        <Table head={['العنوان', 'التكلفة', 'الكوبون', 'المخزون', 'الحالة', '']} empty={!data.rewards.length}>
          {data.rewards.map((r) => <tr key={r.id}><Td className="font-semibold">{String(r.title)}</Td><Td>{formatNumber(r.cost as number)} نقطة</Td>
            <Td>{r.type === 'coupon_percent' ? `${r.value}%` : formatPrice(r.value as number)}</Td><Td>{r.stock == null ? '∞' : String(r.stock)}</Td>
            <Td>{r.is_active ? <Badge tone="green">نشط</Badge> : <Badge>متوقف</Badge>}</Td><Td><Button size="sm" variant="ghost" onClick={() => open('reward', r)}>تعديل</Button></Td></tr>)}
        </Table>
      )}
      {tab === 'pack' && (
        <Table head={['العنوان', 'عدد الكوبونات', 'المجموع', 'للجدد فقط', 'مستلمة', 'الحالة', '']} empty={!data.packs.length}>
          {data.packs.map((r) => { const cs = r.coupons as { value: number }[]; return <tr key={r.id}><Td className="font-semibold">{String(r.title)}</Td><Td>{cs.length}</Td>
            <Td>{formatPrice(cs.reduce((s, c) => s + Number(c.value), 0))}</Td><Td>{r.new_users_only ? 'نعم' : 'لا'}</Td><Td>{String(r.claims)}</Td>
            <Td>{r.is_active ? <Badge tone="green">نشطة</Badge> : <Badge>متوقفة</Badge>}</Td><Td><Button size="sm" variant="ghost" onClick={() => open('pack', r)}>تعديل</Button></Td></tr>; })}
        </Table>
      )}
      {tab === 'gift' && (
        <Table head={['العنوان', 'الخيارات', 'يختار', 'مستلمة', 'الحالة', '']} empty={!data.gifts.length}>
          {data.gifts.map((r) => <tr key={r.id}><Td className="font-semibold">{String(r.title)}</Td><Td>{(r.options as unknown[]).length}</Td><Td>{String(r.pick_count)}</Td><Td>{String(r.claims)}</Td>
            <Td>{r.is_active ? <Badge tone="green">نشطة</Badge> : <Badge>متوقفة</Badge>}</Td><Td><Button size="sm" variant="ghost" onClick={() => open('gift', r)}>تعديل</Button></Td></tr>)}
        </Table>
      )}
      {tab === 'raffle' && (
        <Table head={['العنوان', 'الجائزة', 'ينتهي', 'المشاركون', 'الحالة', '']} empty={!data.raffles.length}>
          {data.raffles.map((r) => <tr key={r.id}><Td className="font-semibold">{String(r.title)}</Td><Td>{String(r.prize)}</Td><Td className="text-xs">{formatDate(String(r.ends_at))}</Td><Td>{String(r.entries)}</Td>
            <Td>{r.status === 'drawn' ? <span className="text-xs">الفائزون: {((r.winners as string[]) ?? []).join('، ')}</span> : <Badge tone={r.status === 'open' ? 'green' : 'gray'}>{String(r.status)}</Badge>}</Td>
            <Td><div className="flex gap-1">{r.status === 'open' && <><Button size="sm" variant="accent" onClick={() => draw(r.id)}>سحب</Button><Button size="sm" variant="ghost" onClick={() => open('raffle', r)}>تعديل</Button></>}</div></Td></tr>)}
        </Table>
      )}
      {tab === 'campaign' && (
        <Table head={['الاسم', 'المضاعف', 'مكافأة ثابتة', 'الفترة', 'الميزانية', '']} empty={!data.campaigns.length}>
          {data.campaigns.map((r) => <tr key={r.id}><Td className="font-semibold">{String(r.name)}</Td><Td>×{String(r.multiplier)}</Td><Td>{String(r.bonus_points)}</Td>
            <Td className="text-xs">{formatDate(String(r.starts_at))} ← {formatDate(String(r.ends_at))}</Td><Td>{r.budget_points ? `${r.used_points}/${r.budget_points}` : '∞'}</Td>
            <Td><Button size="sm" variant="ghost" onClick={() => open('campaign', r)}>تعديل</Button></Td></tr>)}
        </Table>
      )}

      <Modal open={!!edit} onClose={() => setEdit(null)} title="تحرير" wide>
        {edit && <ItemForm kind={edit.kind} d={edit.d} set={(d) => setEdit({ ...edit, d })} />}
        <Button className="mt-4 w-full" loading={busy} onClick={saveItem}>حفظ</Button>
      </Modal>
    </div>
  );
}

function ItemForm({ kind, d, set }: { kind: Kind; d: Record<string, string>; set: (d: Record<string, string>) => void }) {
  const f = (k: string, l: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) =>
    <Field key={k} label={l}><Input value={d[k] ?? ''} onChange={(e) => set({ ...d, [k]: e.target.value })} {...props} /></Field>;
  const chk = (k: string, l: string, def = false) =>
    <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={(d[k] ?? String(def)) === 'true'} onChange={(e) => set({ ...d, [k]: String(e.target.checked) })} /> {l}</label>;
  const grid = (...c: React.ReactNode[]) => <div className="grid gap-3 sm:grid-cols-2">{c}</div>;
  if (kind === 'reward') return <div className="space-y-3">{grid(f('title', 'العنوان'), f('cost', 'التكلفة بالنقاط', { inputMode: 'numeric' }))}
    {grid(<Field key="t" label="نوع الكوبون"><Select value={d.type ?? 'coupon_fixed'} onChange={(e) => set({ ...d, type: e.target.value })}><option value="coupon_fixed">مبلغ ثابت</option><option value="coupon_percent">نسبة %</option></Select></Field>, f('value', 'القيمة', { inputMode: 'decimal' }))}
    {grid(f('min_cart', 'أقل قيمة سلة', { inputMode: 'decimal' }), f('valid_days', 'صلاحية (أيام)', { inputMode: 'numeric' }))}
    {grid(f('stock', 'المخزون (فارغ = غير محدود)', { inputMode: 'numeric' }), f('description', 'وصف'))}{chk('is_active', 'نشط', true)}</div>;
  if (kind === 'pack') return <div className="space-y-3">{grid(f('title', 'العنوان'), f('valid_days', 'صلاحية الكوبونات (أيام)', { inputMode: 'numeric' }))}{f('description', 'الوصف')}
    <Field label='الكوبونات JSON — مثال: [{"value":50,"min_cart":1000}]'><Textarea dir="ltr" className="font-mono text-xs" value={d.coupons ?? ''} onChange={(e) => set({ ...d, coupons: e.target.value })} /></Field>
    {f('ends_at', 'ينتهي في (اختياري)', { type: 'datetime-local' })}{chk('new_users_only', 'للعملاء الجدد فقط')}{chk('is_active', 'نشطة')}</div>;
  if (kind === 'gift') return <div className="space-y-3">{grid(f('title', 'العنوان'), f('pick_count', 'عدد الاختيارات', { inputMode: 'numeric' }))}{f('description', 'الوصف')}
    <Field label='الخيارات JSON — type: points | coupon_fixed | coupon_percent'><Textarea dir="ltr" className="font-mono text-xs" value={d.options ?? ''} onChange={(e) => set({ ...d, options: e.target.value })} /></Field>
    {grid(f('min_orders', 'أقل عدد طلبات مكتملة', { inputMode: 'numeric' }), f('ends_at', 'ينتهي في', { type: 'datetime-local' }))}{chk('is_active', 'نشطة')}</div>;
  if (kind === 'raffle') return <div className="space-y-3">{grid(f('title', 'العنوان'), f('prize', 'الجائزة'))}{f('description', 'الوصف')}{f('image_url', 'رابط صورة (https)', { dir: 'ltr' })}
    {grid(f('entry_cost', 'تكلفة الاشتراك بالنقاط (0 = مجاني)', { inputMode: 'numeric' }), f('winners_count', 'عدد الفائزين', { inputMode: 'numeric' }))}{f('ends_at', 'موعد الانتهاء', { type: 'datetime-local' })}</div>;
  return <div className="space-y-3">{f('name', 'اسم الحملة')}{grid(f('multiplier', 'مضاعف نقاط الشراء (1–10)', { inputMode: 'decimal' }), f('bonus_points', 'نقاط إضافية ثابتة لكل طلب', { inputMode: 'numeric' }))}
    {grid(f('starts_at', 'تبدأ', { type: 'datetime-local' }), f('ends_at', 'تنتهي', { type: 'datetime-local' }))}{grid(f('min_order', 'أقل قيمة طلب', { inputMode: 'decimal' }), f('budget_points', 'ميزانية النقاط (اختياري)', { inputMode: 'numeric' }))}{chk('is_active', 'نشطة', true)}</div>;
}
