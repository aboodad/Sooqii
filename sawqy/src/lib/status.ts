type Tone = 'gray' | 'teal' | 'orange' | 'green' | 'red' | 'blue' | 'violet';
type Meta = { label: string; tone: Tone };

export const SUB_STATUS: Record<string, Meta> = {
  pending_merchant: { label: 'بانتظار المتجر', tone: 'orange' },
  accepted: { label: 'مقبول', tone: 'blue' },
  preparing: { label: 'قيد التجهيز', tone: 'violet' },
  ready: { label: 'جاهز للشحن', tone: 'teal' },
  handed_over: { label: 'سُلّم للتوصيل', tone: 'teal' },
  in_transit: { label: 'في الطريق', tone: 'blue' },
  delivered: { label: 'تم التسليم', tone: 'green' },
  delivery_failed: { label: 'تعذّر التسليم', tone: 'red' },
  cancelled: { label: 'ملغي', tone: 'red' },
  return_in_progress: { label: 'قيد الإرجاع', tone: 'orange' },
  returned: { label: 'مُرجَع', tone: 'gray' },
};
export const ORDER_STATUS: Record<string, Meta> = {
  pending_payment: { label: 'بانتظار الدفع', tone: 'orange' },
  confirmed: { label: 'مؤكد', tone: 'blue' },
  in_progress: { label: 'قيد التنفيذ', tone: 'violet' },
  partially_delivered: { label: 'تسليم جزئي', tone: 'teal' },
  delivered: { label: 'مكتمل', tone: 'green' },
  cancelled: { label: 'ملغي', tone: 'red' },
  expired: { label: 'منتهي', tone: 'gray' },
};
export const PAYMENT_STATUS: Record<string, Meta> = {
  unpaid: { label: 'غير مدفوع', tone: 'gray' },
  paid: { label: 'مدفوع', tone: 'green' },
  failed: { label: 'فشل الدفع', tone: 'red' },
  cod_pending: { label: 'الدفع عند الاستلام', tone: 'orange' },
  cod_collected: { label: 'تم التحصيل', tone: 'green' },
  partially_refunded: { label: 'استرداد جزئي', tone: 'violet' },
  refunded: { label: 'مسترد', tone: 'gray' },
};
export const STORE_STATUS: Record<string, Meta> = {
  pending: { label: 'قيد المراجعة', tone: 'orange' },
  active: { label: 'نشط', tone: 'green' },
  suspended: { label: 'معلّق', tone: 'red' },
  rejected: { label: 'مرفوض', tone: 'red' },
  closed: { label: 'مغلق', tone: 'gray' },
};
export const PRODUCT_STATUS: Record<string, Meta> = {
  pending_review: { label: 'قيد المراجعة', tone: 'orange' },
  active: { label: 'معروض', tone: 'green' },
  out_of_stock: { label: 'نفد', tone: 'gray' },
  hidden: { label: 'مخفي', tone: 'gray' },
  discontinued: { label: 'متوقف', tone: 'gray' },
  rejected: { label: 'مرفوض', tone: 'red' },
  archived: { label: 'مؤرشف', tone: 'gray' },
};
export const OFFER_STATUS: Record<string, Meta> = {
  active: { label: 'نشط', tone: 'green' },
  out_of_stock: { label: 'نفد', tone: 'red' },
  hidden: { label: 'مخفي', tone: 'gray' },
  discontinued: { label: 'متوقف', tone: 'gray' },
  archived: { label: 'مؤرشف', tone: 'gray' },
};
export const RETURN_STATUS: Record<string, Meta> = {
  requested: { label: 'مطلوب', tone: 'orange' },
  approved: { label: 'موافق عليه', tone: 'blue' },
  rejected: { label: 'مرفوض', tone: 'red' },
  received: { label: 'مستلم', tone: 'teal' },
  refunded: { label: 'مسترد', tone: 'green' },
};
export const SETTLEMENT_STATUS: Record<string, Meta> = {
  draft: { label: 'مسودة', tone: 'gray' },
  approved: { label: 'معتمدة', tone: 'blue' },
  paid: { label: 'مدفوعة', tone: 'green' },
  cancelled: { label: 'ملغاة', tone: 'red' },
};
export const ROLE_LABEL: Record<string, string> = {
  super_admin: 'مدير عام', admin: 'مدير', operations: 'العمليات', finance: 'المالية', support: 'الدعم',
};
/** الخطوة التالية المتاحة للتاجر لكل حالة */
export const MERCHANT_NEXT: Record<string, { to: string; label: string }[]> = {
  pending_merchant: [{ to: 'accepted', label: 'قبول الطلب' }],
  accepted: [{ to: 'preparing', label: 'بدء التجهيز' }],
  preparing: [{ to: 'ready', label: 'جاهز للشحن' }],
  ready: [{ to: 'handed_over', label: 'تسليم للمندوب' }],
};
export const OPS_NEXT: Record<string, { to: string; label: string }[]> = {
  ...MERCHANT_NEXT,
  handed_over: [{ to: 'in_transit', label: 'خرج للتوصيل' }],
  in_transit: [{ to: 'delivery_failed', label: 'تعذّر التسليم' }],
  delivery_failed: [{ to: 'in_transit', label: 'إعادة المحاولة' }, { to: 'return_in_progress', label: 'إرجاع للمتجر' }],
  return_in_progress: [{ to: 'returned', label: 'تم الإرجاع' }],
};
export const SUB_TIMELINE = ['pending_merchant', 'accepted', 'preparing', 'ready', 'handed_over', 'in_transit', 'delivered'];
