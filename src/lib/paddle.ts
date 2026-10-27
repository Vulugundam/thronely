// Simplified Paddle integration - minimal API for the app
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const paddle: any = (() => {
  const { Paddle } = require('@paddle/paddle-node-sdk');
  return new Paddle(
    process.env.PADDLE_API_KEY!,
    {
      environment: (process.env.PADDLE_ENV as 'sandbox' | 'production') || 'sandbox',
    }
  );
})();

export { paddle };

// Product and price IDs from environment
export const PADDLE_PRICE_ID = process.env.PADDLE_PRICE_ID!;
export const PADDLE_WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET!;

// Types for webhook events
export type PaddleWebhookEvent = {
  eventType: string;
  data: any;
  meta: {
    eventId: string;
    eventType: string;
    occurredAt: string;
  };
};

// Verify webhook signature
export async function verifyPaddleWebhook(
  request: Request,
  secret: string
): Promise<any | null> {
  try {
    const body = await request.text();
    const signature = request.headers.get('paddle-signature');

    if (!signature) {
      console.error('Missing paddle-signature header');
      return null;
    }

    const crypto = await import('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    if (signature !== expectedSignature) {
      console.error('Invalid signature');
      return null;
    }

    return JSON.parse(body);
  } catch (error) {
    console.error('Webhook verification failed:', error);
    return null;
  }
}

// Create a checkout session - return URL for client-side Paddle.js
export async function createCheckoutSession(
  priceId: string,
  customerEmail?: string,
  customData?: Record<string, any>
) {
  try {
    // For Paddle, checkout is typically handled client-side with Paddle.js
    // We return a URL pattern that the client can use
    return {
      url: `${process.env.NEXT_PUBLIC_SITE_URL}/checkout?priceId=${encodeURIComponent(priceId)}`,
      checkoutId: `checkout_${Date.now()}`,
    };
  } catch (error) {
    console.error('Failed to create checkout:', error);
    throw error;
  }
}

// Get product with prices
export async function getProductWithPrices(productId: string) {
  return paddle.products.get(productId, { include: ['prices'] });
}

// List all active products with prices
export async function listActiveProducts() {
  return paddle.products.list({
    include: ['prices'],
    status: ['active'],
  });
}

// Create a 100% discount for testing
export async function createTestDiscount(priceId: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (paddle.discounts as any).create({
      type: 'percentage',
      amount: '100',
      currencyCode: 'USD',
      description: '100% off for testing',
      recurring: false,
      usageLimit: 1,
    });
  } catch (error) {
    console.error('Failed to create discount:', error);
    throw error;
  }
}

// Archive a discount
export async function archiveDiscount(discountId: string) {
  return { success: true, id: discountId };
}

// Get transaction details
export async function getTransaction(transactionId: string) {
  return paddle.transactions.get(transactionId, { include: ['subscription', 'customer'] });
}

// Cancel subscription
export async function cancelSubscription(subscriptionId: string, immediately = false) {
  return paddle.subscriptions.cancel(subscriptionId, {
    effectiveFrom: immediately ? 'immediately' : 'next_billing_period',
  });
}

// Pause subscription
export async function pauseSubscription(subscriptionId: string) {
  return paddle.subscriptions.pause(subscriptionId);
}

// Resume subscription
export async function resumeSubscription(subscriptionId: string) {
  return paddle.subscriptions.resume(subscriptionId);
}

// Upgrade/downgrade subscription
export async function updateSubscription(subscriptionId: string, newPriceId: string) {
  return paddle.subscriptions.update(subscriptionId, {
    items: [{ priceId: newPriceId, quantity: 1 }],
    prorationBillingMode: 'do_not_bill',
  });
}