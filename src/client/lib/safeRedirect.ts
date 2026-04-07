/**
 * Validates a redirect target to prevent open-redirect vulnerabilities.
 * Returns the safe path/URL string, or null if it's not safe.
 *
 * Allowed:
 *  - Same-origin relative paths starting with a single "/" (e.g. "/gathering/join/abc")
 *  - Absolute URLs whose hostname is "split.jellyo.net" or a subdomain of it
 *
 * Rejected:
 *  - Protocol-relative URLs like "//evil.com/path"
 *  - Backslash tricks like "/\evil.com" (some browsers normalize these to //)
 *  - Any other host (open-redirect bait)
 *  - Anything that doesn't parse cleanly
 */
export function safeRedirectTarget(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Same-origin relative path: must start with exactly one "/", and must NOT
  // be a protocol-relative URL ("//...") or a backslash-trick ("/\...").
  if (trimmed.startsWith('/')) {
    if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) return null;
    return trimmed;
  }

  // Absolute URL — only allow split.jellyo.net or its subdomains.
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
