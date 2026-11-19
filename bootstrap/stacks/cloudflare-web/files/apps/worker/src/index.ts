// The Worker: serves the frontend (static assets, wrangler.jsonc) and the API under /api/*.
// Only /api/* reaches this code; every other path is answered from the assets directly.

const API_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: API_HEADERS });
}

/** The routes under /api. Each returns a Response, or null when it does not match. */
export function handleApi(request: Request, env: Env): Response | null {
  const { pathname } = new URL(request.url);
  if (pathname === '/api/config' && request.method === 'GET') {
    // Public on purpose: scripts/deployed.mjs and the deploy workflow read the commit back from here.
    return json({ environment: env.ENVIRONMENT, version: env.VERSION, branch: env.BRANCH });
  }
  return null;
}

export default {
  fetch(request, env): Response | Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) {
      return handleApi(request, env) ?? json({ error: 'not found' }, 404);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
