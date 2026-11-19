import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const PROTECTED = ['/account', '/checkout', '/merchant', '/admin', '/sell', '/courier', '/hub'];
const isProtected = (path: string) => PROTECTED.some((p) => path === p || path.startsWith(p + '/'));

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  let response = NextResponse.next({ request });

  // الصفحات العامة لا تحتاج أي اتصال بخادم المصادقة — هذا يسرّع التصفح كثيرًا.
  // عميل المتصفح يتولى تجديد الجلسة تلقائيًا.
  if (!isProtected(path)) return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // قراءة الجلسة من الكوكي محليًا (وتجديدها فقط عند انتهائها) بدل رحلة شبكة في كل طلب.
  // هذا للتوجيه فقط؛ حماية البيانات الفعلية في قاعدة البيانات عبر RLS والدوال المحمية.
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    url.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }

  // الصفحات المحمية لا تُفهرس
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|\\.well-known/|manifest.webmanifest|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|svg|webp|avif)$).*)'],
};
