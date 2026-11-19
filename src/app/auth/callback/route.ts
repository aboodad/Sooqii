import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { getServerSupabase } from '@/lib/supabase/server';
import { safeNext } from '@/lib/utils';

const OTP_TYPES: EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'];

/**
 * تبادل رابط البريد (تأكيد الحساب / استعادة كلمة المرور) بجلسة.
 * يدعم صيغتين:
 *  - token_hash + type: تعمل حتى لو فُتح الرابط من متصفح أو جهاز آخر (موصى بها)
 *  - code (PKCE): تتطلب فتح الرابط من نفس المتصفح الذي أنشأ الطلب
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get('next'));
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const sb = await getServerSupabase();

  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(new URL(type === 'recovery' ? '/auth/update-password' : next, url.origin));
  } else if (code) {
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  // الحساب غالبًا تأكّد بالفعل حتى لو فشل التبادل (فُتح من متصفح آخر) — نوجّه لتسجيل الدخول
  return NextResponse.redirect(new URL('/auth/login?error=link', url.origin));
}
