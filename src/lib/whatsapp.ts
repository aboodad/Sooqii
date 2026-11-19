import { formatPrice } from '@/lib/format';
import { PAYMENT_CHANNEL } from '@/lib/status';

/** يحوّل الرقم إلى صيغة wa.me الدولية (اليمن 967 افتراضيًا) */
export function waNumber(raw: string) {
  const d = (raw || '').replace(/\D/g, '');
  if (/^00/.test(d)) return d.slice(2);
  if (/^0?7\d{8}$/.test(d)) return `967${d.slice(-9)}`;
  return d;
}

/** رابط واتساب لإرسال إثبات الدفع إلى إدارة سوقي (لا يتضمن أي بيانات حساسة غير رقم الطلب والمبلغ) */
export function paymentWhatsAppLink(opts: {
  number: string; orderNo: string; total: number; channel: string; account?: string; currencyNote?: string;
}) {
  const lines = [
    'مرحبًا سوقي 👋',
    `أرغب بإتمام دفع الطلب رقم: ${opts.orderNo}`,
    `المبلغ: ${formatPrice(opts.total)}${opts.currencyNote ? ` (${opts.currencyNote})` : ''}`,
    `طريقة الدفع: ${PAYMENT_CHANNEL[opts.channel] ?? opts.channel}`,
    opts.account ? `إلى الحساب: ${opts.account}` : '',
    'سأرسل صورة إشعار التحويل / رقم العملية هنا.',
  ].filter(Boolean);
  const n = waNumber(opts.number);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(lines.join('\n'))}` : null;
}

export function supportWhatsAppLink(number: string, text: string) {
  const n = waNumber(number);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}
