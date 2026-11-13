const nf = new Intl.NumberFormat('ar-YE', { maximumFractionDigits: 0 });
const df = new Intl.DateTimeFormat('ar-YE', { dateStyle: 'medium', timeStyle: 'short' });
const dShort = new Intl.DateTimeFormat('ar-YE', { day: 'numeric', month: 'short' });

export const formatNumber = (n: number | string | null | undefined) => nf.format(Number(n || 0));
export const formatPrice = (n: number | string | null | undefined) => `${nf.format(Number(n || 0))} ر.ي`;
export const formatDate = (d: string | Date) => df.format(new Date(d));
export const formatDay = (d: string | Date) => dShort.format(new Date(d));
export function timeAgo(d: string | Date) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'الآن';
  if (s < 3600) return `منذ ${Math.floor(s / 60)} د`;
  if (s < 86400) return `منذ ${Math.floor(s / 3600)} س`;
  return `منذ ${Math.floor(s / 86400)} يوم`;
}
