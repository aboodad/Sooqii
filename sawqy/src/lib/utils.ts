import clsx, { type ClassValue } from 'clsx';

export const cn = (...inputs: ClassValue[]) => clsx(inputs);

/** يمنع إعادة التوجيه المفتوح: يقبل المسارات الداخلية فقط */
export function safeNext(next: string | null | undefined, fallback = '/') {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}

/** رسالة خطأ ودّية من أخطاء Supabase */
export function errorMessage(e: unknown): string {
  if (!e) return 'حدث خطأ غير متوقع';
  const msg = typeof e === 'string' ? e : (e as { message?: string }).message || '';
  if (/Failed to fetch|NetworkError|Load failed|timeout/i.test(msg)) return 'تعذر الاتصال بالخادم، تحقق من الإنترنت وحاول مجددًا';
  if (/Invalid login credentials/i.test(msg)) return 'البريد أو كلمة المرور غير صحيحة';
  if (/Email not confirmed/i.test(msg)) return 'يرجى تأكيد بريدك الإلكتروني أولًا';
  if (/User already registered/i.test(msg)) return 'هذا البريد مسجل مسبقًا';
  if (/rate limit|too many/i.test(msg)) return 'محاولات كثيرة، حاول لاحقًا';
  if (/Password should be/i.test(msg)) return 'كلمة المرور ضعيفة، استخدم 8 أحرف على الأقل';
  if (/JWT|session/i.test(msg)) return 'انتهت الجلسة، سجّل الدخول من جديد';
  if (/violates check constraint|invalid input/i.test(msg)) return 'بيانات غير صالحة، تحقق من الحقول';
  if (/permission denied/i.test(msg)) return 'لا تملك صلاحية لهذا الإجراء';
  return /[؀-ۿ]/.test(msg) ? msg : 'تعذر إتمام العملية، حاول مرة أخرى';
}

export function slugify(input: string) {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

/** رابط العودة بعد تأكيد البريد أو استعادة كلمة المرور — يُبنى من النطاق الحالي فيعمل على أي رابط للموقع */
export function authRedirect(next = '/') {
  const origin = typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_SITE_URL || '');
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}
