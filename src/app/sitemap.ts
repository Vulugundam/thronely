import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

  const products = await prisma.product.findMany({
    where: { hidden: false },
    select: { slug: true, lastBidAt: true, createdAt: true },
  });

  const staticEntries: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: 'hourly', priority: 1 },
    { url: `${base}/categories`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/claim`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/daily`, changeFrequency: 'hourly', priority: 0.8 },
    { url: `${base}/about`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/rules`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/faq`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/refunds`, changeFrequency: 'yearly', priority: 0.3 },
  ];

  const productEntries: MetadataRoute.Sitemap = products.map((p: { slug: string; lastBidAt: Date | null; createdAt: Date }) => ({
    url: `${base}/product/${p.slug}`,
    // lastmod from the most recent activity, falling back to creation.
    lastModified: p.lastBidAt ?? p.createdAt,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  return [...staticEntries, ...productEntries];
}
