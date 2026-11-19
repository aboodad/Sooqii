'use client';
import { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, MessageCircle, RefreshCw, Send, Smartphone, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { saveSetting } from '@/lib/api/admin';
import { formatDate } from '@/lib/format';
import { errorMessage, cn } from '@/lib/utils';
import { PageHeader } from '@/components/dashboard/shell';
import { Table, Td } from '@/components/dashboard/widgets';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/misc';

type Notify = {
  events: Record<string, boolean>;
  whatsapp: { enabled: boolean; phone_number_id: string; api_version: string; lang: string; templates: Record<string, string> };
  sms: { enabled: boolean; url: string; auth_header: string; auth_prefix: string; sender: string; body_template: string };
};
type Overview = { settings: Notify; secrets: { whatsapp_token: boolean; sms_token: boolean }; stats: Record<string, number> | null;
  recent: { id: number; event: string; channel: string; to: string; status: string; error: string | null; at: string }[] };

const EVENTS: Record<string, string> = {
  order_placed: 'تأكيد استلام الطلب (دفع عند الاستلام)', payment_pending: 'طلب بانتظار الدفع', payment_confirmed: 'تأكيد الدفع',
  out_for_delivery: 'خرج للتوصيل + رمز التسليم', delivered: 'تم التسليم', cancelled: 'إلغاء الطلب',
};
const ST: Record<string, 'gray' | 'green' | 'red' | 'orange' | 'blue'> = { queued: 'orange', sending: 'blue', sent: 'green', failed: 'red', skipped: 'gray' };

export default function NotificationsAdmin() {
  const sb = getSupabase();
  const { data, loading, reload } = useQuery(async () => {
    const { data, error } = await sb.rpc('admin_notify_overview');
    if (error) throw error;
    return data as Overview;
  });
  const [cfg, setCfg] = useState<Notify | null>(null);
  const [tok, setTok] = useState({ whatsapp_token: '', sms_token: '' });
  const [test, setTest] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { if (data && !cfg) setCfg(data.settings); }, [data, cfg]);

  async function save() {
    if (!cfg) return;
    if (cfg.sms.url && !/^https:\/\//.test(cfg.sms.url)) return toast.error('رابط بوابة SMS يجب أن يبدأ بـ https://');
    if (cfg.whatsapp.phone_number_id && !/^\d{5,30}$/.test(cfg.whatsapp.phone_number_id)) return toast.error('Phone Number ID أرقام فقط');
    try { JSON.parse(cfg.sms.body_template.replace(/"\{\{\w+\}\}"/g, '""')); } catch { return toast.error('قالب جسم SMS ليس JSON صالحًا'); }
    setBusy('save');
    try { await saveSetting(sb, 'notify', cfg); toast.success('تم حفظ الإعدادات'); reload(); } catch (e) { toast.error(errorMessage(e)); }
    setBusy(null);
  }
  async function saveSecret(name: 'whatsapp_token' | 'sms_token') {
    setBusy(name);
    const { error } = await sb.rpc('admin_set_secret', { p_name: name, p_value: tok[name] });
    setBusy(null);
    if (error) return toast.error(errorMessage(error));
    setTok({ ...tok, [name]: '' }); toast.success('حُفظ الرمز بشكل مشفّر'); reload();
  }
  async function sendTest(channel: string) {
    setBusy(`t${channel}`);
    const { error } = await sb.rpc('admin_test_notify', { p_phone: test, p_channel: channel });
    setBusy(null);
    if (error) return toast.error(errorMessage(error));
    toast.success('أُضيفت رسالة تجريبية للإرسال خلال دقيقة'); setTimeout(reload, 1500);
  }

  if (loading && !data) return <Skeleton className="h-96" />;
  if (!data || !cfg) return null;
  const set = (patch: Partial<Notify>) => setCfg({ ...cfg, ...patch });
  const wa = cfg.whatsapp; const sms = cfg.sms;

  return (
    <div className="space-y-6">
      <PageHeader title="إشعارات واتساب و SMS" subtitle="واتساب هو القناة الأساسية لإشعارات الطلبات. SMS جاهزة للاستخدام لاحقًا وتُفعّل من هنا."
        actions={<Button loading={busy === 'save'} onClick={save}>حفظ الإعدادات</Button>} />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-bold"><MessageCircle className="h-5 w-5 text-[#25D366]" /> واتساب (WhatsApp Cloud API)</h2>
            <Toggle on={wa.enabled} onChange={(v) => set({ whatsapp: { ...wa, enabled: v } })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone Number ID"><Input dir="ltr" value={wa.phone_number_id} onChange={(e) => set({ whatsapp: { ...wa, phone_number_id: e.target.value.replace(/\D/g, '') } })} /></Field>
            <Field label="إصدار API"><Input dir="ltr" value={wa.api_version} onChange={(e) => set({ whatsapp: { ...wa, api_version: e.target.value.replace(/[^v\d.]/g, '') } })} /></Field>
          </div>
          <Secret label="رمز الوصول الدائم (Access Token)" exists={data.secrets.whatsapp_token} value={tok.whatsapp_token}
            onChange={(v) => setTok({ ...tok, whatsapp_token: v })} onSave={() => saveSecret('whatsapp_token')} busy={busy === 'whatsapp_token'} />
          <details className="rounded-xl bg-mist p-3 text-sm">
            <summary className="cursor-pointer font-semibold">أسماء القوالب المعتمدة (اختياري)</summary>
            <p className="my-2 text-xs leading-5 text-ink-muted">رسائل الأعمال خارج نافذة 24 ساعة تتطلب قوالب معتمدة من Meta. اترك الحقل فارغًا لإرسال نص عادي. المتغيرات: {'{{1}}'} رقم الطلب، {'{{2}}'} المبلغ أو رمز التسليم.</p>
            <div className="grid gap-2">
              {Object.entries(EVENTS).map(([k, l]) => (
                <Field key={k} label={l}><Input dir="ltr" placeholder="template_name" value={wa.templates?.[k] ?? ''} onChange={(e) => set({ whatsapp: { ...wa, templates: { ...wa.templates, [k]: e.target.value.replace(/[^a-z0-9_]/g, '') } } })} /></Field>
              ))}
              <Field label="لغة القالب"><Input dir="ltr" value={wa.lang} onChange={(e) => set({ whatsapp: { ...wa, lang: e.target.value.replace(/[^a-zA-Z_]/g, '') } })} /></Field>
            </div>
          </details>
        </section>

        <section className="card space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-bold"><Smartphone className="h-5 w-5 text-brand-600" /> الرسائل النصية SMS <Badge>للاستخدام المستقبلي</Badge></h2>
            <Toggle on={sms.enabled} onChange={(v) => set({ sms: { ...sms, enabled: v } })} />
          </div>
          <Field label="رابط بوابة الإرسال (POST)"><Input dir="ltr" placeholder="https://api.provider.com/sms/send" value={sms.url} onChange={(e) => set({ sms: { ...sms, url: e.target.value.trim() } })} /></Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="ترويسة التوثيق"><Input dir="ltr" value={sms.auth_header} onChange={(e) => set({ sms: { ...sms, auth_header: e.target.value.replace(/[^A-Za-z-]/g, '') } })} /></Field>
            <Field label="بادئة الرمز"><Input dir="ltr" value={sms.auth_prefix} onChange={(e) => set({ sms: { ...sms, auth_prefix: e.target.value.slice(0, 20) } })} /></Field>
            <Field label="اسم المرسل"><Input dir="ltr" value={sms.sender} onChange={(e) => set({ sms: { ...sms, sender: e.target.value.slice(0, 11) } })} /></Field>
          </div>
          <Field label="قالب جسم الطلب (JSON)" hint='المتغيرات: "{{to}}" و "{{text}}" و "{{sender}}" — ضعها بين علامتي تنصيص.'>
            <Textarea dir="ltr" className="font-mono text-xs" value={sms.body_template} onChange={(e) => set({ sms: { ...sms, body_template: e.target.value } })} />
          </Field>
          <Secret label="مفتاح API لبوابة SMS" exists={data.secrets.sms_token} value={tok.sms_token}
            onChange={(v) => setTok({ ...tok, sms_token: v })} onSave={() => saveSecret('sms_token')} busy={busy === 'sms_token'} />
        </section>
      </div>

      <section className="card p-5">
        <h2 className="mb-3 font-bold">الأحداث المُرسلة</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(EVENTS).map(([k, l]) => (
            <label key={k} className="flex items-center justify-between gap-3 rounded-xl bg-mist px-3 py-2.5 text-sm">
              {l}<Toggle on={cfg.events?.[k] ?? false} onChange={(v) => set({ events: { ...cfg.events, [k]: v } })} />
            </label>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <Field label="رقم لتجربة الإرسال" className="w-56"><Input dir="ltr" placeholder="7XXXXXXXX" value={test} onChange={(e) => setTest(e.target.value.replace(/[^\d+]/g, ''))} /></Field>
          <Button variant="outline" loading={busy === 'twhatsapp'} disabled={test.length < 9} onClick={() => sendTest('whatsapp')}><Send className="h-4 w-4" /> تجربة واتساب</Button>
          <Button variant="outline" loading={busy === 'tsms'} disabled={test.length < 9} onClick={() => sendTest('sms')}><Send className="h-4 w-4" /> تجربة SMS</Button>
          <Button variant="ghost" className="mr-auto" onClick={reload}><RefreshCw className="h-4 w-4" /></Button>
        </div>
        <div className="mb-3 flex flex-wrap gap-2 text-xs">{Object.entries(data.stats ?? {}).map(([k, n]) => <Badge key={k} tone={ST[k]}>{k}: {n}</Badge>)}</div>
        <Table head={['الحدث', 'القناة', 'إلى', 'الحالة', 'الوقت', '']} empty={!data.recent.length}>
          {data.recent.map((m) => (
            <tr key={m.id}>
              <Td>{EVENTS[m.event] ?? m.event}</Td><Td>{m.channel === 'whatsapp' ? 'واتساب' : 'SMS'}</Td><Td dir="ltr">{m.to}</Td>
              <Td><Badge tone={ST[m.status]}>{m.status}</Badge>{m.error && <span className="mt-1 block max-w-[240px] truncate text-[11px] text-red-600" title={m.error}>{m.error}</span>}</Td>
              <Td className="text-xs">{formatDate(m.at)}</Td>
              <Td>{['failed', 'skipped'].includes(m.status) && <Button size="sm" variant="ghost" onClick={async () => { await sb.rpc('admin_retry_message', { p_id: m.id }); reload(); }}>إعادة</Button>}</Td>
            </tr>
          ))}
        </Table>
      </section>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
      className={cn('relative h-6 w-11 shrink-0 rounded-full transition', on ? 'bg-brand-500' : 'bg-slate-300')}>
      <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', on ? 'right-0.5' : 'right-[22px]')} />
    </button>
  );
}

function Secret({ label, exists, value, onChange, onSave, busy }: { label: string; exists: boolean; value: string; onChange: (v: string) => void; onSave: () => void; busy: boolean }) {
  return (
    <Field label={label} hint="يُخزَّن مشفّرًا في Vault ولا يمكن قراءته من الواجهة؛ أدخل قيمة جديدة لاستبداله.">
      <div className="flex items-center gap-2">
        <span className="shrink-0">{exists ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <XCircle className="h-5 w-5 text-slate-300" />}</span>
        <Input type="password" autoComplete="off" dir="ltr" placeholder={exists ? '•••••••• (محفوظ)' : 'غير مُعدّ'} value={value} onChange={(e) => onChange(e.target.value)} />
        <Button size="sm" variant="soft" disabled={!value.trim()} loading={busy} onClick={onSave}><KeyRound className="h-4 w-4" /> حفظ</Button>
      </div>
    </Field>
  );
}
