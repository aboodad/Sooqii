import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/account', '/checkout', '/cart', '/merchant', '/admin', '/auth', '/search'] }],
    sitemap: `${env.siteUrl}/sitemap.xml`,
  };
}
