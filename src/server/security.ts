/**
 * Local-only guard for the Hono app: the tracker never accepts requests that
 * come from (or look like they come from) anywhere but this machine.
 */
import type { MiddlewareHandler } from 'hono';

const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function hostnameOf(raw: string): string | null {
  try {
    return new URL(raw.includes('://') ? raw : `http://${raw}`).hostname;
  } catch {
    return null;
  }
}

/**
 * - Host check on the hostname only (any port): the URL hostname and the raw
 *   Host header must both be loopback when present.
 * - Mutating methods: an Origin header whose hostname is not loopback (or the
 *   literal 'null') is rejected; a body that is not application/json is
 *   rejected (body-less POSTs like skip keep working).
 * - GET/HEAD only get the Host check.
 */
export function localOnly(): MiddlewareHandler {
  return async (c, next) => {
    const hostnames: (string | null)[] = [new URL(c.req.url).hostname];
    const rawHost = c.req.header('host');
    if (rawHost) hostnames.push(hostnameOf(rawHost));
    if (!hostnames.every((h) => h !== null && LOCAL_HOSTNAMES.has(h))) {
      return c.json({ error: 'Forbidden: this server only accepts local requests' }, 403);
    }

    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      const origin = c.req.header('origin');
      if (origin !== undefined) {
        const oh = origin === 'null' ? null : hostnameOf(origin);
        if (oh === null || !LOCAL_HOSTNAMES.has(oh)) {
          return c.json({ error: 'Forbidden: this server only accepts local requests' }, 403);
        }
      }
      const hasBody =
        (Number(c.req.header('content-length')) || 0) > 0 || c.req.header('transfer-encoding') !== undefined;
      if (hasBody) {
        const type = (c.req.header('content-type') ?? '').split(';', 1)[0]?.trim().toLowerCase();
        if (type !== 'application/json') {
          return c.json({ error: 'Request body must be JSON (Content-Type: application/json)' }, 415);
        }
      }
    }

    return next();
  };
}
