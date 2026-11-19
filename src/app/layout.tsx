import type { Metadata, Viewport } from 'next';
import { Readex_Pro } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { env } from '@/lib/env';

// خط النموذج الثالث المعتمد (متغير الوزن، يُستضاف ذاتيًا عبر next/font)
const readex = Readex_Pro({ subsets: ['arabic', 'latin'], variable: '--font-readex', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: { default: 'سوقي — كل ما تحتاجه في مكان واحد', template: '%s | سوقي' },
  description: 'سوقي منصة تجارة إلكترونية يمنية متعددة المتاجر: سلة واحدة ودفعة واحدة من متاجر موثوقة.',
  applicationName: 'سوقي',
  openGraph: { type: 'website', locale: 'ar_YE', siteName: 'سوقي' },
  icons: { icon: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }], apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'سوقي', statusBarStyle: 'default' },
};
export const viewport: Viewport = { themeColor: '#079EA5', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={readex.variable}>
      <body className="min-h-screen font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
