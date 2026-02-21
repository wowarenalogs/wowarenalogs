'use client';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
