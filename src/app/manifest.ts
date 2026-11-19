import type { MetadataRoute } from 'next';

/** بيان تطبيق الويب — يستخدمه المتصفح للتثبيت وPWABuilder لتوليد تطبيق أندرويد */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: 'com.sawqy.app',
    name: 'سوقي — كل ما تحتاجه في مكان واحد',
    short_name: 'سوقي',
    description: 'سوق متاجر ومولات',
    lang: 'ar',
    dir: 'rtl',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#079EA5',
    categories: ['shopping', 'business', 'lifestyle'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'السلة', url: '/cart', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
      { name: 'طلباتي', url: '/account/orders', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
      { name: 'البحث', url: '/search', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
