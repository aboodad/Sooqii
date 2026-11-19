'use client';
import { useState } from 'react';
import { BookOpen, Plus, Receipt, Truck, Package } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { formatDate, formatPrice } from '@/lib/format';
import { CHARGE_KIND } from '@/lib/status';
import { errorMessage } from '@/lib/utils';
import { Table, Td, Tabs } from '@/components/dashboard/widgets';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, Input, Select } from '@/components/ui/field';
import { Modal } from '@/components/ui/misc';

type Overview = {
  balances: { code: string; name: string; type: string; balance: number }[];
  couriers: { id: string; name: string | null; collected: number; remitted: number }[];
  charges: { id: string; store: string; kind: string; amount: number; prepaid: boolean; status: string; note: string | null; created_at: string }[];
  plans: { id: number; name: string; price: number; period_days: number; commission_rate: number | null; max_products: number | null; story_included: boolean; is_active: boolean; features: string[] }[];
  journal: { id: number; ref_type: string; memo: string | null; at: string; lines: { account: string; debit: number; credit: number }[] }[];
};
const REF: Record<string, string> = { sub_delivered: 'تسليم', order_payment: 'دفعة عميل', order_refund: 'استرداد', remittance: 'توريد مندوب', store_charge: 'رسوم تاجر', charge_void: 'إلغاء رسوم', settlement_paid: 'تسوية' };

export function FinanceExtra() {
  const sb = getSupabase();
  const [tab, setTab] = useState('ledger');
  const [charge, setCharge] = useState<{ store: string; kind: string; amount: string; prepaid: boolean; note: string } | null>(null);
  const [plan, setPlan] = useState<Record<string, string> | null>(null);
  const [sub, setSub] = useState<{ plan: number; store: string; prepaid: boolean } | null>(null);
  const [rem, setRem] = useState<{ courier: string; name: string; due: number; amount: string; ref: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, reload } = useQuery(async () => {
    const { data, error } = await sb.rpc('admin_finance_overview');
    if (error) throw error;
    return data as Overview;
  });
  const stores = useQuery(async () => ((await sb.from('stores').select('id,name').eq('status', 'active').order('name')).data ?? []) as { id: string; name: string }[]);

  async function call(fn: string, args: Record<string, unknown>, ok: string, close: () => void) {
    setBusy(true);
    const { error } = await sb.rpc(fn, args);
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    toast.success(ok); close(); reload();
  }
  if (!data) return null;
  const storeSelect = (value: string, onChange: (v: string) => void) => (
    <Select value={value} onChange={(e) => onChange(e.target.value)}><option value="">اختر المتجر</option>{stores.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
  );

  return (
    <div>
      <h2 className="mb-3 text-lg font-bold">المحاسبة والرسوم</h2>
      <Tabs value={tab} onChange={setTab} tabs={[{ v: 'ledger', l: 'دفتر الأستاذ' }, { v: 'charges', l: 'رسوم التجار' }, { v: 'plans', l: 'باقات الاشتراك' }, { v: 'couriers', l: 'نقد المندوبين' }]} />

      {tab === 'ledger' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {data.balances.map((b) => (
              <div key={b.code} className="card p-4"><p className="text-xs text-ink-muted">{b.name}</p>
                <p className="mt-1 font-extrabold">{formatPrice(['liability', 'revenue', 'equity'].includes(b.type) ? -b.balance : b.balance)}</p></div>
            ))}
          </div>
          <Table head={['#', 'النوع', 'البيان', 'القيود', 'التاريخ']} empty={!data.journal.length}>
            {data.journal.map((j) => (
              <tr key={j.id}><Td className="text-xs">{j.id}</Td><Td><Badge tone="blue">{REF[j.ref_type] ?? j.ref_type}</Badge></Td><Td className="text-xs">{j.memo}</Td>
                <Td className="text-[11px]">{j.lines?.map((l, i) => <span key={i} className="block">{l.debit > 0 ? `مدين ${l.account}: ${formatPrice(l.debit)}` : `دائن ${l.account}: ${formatPrice(l.credit)}`}</span>)}</Td>
                <Td className="text-xs">{formatDate(j.at)}</Td></tr>
            ))}
          </Table>
          <p className="flex items-center gap-1 text-xs text-ink-muted"><BookOpen className="h-3.5 w-3.5" /> القيود مزدوجة ومتوازنة إجباريًا وغير قابلة للتعديل أو الحذف.</p>
        </div>
      )}

      {tab === 'charges' && (
        <>
          <div className="mb-3 flex justify-end"><Button onClick={() => setCharge({ store: '', kind: 'adjustment', amount: '', prepaid: false, note: '' })}><Plus className="h-4 w-4" /> رسوم جديدة</Button></div>
          <Table head={['المتجر', 'النوع', 'المبلغ', 'الدفع', 'الحالة', 'ملاحظة', '']} empty={!data.charges.length}>
            {data.charges.map((c) => (
              <tr key={c.id}><Td className="font-semibold">{c.store}</Td><Td>{CHARGE_KIND[c.kind]}</Td><Td className="font-bold">{formatPrice(c.amount)}</Td>
                <Td className="text-xs">{c.prepaid ? 'مدفوعة مسبقًا' : 'تُخصم من التسوية'}</Td><Td><Badge tone={c.status === 'void' ? 'gray' : c.status === 'pending' ? 'orange' : 'green'}>{c.status}</Badge></Td>
                <Td className="text-xs">{c.note}</Td>
                <Td>{['pending', 'paid'].includes(c.status) && <Button size="sm" variant="ghost" onClick={() => { const r = prompt('سبب الإلغاء'); if (r) call('admin_void_charge', { p_charge: c.id, p_reason: r }, 'أُلغيت الرسوم', () => {}); }}>إلغاء</Button>}</Td></tr>
            ))}
          </Table>
        </>
      )}

      {tab === 'plans' && (
        <>
          <div className="mb-3 flex justify-end"><Button onClick={() => setPlan({ name: '', price: '', period_days: '30', commission_rate: '', max_products: '', story_included: 'false', is_active: 'true', features: '' })}><Plus className="h-4 w-4" /> باقة جديدة</Button></div>
          <div className="grid gap-3 md:grid-cols-3">
            {data.plans.map((p) => (
              <div key={p.id} className="card p-5">
                <div className="flex items-center justify-between"><h3 className="font-bold">{p.name}</h3>{!p.is_active && <Badge>متوقفة</Badge>}</div>
                <p className="mt-1 text-2xl font-extrabold">{formatPrice(p.price)} <span className="text-xs font-normal text-ink-muted">/ {p.period_days} يوم</span></p>
                <ul className="mt-2 space-y-0.5 text-xs text-ink-soft">
                  {p.commission_rate != null && <li>عمولة {p.commission_rate}%</li>}{p.max_products && <li>حتى {p.max_products} منتج</li>}{p.story_included && <li>الاستوري مشمول</li>}
                  {p.features?.map((f) => <li key={f}>{f}</li>)}
                </ul>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => setSub({ plan: p.id, store: '', prepaid: true })} disabled={!p.is_active}><Package className="h-4 w-4" /> اشتراك متجر</Button>
                  <Button size="sm" variant="ghost" onClick={() => setPlan({ id: String(p.id), name: p.name, price: String(p.price), period_days: String(p.period_days), commission_rate: p.commission_rate == null ? '' : String(p.commission_rate), max_products: p.max_products ? String(p.max_products) : '', story_included: String(p.story_included), is_active: String(p.is_active), features: (p.features ?? []).join('\n') })}>تعديل</Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'couriers' && (
        <Table head={['المندوب', 'نقد محصّل', 'مورّد', 'المستحق عليه', '']} empty={!data.couriers.length}>
          {data.couriers.map((c) => {
            const due = Number(c.collected) - Number(c.remitted);
            return (
              <tr key={c.id}><Td className="font-semibold"><Truck className="ml-1 inline h-4 w-4 text-brand-600" />{c.name ?? '—'}</Td><Td>{formatPrice(c.collected)}</Td><Td>{formatPrice(c.remitted)}</Td>
                <Td className={due > 0 ? 'font-bold text-accent-600' : ''}>{formatPrice(due)}</Td>
                <Td>{due > 0 && <Button size="sm" onClick={() => setRem({ courier: c.id, name: c.name ?? '', due, amount: String(due), ref: '' })}><Receipt className="h-4 w-4" /> استلام توريد</Button>}</Td></tr>
            );
          })}
        </Table>
      )}

      <Modal open={!!charge} onClose={() => setCharge(null)} title="رسوم على متجر">
        {charge && <div className="space-y-3">
          <Field label="المتجر">{storeSelect(charge.store, (store) => setCharge({ ...charge, store }))}</Field>
          <Field label="النوع"><Select value={charge.kind} onChange={(e) => setCharge({ ...charge, kind: e.target.value })}>{Object.entries(CHARGE_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="المبلغ"><Input inputMode="decimal" value={charge.amount} onChange={(e) => setCharge({ ...charge, amount: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
          <Field label="ملاحظة"><Input maxLength={200} value={charge.note} onChange={(e) => setCharge({ ...charge, note: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={charge.prepaid} onChange={(e) => setCharge({ ...charge, prepaid: e.target.checked })} /> مدفوعة مسبقًا (لا تُخصم من التسوية)</label>
          <Button className="w-full" loading={busy} disabled={!charge.store || !Number(charge.amount)} onClick={() => call('admin_add_charge', { p_store: charge.store, p_kind: charge.kind, p_amount: Number(charge.amount), p_prepaid: charge.prepaid, p_note: charge.note }, 'سُجّلت الرسوم', () => setCharge(null))}>حفظ</Button>
        </div>}
      </Modal>

      <Modal open={!!plan} onClose={() => setPlan(null)} title="باقة اشتراك">
        {plan && <div className="space-y-3">
          <Field label="الاسم"><Input value={plan.name} onChange={(e) => setPlan({ ...plan, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="السعر"><Input inputMode="decimal" value={plan.price} onChange={(e) => setPlan({ ...plan, price: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
            <Field label="المدة (أيام)"><Input inputMode="numeric" value={plan.period_days} onChange={(e) => setPlan({ ...plan, period_days: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label="العمولة % (اختياري)"><Input inputMode="decimal" value={plan.commission_rate} onChange={(e) => setPlan({ ...plan, commission_rate: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
            <Field label="حد المنتجات (اختياري)"><Input inputMode="numeric" value={plan.max_products} onChange={(e) => setPlan({ ...plan, max_products: e.target.value.replace(/\D/g, '') })} /></Field>
          </div>
          <Field label="المزايا (سطر لكل ميزة)"><textarea className="input min-h-[80px]" value={plan.features} onChange={(e) => setPlan({ ...plan, features: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={plan.story_included === 'true'} onChange={(e) => setPlan({ ...plan, story_included: String(e.target.checked) })} /> تشمل الاستوري</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={plan.is_active === 'true'} onChange={(e) => setPlan({ ...plan, is_active: String(e.target.checked) })} /> نشطة</label>
          <Button className="w-full" loading={busy} disabled={!plan.name || !plan.period_days} onClick={() => call('admin_save_plan', {
            p_id: plan.id ? Number(plan.id) : null, p_name: plan.name, p_price: Number(plan.price || 0), p_days: Number(plan.period_days),
            p_commission: plan.commission_rate ? Number(plan.commission_rate) : null, p_max_products: plan.max_products ? Number(plan.max_products) : null,
            p_story: plan.story_included === 'true', p_features: plan.features.split('\n').map((x) => x.trim()).filter(Boolean), p_active: plan.is_active === 'true',
          }, 'حُفظت الباقة', () => setPlan(null))}>حفظ</Button>
        </div>}
      </Modal>

      <Modal open={!!sub} onClose={() => setSub(null)} title="اشتراك متجر في باقة">
        {sub && <div className="space-y-3">
          <Field label="المتجر">{storeSelect(sub.store, (store) => setSub({ ...sub, store }))}</Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sub.prepaid} onChange={(e) => setSub({ ...sub, prepaid: e.target.checked })} /> دفع الرسوم مسبقًا (وإلا تُخصم من التسوية)</label>
          <Button className="w-full" loading={busy} disabled={!sub.store} onClick={() => call('admin_subscribe_store', { p_store: sub.store, p_plan: sub.plan, p_prepaid: sub.prepaid }, 'تم الاشتراك', () => setSub(null))}>تأكيد</Button>
        </div>}
      </Modal>

      <Modal open={!!rem} onClose={() => setRem(null)} title={`توريد نقدي — ${rem?.name ?? ''}`}>
        {rem && <div className="space-y-3">
          <p className="text-sm text-ink-soft">المستحق: <b>{formatPrice(rem.due)}</b></p>
          <Field label="المبلغ المستلم"><Input inputMode="decimal" value={rem.amount} onChange={(e) => setRem({ ...rem, amount: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
          <Field label="مرجع (اختياري)"><Input value={rem.ref} onChange={(e) => setRem({ ...rem, ref: e.target.value })} /></Field>
          <Button className="w-full" loading={busy} disabled={!Number(rem.amount)} onClick={() => call('admin_record_remittance', { p_courier: rem.courier, p_amount: Number(rem.amount), p_ref: rem.ref || null }, 'سُجّل التوريد', () => setRem(null))}>تأكيد</Button>
        </div>}
      </Modal>
    </div>
  );
}
