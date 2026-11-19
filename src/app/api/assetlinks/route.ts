import { NextResponse } from 'next/server';

/**
 * ملف ربط تطبيق أندرويد (TWA) بالموقع: يُخدَم على /.well-known/assetlinks.json عبر إعادة توجيه داخلية
 * في next.config.mjs، حتى لا يعتمد على رفع مجلد .well-known المخفي (كثير من أدوات الرفع تتجاهله).
 * القيم عامة بطبيعتها (اسم الحزمة وبصمة شهادة التوقيع العامة) وليست أسرارًا.
 */
const LINKS = [
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'app.vercel.sawqy_3.twa',
      sha256_cert_fingerprints: ['C5:7F:75:5F:C9:4F:C5:B3:99:F1:60:C2:35:F0:9C:8F:99:48:A7:A1:00:21:8E:DA:4F:E5:57:0B:E8:11:BB:A9'],
    },
  },
];

export const dynamic = 'force-static';

export function GET() {
  return NextResponse.json(LINKS, {
    headers: { 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' },
  });
}
