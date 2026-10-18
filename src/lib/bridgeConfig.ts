// Decides whether the app may talk to a mail bridge at all. An empty endpoint is the
// static-preview mode: no connector UI and no request leaves the page's own origin.

export const PREVIEW_NOTICE = 'Preview: sample data, no mailbox connected';

const DEV_FALLBACK_ENDPOINT = 'http://localhost:4100';

// The localhost fallback is dev-only: Vite folds `isDev` to false in a production build,
// so the literal is dropped from the bundle instead of becoming a silent default.
export function resolveBridgeEndpoint(configured: string | undefined, isDev: boolean): string {
  const trimmed = (configured ?? '').trim();
  if (trimmed) return trimmed;
  return isDev ? DEV_FALLBACK_ENDPOINT : '';
}

export function isBridgeEnabled(endpoint: string): boolean {
  return endpoint.trim() !== '';
}
