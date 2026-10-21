'use client';

import * as Sentry from '@sentry/react';
import { useEffect } from 'react';

import { initSentry } from '../utils/sentry';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // global-error.tsx replaces the whole root layout when it renders, so the
    // error that triggered it may have occurred before any layout had a chance
    // to initialize Sentry. Initialize here too (idempotent) before capturing.
    initSentry();
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en" data-theme="night">
      <body>
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="text-base-content/70">{error.message || 'Unexpected application error.'}</p>
          <button className="btn btn-primary" onClick={() => reset()}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
