'use client';

import { useEffect, useState } from 'react';

// Type declaration for Paddle.js global
interface PaddleWindow extends Window {
  Paddle?: {
    Initialize: (options: { clientId: string; environment: string }) => void;
    Checkout: {
      open: (options: {
        checkoutId: string;
        settings: {
          displayMode: string;
          frameStyle: string;
          frameTarget: string;
        };
        onSuccess?: () => void;
        onError?: (error: any) => void;
        onClose?: () => void;
      }) => void;
    };
  };
}

interface PaddleCheckoutOptions {
  priceId: string;
  email?: string;
  customData?: Record<string, any>;
  onSuccess?: (checkoutId: string) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
}

export function usePaddleCheckout() {
  const [paddle, setPaddle] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Load Paddle.js
    const script = document.createElement('script');
    script.src = 'https://cdn.paddle.com/paddle/paddle.js';
    script.async = true;
    script.onload = () => {
      const paddleWindow = window as PaddleWindow;
      if (paddleWindow.Paddle) {
        paddleWindow.Paddle.Initialize({
          clientId: process.env.NEXT_PUBLIC_PADDLE_CLIENT_ID!,
          environment: process.env.NEXT_PUBLIC_PADDLE_ENV || 'sandbox',
        });
        setPaddle(paddleWindow.Paddle);
      }
    };
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, []);

  const openCheckout = async ({
    priceId,
    email,
    customData = {},
    onSuccess,
    onError,
    onClose,
  }: PaddleCheckoutOptions) => {
    if (!paddle) {
      onError?.(new Error('Paddle not loaded'));
      return;
    }

    setLoading(true);

    try {
      // Create checkout session via our API
      const response = await fetch('/api/paddle/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, email, customData }),
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout');
      }

      const { url, checkoutId } = await response.json();

      // Open Paddle checkout
      const paddleWindow = window as PaddleWindow;
      paddleWindow.Paddle?.Checkout.open({
        checkoutId,
        settings: {
          displayMode: 'inline',
          frameStyle: 'width: 100%; min-height: 600px;',
          frameTarget: 'paddle-checkout-frame',
        },
        onSuccess: () => {
          onSuccess?.(checkoutId);
        },
        onError: (error: any) => {
          onError?.(error);
        },
        onClose: () => {
          onClose?.();
        },
      });
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error('Checkout failed'));
    } finally {
      setLoading(false);
    }
  };

  return { openCheckout, loading };
}

// Paddle Checkout button component
interface PaddleButtonProps {
  priceId: string;
  email?: string;
  children: React.ReactNode;
  className?: string;
  customData?: Record<string, any>;
  onSuccess?: (checkoutId: string) => void;
  onError?: (error: Error) => void;
}

export function PaddleButton({
  priceId,
  email,
  children,
  className = '',
  customData = {},
  onSuccess,
  onError,
}: PaddleButtonProps) {
  const { openCheckout, loading } = usePaddleCheckout();

  const handleClick = () => {
    openCheckout({
      priceId,
      email,
      customData,
      onSuccess: (checkoutId) => {
        console.log('Checkout success:', checkoutId);
        onSuccess?.(checkoutId);
      },
      onError: (error) => {
        console.error('Checkout error:', error);
        onError?.(error);
      },
    });
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`
        inline-flex items-center justify-center px-6 py-3
        text-base font-semibold text-white
        bg-gradient-to-r from-gold-500 to-gold-600
        rounded-lg
        hover:from-gold-600 hover:to-gold-700
        focus:outline-none focus:ring-2 focus:ring-gold-500 focus:ring-offset-2 focus:ring-offset-abyss-950
        disabled:opacity-50 disabled:cursor-not-allowed
        transition-all duration-200
        ${className}
      `}
    >
      {loading ? (
        <>
          <svg className="animate-spin -ml-1 mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Opening checkout...
        </>
      ) : (
        children
      )}
    </button>
  );
}

// Pricing card with Paddle checkout
interface PricingCardProps {
  name: string;
  price: string;
  priceId: string;
  features: string[];
  featured?: boolean;
  email?: string;
}

export function PricingCard({ name, price, priceId, features, featured = false, email }: PricingCardProps) {
  const { openCheckout, loading } = usePaddleCheckout();

  const handleClick = () => {
    openCheckout({
      priceId,
      onSuccess: (checkoutId) => {
        // Redirect to success page
        window.location.href = `/claim/success?checkout_id=${checkoutId}`;
      },
      onError: (error) => {
        alert('Checkout failed: ' + error.message);
      },
    });
  };

  return (
    <div className={`
      relative rounded-xl p-8 transition-all duration-300
      ${featured
        ? 'bg-gradient-to-br from-gold-500/10 to-gold-600/5 border-2 border-gold-500/50 shadow-[0_0_30px_rgba(245,200,82,0.15)]'
        : 'bg-abyss-800/50 border border-white/10 hover:border-gold-500/30'
      }
    `}>
      {featured && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="px-3 py-1 text-xs font-bold text-abyss-950 bg-gold-400 rounded-full">
            MOST POPULAR
          </span>
        </div>
      )}

      <h3 className="text-xl font-bold text-ivory mb-2">{name}</h3>
      <div className="mb-6">
        <span className="text-4xl font-bold text-gold-400">{price}</span>
        <span className="text-slate-dim ml-2">/ claim</span>
      </div>

      <ul className="mb-8 space-y-3">
        {features.map((feature, i) => (
          <li key={i} className="flex items-center gap-2 text-sm text-mist">
            <svg className="w-5 h-5 text-gold-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {feature}
          </li>
        ))}
      </ul>

      <PaddleButton
        priceId={priceId}
        email={email}
        className="w-full"
        onSuccess={(checkoutId) => {
          window.location.href = `/claim/success?checkout_id=${checkoutId}`;
        }}
        onError={(error) => alert('Checkout failed: ' + error.message)}
      >
        {loading ? 'Opening...' : `Claim ${name}`}
      </PaddleButton>
    </div>
  );
}