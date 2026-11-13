/** حالة المشاهدة للزوار تُحفظ محليًا (للمسجّلين تُحفظ في قاعدة البيانات) */
const KEY = 'sawqy-seen-stories';
const MAX = 400;

export function readSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]).slice(-MAX) : []);
  } catch {
    return new Set();
  }
}

export function markSeenLocal(id: string) {
  try {
    const s = readSeen();
    s.add(id);
    localStorage.setItem(KEY, JSON.stringify(Array.from(s).slice(-MAX)));
  } catch { /* التخزين غير متاح: تجاهل */ }
}

/** ألوان ثابتة لأحرف المتاجر التي لا تملك شعارًا */
const TONES = ['#079EA5', '#FF7916', '#7C3AED', '#DB2777', '#0891B2', '#B45309', '#4338CA', '#059669'];
export function storeTone(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}

export const STORY_HOURS = [
  { v: 24, l: '24 ساعة' },
  { v: 72, l: '3 أيام' },
  { v: 168, l: '7 أيام' },
] as const;
