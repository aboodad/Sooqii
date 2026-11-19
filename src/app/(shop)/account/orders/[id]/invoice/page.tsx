'use client';
import { use } from 'react';
import { Printer } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { formatDate, formatPrice } from '@/lib/format';
import { PAYMENT_CHANNEL, PAYMENT_STATUS } from '@/lib/status';
import { LogoImage } from '@/components/shop/logo';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';

type Line = { id: string; line_code: string; product_name: string; variant_name: string | null; qty: number; unit_price: number; merchant_discount_unit: number; coupon_discount: number; line_total: number };

/** فاتورة قابلة للطباعة / الحفظ PDF من المتصفح. لا تتضمن أسماء المتاجر (سياسة إخفاء البائع). */
export default function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: o, loading } = useQuery(async () => {
    const { data, error } = await getSupabase().from('orders')
      .select('id,order_no,invoice_no,created_at,subtotal,discount_total,points_discount,shipping_total,grand_total,payment_channel,payment_status,address_snapshot, order_items(id,line_code,product_name,variant_name,qty,unit_price,merchant_discount_unit,coupon_discount,line_total)')
      .eq('id', id).single();
    if (error) throw error;
    return data;
  }, [id]);
  if (loading) return <Skeleton className="h-96" />;
  if (!o) return <p className="card p-6">الفاتورة غير متاحة</p>;
  const a = o.address_snapshot as Record<string, string>;
  const lines = (o.order_items as Line[]).sort((x, y) => x.line_code.localeCompare(y.line_code));

  return (
    <div className="space-y-4">
      <div className="flex justify-end print:hidden"><Button onClick={() => window.print()}><Printer className="h-4 w-4" /> طباعة / حفظ PDF</Button></div>
      <article className="card mx-auto max-w-3xl p-6 md:p-10 print:shadow-none print:ring-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-6">
          <div><LogoImage height={44} /><p className="mt-2 text-xs text-ink-muted">منصة سوقي للتسوق الإلكتروني</p></div>
          <div className="text-left text-sm" dir="ltr">
            <p className="text-lg font-extrabold">{o.invoice_no}</p>
            <p className="text-ink-soft">{o.order_no}</p>
            <p className="text-ink-muted">{formatDate(o.created_at)}</p>
          </div>
        </header>
        <section className="grid gap-4 py-6 text-sm sm:grid-cols-2">
          <div><p className="mb-1 text-xs font-semibold text-ink-muted">فاتورة إلى</p><p className="font-bold">{a.recipient_name}</p><p dir="ltr" className="text-right">{a.phone}</p>
            <p className="text-ink-soft">{[a.governorate, a.city, a.district, a.street].filter(Boolean).join('، ')}</p></div>
          <div className="sm:text-left"><p className="mb-1 text-xs font-semibold text-ink-muted">الدفع</p><p className="font-bold">{PAYMENT_CHANNEL[o.payment_channel] ?? o.payment_channel}</p>
            <p className="text-ink-soft">{PAYMENT_STATUS[o.payment_status]?.label}</p></div>
        </section>
        <table className="w-full text-sm">
          <thead className="border-y border-slate-200 bg-slate-50 text-xs text-ink-soft">
            <tr><th className="p-2 text-right">المنتج</th><th className="p-2">الكمية</th><th className="p-2">السعر</th><th className="p-2 text-left">الإجمالي</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="p-2"><p className="font-semibold">{l.product_name}</p><p className="text-[11px] text-ink-muted">{l.variant_name ? `${l.variant_name} · ` : ''}<span dir="ltr">{l.line_code}</span></p></td>
                <td className="p-2 text-center">{l.qty}</td>
                <td className="p-2 text-center">{formatPrice(l.unit_price - l.merchant_discount_unit)}</td>
                <td className="p-2 text-left font-semibold">{formatPrice(l.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mr-auto mt-6 max-w-xs space-y-1.5 text-sm">
          <Row l="المجموع قبل الخصم" v={formatPrice(o.subtotal)} />
          {Number(o.discount_total) > 0 && <Row l="الخصومات" v={`- ${formatPrice(o.discount_total)}`} />}
          <Row l="الشحن" v={formatPrice(o.shipping_total)} />
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-extrabold"><span>الإجمالي</span><span>{formatPrice(o.grand_total)}</span></div>
        </div>
        <p className="mt-10 text-center text-[11px] text-ink-muted">شكرًا لتسوقك من سوقي · هذه فاتورة إلكترونية لا تحتاج إلى توقيع</p>
      </article>
    </div>
  );
}
const Row = ({ l, v }: { l: string; v: string }) => <div className="flex justify-between"><span className="text-ink-soft">{l}</span><span className="font-semibold">{v}</span></div>;
