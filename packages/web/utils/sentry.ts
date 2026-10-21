import * as Sentry from '@sentry/react';

/**
 * Initialize the Sentry browser SDK for the web app.
 *
 * Idempotent: safe to call from multiple entry points (the app layout, the
 * desktop layout, the global error boundary) — only the first call installs a
 * client, subsequent calls are no-ops.
 *
 * Historically Sentry was only ever initialized inside DesktopLayout, which
 * renders `null` unless `window.wowarenalogs` is present. That meant plain
 * browser users had no Sentry client at all, so crashes that fell through to
 * `app/global-error.tsx` ("Something went wrong") were never reported.
 */
export function initSentry(): void {
  if (typeof window === 'undefined') {
    return;
  }
  // A client already exists -> Sentry has been initialized; don't re-init.
  if (Sentry.getCurrentHub().getClient()) {
    return;
  }
  Sentry.init({
    dsn: 'https://a076d3d635b64882b87cd3df9b018071@o516205.ingest.sentry.io/5622355',
    tracesSampleRate: 1.0,
    ignoreErrors: ['Non-Error promise rejection captured'],
    release: process.env.NEXT_PUBLIC_COMMIT_SHA,
  });
}
