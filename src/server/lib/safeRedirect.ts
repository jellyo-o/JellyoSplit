/**
 * Server-side validator for post-login redirect targets.
 * Mirrors src/client/lib/safeRedirect.ts so they can't drift apart in spirit.
 *
 * Returns the safe path/URL string, or null if it's not safe.
 *
 * Allowed:
 *  - Same-origin relative paths starting with a single "/" (e.g. "/gathering/join/abc")
 *  - Absolute URLs whose hostname is "split.jellyo.net" or a subdomain of it
 *
 * Rejected:
 *  - Protocol-relative URLs ("//evil.com/path")
 *  - Backslash tricks ("/\evil.com")
 *  - Any other host
 *  - Anything that doesn't parse cleanly
 */
export function safeRedirectTarget(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('/')) {
    if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) return null;
    return trimmed;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  if (host === 'split.jellyo.net' || host.endsWith('.split.jellyo.net')) {
    return url.toString();
  }
  return null;
}
