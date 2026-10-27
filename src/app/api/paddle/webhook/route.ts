import { NextRequest, NextResponse } from 'next/server';
import { verifyPaddleWebhook, PADDLE_WEBHOOK_SECRET } from '@/lib/paddle';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const event = await verifyPaddleWebhook(request, PADDLE_WEBHOOK_SECRET);

    if (!event) {
      console.error('Webhook verification failed');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    console.log('Received Paddle webhook:', event.eventType, event.meta.eventId);

    // Handle different event types
    switch (event.eventType) {
      case 'transaction.completed':
        await handleTransactionCompleted(event.data);
        break;
      case 'subscription.created':
        await handleSubscriptionCreated(event.data);
        break;
      case 'subscription.updated':
        await handleSubscriptionUpdated(event.data);
        break;
      case 'subscription.cancelled':
        await handleSubscriptionCancelled(event.data);
        break;
      case 'subscription.paused':
        await handleSubscriptionPaused(event.data);
        break;
      case 'subscription.resumed':
        await handleSubscriptionResumed(event.data);
        break;
      default:
        console.log('Unhandled event type:', event.eventType);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

async function handleTransactionCompleted(data: any) {
  const transaction = data;
  const customerId = transaction.customerId;
  const customData = transaction.customData || {};
  const items = transaction.details?.lineItems || [];

  for (const item of items) {
    const priceId = item.priceId;
    const productId = item.productId;
    const quantity = item.quantity;

    // Update product total paid
    if (productId) {
      const totalPaidCents = transaction.totals?.total || 0;

      await prisma.product.update({
        where: { paddleProductId: productId },
        data: {
          totalPaidCents: { increment: Math.round(totalPaidCents) },
          lastBidAt: new Date(),
        },
      });

      // Create claim record
      await prisma.claim.create({
        data: {
          productId: (await prisma.product.findUnique({
            where: { paddleProductId: productId },
            select: { id: true }
          }))?.id || '',
          claimantEmail: (await getCustomerEmail(transaction.customerId)) || '',
          amountCents: Math.round(transaction.totals?.total || 0),
          status: 'paid',
          paddleTransactionId: data.id,
        },
      });
    }
  }
}

async function handleSubscriptionCreated(data: any) {
  const subscription = data;
  console.log('Subscription created:', subscription.id);

  // Store subscription info
  await prisma.subscription.upsert({
    where: { paddleSubscriptionId: subscription.id },
    create: {
      paddleSubscriptionId: subscription.id,
      status: subscription.status,
      paddleCustomerId: subscription.customerId,
      paddlePriceId: subscription.items?.[0]?.priceId,
      currentPeriodEnd: new Date(subscription.currentBillingPeriod?.endsAt || Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    update: {
      status: subscription.status,
      currentPeriodEnd: new Date(subscription.currentBillingPeriod?.endsAt || Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
}

async function handleSubscriptionUpdated(data: any) {
  const subscription = data;
  console.log('Subscription updated:', subscription.id);

  await prisma.subscription.upsert({
    where: { paddleSubscriptionId: subscription.id },
    create: {
      paddleSubscriptionId: subscription.id,
      status: subscription.status,
      paddleCustomerId: subscription.customerId,
      paddlePriceId: subscription.items?.[0]?.priceId,
      currentPeriodEnd: new Date(subscription.currentBillingPeriod?.endsAt || Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    update: {
      status: subscription.status,
      paddlePriceId: subscription.items?.[0]?.priceId,
      currentPeriodEnd: new Date(subscription.currentBillingPeriod?.endsAt || Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
}

async function handleSubscriptionCancelled(data: any) {
  const subscription = data;
  console.log('Subscription cancelled:', subscription.id);

  await prisma.subscription.update({
    where: { paddleSubscriptionId: subscription.id },
    data: {
      status: 'cancelled',
      cancelledAt: new Date(),
    },
  });
}

async function handleSubscriptionPaused(data: any) {
  const subscription = data;
  console.log('Subscription paused:', subscription.id);

  await prisma.subscription.update({
    where: { paddleSubscriptionId: subscription.id },
    data: {
      status: 'paused',
    },
  });
}

async function handleSubscriptionResumed(data: any) {
  const subscription = data;
  console.log('Subscription resumed:', subscription.id);

  await prisma.subscription.update({
    where: { paddleSubscriptionId: subscription.id },
    data: {
      status: 'active',
    },
  });
}

async function getCustomerEmail(customerId: string): Promise<string | null> {
  try {
    // In a real implementation, you'd fetch from Paddle
    // For now, return null
    return null;
  } catch {
    return null;
  }
}

// Helper to get Paddle client for server-side operations
async function getPaddleClient(): Promise<any> {
  const { Paddle, Environment } = await import('@paddle/paddle-node-sdk');
  return new Paddle(
    process.env.PADDLE_API_KEY!,
    {
      environment: Environment.sandbox,
    }
  );
}