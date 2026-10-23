import { prisma } from '@/lib/db';
import { markRequestTime } from '@/lib/request-time';
import { createHmac } from 'node:crypto';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  // Ensure this runs at request time and not prerender
  await markRequestTime();
  const { slug } = await params;

  const product = await prisma.product.findUnique({
    where: { slug },
    select: { id: true, url: true },
  });

  if (!product) {
    // If the target product does not exist, redirect back to the board home
    return Response.redirect('/', 302);
  }

  // Log the click – IP hash + user‑agent, for analytics
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const ua = request.headers.get('user-agent') ?? '';
  const hash = createHmac('sha256', 'thronely-click').update(ip + ua).digest('hex');

  await prisma.click.create({
    data: {
      productId: product.id,
      ipHash: hash,
      userAgent: ua,
      referrer: request.headers.get('referer') || undefined,
    },
  });

  // Append UTM to the destination URL so that clicks can be tracked downstream
  const dest = new URL(product.url);
  if (!dest.searchParams.has('utm_source')) dest.searchParams.set('utm_source', 'thronely');

  return Response.redirect(dest.toString(), 303);
}
