'use client';
import { useEffect, useState } from 'react';
import { Banknote, Coins, ShieldCheck, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { loadSettings, saveSetting } from '@/lib/api/admin';
import type { PaymentMethod } from '@/lib/types';
import { errorMessage } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/misc';

const KEYS = ['public_payment_methods', 'public_whatsapp_number', 'public_support_phone', 'payment_window_minutes', 'cod_max_amount', 'public_hub_enabled',
  'public_pickup_enabled', 'public_pickup_fee', 'hub_allow_partial', 'batch_cycle_minutes', 'merchant_sla_hours', 'settlement_hold_days', 'admin_mfa_required'];
const NUMS: [string, string, string][] = [
  ['payment_window_minutes', 'مهلة الدفع المسبق (دقائق)', 'يُلغى الطلب غير المدفوع تلقائيًا بعدها ويُعاد المخزون'],
  ['cod_max_amount', 'أقصى مبلغ للدفع عند الاستلام (0 = بلا حد)', ''],
  ['public_pickup_fee', 'رسوم الاستلام من نقطة', ''],
  ['batch_cycle_minutes', 'دورة إغلاق دفعات التجار تلقائيًا (دقائق، 0 = يدوي)', ''],
  ['merchant_sla_hours', 'مهلة قبول الطلب لدى التاجر (ساعات)', 'تذكير تلقائي وتنبيه في غرفة العمليات'],
  ['settlement_hold_days', 'فترة حجز المستحقات قبل التسوية (أيام)', ''],
];

type Cur = { code: string; name_ar: string; symbol: string; rate: number; decimals: number; is_active: boolean };

export function PlatformSettings() {
  const sb = getSupabase();
  const { data, loading, reload } = useQuery(() => loadSettings(sb, KEYS));
  const [v, setV] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { if (data && !v) setV(data); }, [data, v]);

  async function save(keys: string[], label: string) {
    if (!v) return;
    setBusy(label);
    try {
      for (const k of keys) await saveSetting(sb, k, v[k]);
      toast.success('تم الحفظ'); reload();
    } catch (e) { toast.error(errorMessage(e)); }
    setBusy(null);
  }
  if (loading || !v) return <Skeleton className="h-64" />;
  const methods = (v.public_payment_methods as PaymentMethod[]) ?? [];
  const setM = (i: number, patch: Partial<PaymentMethod>) => setV({ ...v, public_payment_methods: methods.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  const bool = (k: string, l: string, hint?: string) => (
    <label className="flex items-start gap-2 rounded-xl bg-mist p-3 text-sm"><input type="checkbox" className="mt-1" checked={v[k] === true} onChange={(e) => setV({ ...v, [k]: e.target.checked })} />
      <span><b>{l}</b>{hint && <span className="block text-xs text-ink-muted">{hint}</span>}</span></label>
  );

  return (
    <div className="space-y-6">
      <section className="card space-y-4 p-5">
        <h2 className="flex items-center gap-2 font-bold"><Banknote className="h-5 w-5 text-brand-600" /> الدفع عبر واتساب</h2>
        <p className="text-xs text-ink-muted">لا توجد بوابة دفع: يختار العميل الطريقة، ثم يُحوَّل إلى واتساب برسالة جاهزة لإرسال إثبات التحويل، وتؤكد الإدارة الدفع من «تأكيد المدفوعات».</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="رقم واتساب استقبال المدفوعات" hint="بالصيغة الدولية أو المحلية، مثال 967771234567"><Input dir="ltr" value={String(v.public_whatsapp_number ?? '')} onChange={(e) => setV({ ...v, public_whatsapp_number: e.target.value.replace(/[^\d+]/g, '') })} /></Field>
          <Field label="رقم خدمة العملاء"><Input dir="ltr" value={String(v.public_support_phone ?? '')} onChange={(e) => setV({ ...v, public_support_phone: e.target.value.replace(/[^\d+ ]/g, '') })} /></Field>
        </div>
        <div className="space-y-2">
          {methods.map((m, i) => (
            <div key={m.key} className="grid items-center gap-2 rounded-xl bg-mist p-3 sm:grid-cols-[auto_1fr_1.4fr]">
              <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={m.enabled} onChange={(e) => setM(i, { enabled: e.target.checked })} /> {m.label}</label>
              <Input className="h-10" value={m.label} onChange={(e) => setM(i, { label: e.target.value.slice(0, 40) })} />
              {m.key !== 'cod' ? <Input className="h-10" dir="ltr" placeholder="رقم الحساب / المحفظة الذي يحوّل إليه العميل" value={m.account ?? ''} onChange={(e) => setM(i, { account: e.target.value.slice(0, 80) })} /> : <span className="text-xs text-ink-muted">نقدًا للمندوب</span>}
            </div>
          ))}
        </div>
        <Button loading={busy === 'pay'} onClick={() => {
          if (!methods.some((m) => m.enabled)) return toast.error('فعّل طريقة دفع واحدة على الأقل');
          save(['public_payment_methods', 'public_whatsapp_number', 'public_support_phone', 'payment_window_minutes', 'cod_max_amount'], 'pay');
        }}>حفظ إعدادات الدفع</Button>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="flex items-center gap-2 font-bold"><Truck className="h-5 w-5 text-brand-600" /> التشغيل والتوصيل</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {bool('public_hub_enabled', 'التوصيل عبر مركز سوقي (طرد موحد)', 'تُجمع شحنات المتاجر في المركز وتُرسل للعميل في طرد واحد وشحن واحد')}
          {bool('public_pickup_enabled', 'الاستلام من نقاط سوقي', 'أضف النقاط من صفحة اللوجستيات')}
          {bool('hub_allow_partial', 'السماح بتغليف جزئي', 'إرسال الطرد قبل وصول كل الشحنات')}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {NUMS.map(([k, l, h]) => <Field key={k} label={l} hint={h || undefined}><Input inputMode="numeric" value={String(v[k] ?? 0)} onChange={(e) => setV({ ...v, [k]: Number(e.target.value.replace(/\D/g, '')) || 0 })} /></Field>)}
        </div>
        <Button loading={busy === 'ops'} onClick={() => save(['public_hub_enabled', 'public_pickup_enabled', 'hub_allow_partial', 'public_pickup_fee', 'batch_cycle_minutes', 'merchant_sla_hours', 'settlement_hold_days', 'payment_window_minutes', 'cod_max_amount'], 'ops')}>حفظ إعدادات التشغيل</Button>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="flex items-center gap-2 font-bold"><ShieldCheck className="h-5 w-5 text-brand-600" /> الأمان</h2>
        {bool('admin_mfa_required', 'إلزام التحقق الثنائي لكل حسابات الإدارة', 'لن تعمل أي صلاحية إدارية دون رمز التطبيق. فعّله لحسابك أولًا.')}
        <Button loading={busy === 'sec'} onClick={() => save(['admin_mfa_required'], 'sec')}>حفظ</Button>
      </section>

      <Currencies />
    </div>
  );
}

function Currencies() {
  const sb = getSupabase();
  const { data, reload } = useQuery(async () => ((await sb.from('currencies').select('code,name_ar,symbol,rate,decimals,is_active').order('sort')).data ?? []) as Cur[]);
  const [rows, setRows] = useState<Record<string, Cur>>({});
  async function save(c: Cur) {
    const { error } = await sb.rpc('admin_upsert_currency', { p_code: c.code, p_name: c.name_ar, p_symbol: c.symbol, p_rate: Number(c.rate), p_decimals: Number(c.decimals), p_active: c.is_active });
    if (error) return toast.error(errorMessage(error));
    toast.success('تم'); const r = { ...rows }; delete r[c.code]; setRows(r); reload();
  }
  return (
    <section className="card space-y-3 p-5">
      <h2 className="flex items-center gap-2 font-bold"><Coins className="h-5 w-5 text-brand-600" /> العملات وأسعار الصرف</h2>
      <p className="text-xs text-ink-muted">الأسعار مخزّنة بالريال اليمني. السعر = كم ريال يمني تساوي وحدة واحدة. حدّث السعر قبل تفعيل العملة.</p>
      <div className="space-y-2">
        {data?.map((c0) => {
          const c = rows[c0.code] ?? c0;
          const set = (p: Partial<Cur>) => setRows({ ...rows, [c.code]: { ...c, ...p } });
          return (
            <div key={c.code} className="grid items-center gap-2 rounded-xl bg-mist p-3 sm:grid-cols-[60px_1fr_80px_120px_auto_auto]">
              <b dir="ltr">{c.code}</b>
              <Input className="h-10" value={c.name_ar} onChange={(e) => set({ name_ar: e.target.value })} />
              <Input className="h-10" value={c.symbol} onChange={(e) => set({ symbol: e.target.value })} />
              <Input className="h-10" inputMode="decimal" disabled={c.code === 'YER'} value={String(c.rate)} onChange={(e) => set({ rate: e.target.value.replace(/[^\d.]/g, '') as unknown as number })} />
              <label className="flex items-center gap-1 text-sm"><input type="checkbox" disabled={c.code === 'YER'} checked={c.is_active} onChange={(e) => set({ is_active: e.target.checked })} /> مفعّلة</label>
              {rows[c.code] ? <Button size="sm" onClick={() => save(c)}>حفظ</Button> : <span />}
            </div>
          );
        })}
      </div>
    </section>
  );
}
