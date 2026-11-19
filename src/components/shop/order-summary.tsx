import type { CartData } from '@/lib/types';
import { formatPrice } from '@/lib/format';

export function OrderSummary({ cart, children }: { cart: CartData; children?: React.ReactNode }) {
  const t = cart.totals;
  return (
    <div className="card space-y-3 p-5">
      <h2 className="text-lg font-bold">ملخص الطلب</h2>
      <Row label={`المنتجات (${cart.count})`} value={formatPrice(t.original_subtotal)} />
      {t.merchant_discount > 0 && <Row label="خصومات المتاجر" value={`- ${formatPrice(t.merchant_discount)}`} green />}
      {t.coupon_discount > 0 && <Row label="الكوبون" value={`- ${formatPrice(t.coupon_discount)}`} green />}
      {(t.points_discount ?? 0) > 0 && <Row label="خصم النقاط" value={`- ${formatPrice(t.points_discount)}`} green />}
      <Row label="الشحن" value={t.shipping > 0 ? formatPrice(t.shipping) : 'مجاني'} />
      <div className="flex items-center justify-between border-t border-dashed border-slate-200 pt-3">
        <span className="font-bold">الإجمالي</span>
        <span className="text-2xl font-extrabold text-brand-700">{formatPrice(t.grand_total)}</span>
      </div>
      {children}
    </div>
  );
}
function Row({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return <div className="flex justify-between text-sm"><span className="text-ink-soft">{label}</span><span className={green ? 'font-semibold text-emerald-600' : 'font-semibold'}>{value}</span></div>;
}
