import { NextRequest, NextResponse } from 'next/server';
import { createCheckoutSession } from '@/lib/paddle';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { priceId, email, customData } = body;

    if (!priceId) {
      return NextResponse.json(
        { error: 'priceId is required' },
        { status: 400 }
      );
    }

    const checkout = await createCheckoutSession(
      priceId,
      email,
      customData
    );

    return NextResponse.json({ url: checkout.url, checkoutId: checkout.checkoutId });
  } catch (error) {
    console.error('Checkout creation failed:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}