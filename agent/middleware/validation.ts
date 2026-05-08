import { AppError } from './error.js';

/**
 * Validate and normalize a URL. Enforces HTTPS by default.
 * Allows HTTP only for localhost/127.0.0.1 when allowHttp is true.
 * Rejects private/internal IPs and non-HTTP schemes.
 */
export function validateUrl(
  raw: string,
  opts: { allowHttp?: boolean; label: string },
): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new AppError(400, `Invalid ${opts.label}: not a valid URL`);
  }

  // Only allow http: and https: schemes
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new AppError(400, `Invalid ${opts.label}: only HTTP(S) URLs are allowed`);
  }

  // Enforce HTTPS unless allowHttp + localhost
  if (parsed.protocol === 'http:') {
    const hostname = parsed.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    if (!opts.allowHttp || !isLocalhost) {
      throw new AppError(400, `Invalid ${opts.label}: HTTPS is required`);
    }
  }

  // Reject private/internal IP ranges
  if (isPrivateHost(parsed.hostname)) {
    throw new AppError(400, `Invalid ${opts.label}: private or internal addresses are not allowed`);
  }

  // Strip trailing slash
  return parsed.origin;
}

/**
 * Check if a hostname resolves to a private/internal IP range.
 * This is a best-effort check based on the hostname string.
 */
function isPrivateHost(hostname: string): boolean {
  // Skip localhost — already handled by the caller
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return false;
  }

  // IPv4 private ranges
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    // 10.0.0.0/8
    if (a === 10) return true;
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // 169.254.0.0/16 (link-local)
    if (a === 169 && b === 254) return true;
    // 0.0.0.0
    if (a === 0) return true;
    // 127.0.0.0/8 (loopback) — 127.0.0.1 is already exempted above
    if (a === 127) return true;
  }

  // IPv6 private ranges (simple check)
  if (hostname.startsWith('[')) {
    const inner = hostname.slice(1, -1).toLowerCase();
    if (inner.startsWith('fc') || inner.startsWith('fd')) return true; // unique local
    if (inner.startsWith('fe80')) return true; // link-local
    if (inner === '::1') return true; // loopback
  }

  return false;
}

/** Validate a GitHub instance URL */
export function validateGitHubUrl(url: string): string {
  return validateUrl(url, { allowHttp: true, label: 'GitHub URL' });
}

/** Validate the public-facing application URL */
export function validateAppUrl(url: string): string {
  return validateUrl(url, { allowHttp: true, label: 'application URL' });
}
