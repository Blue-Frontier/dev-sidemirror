import { hasValidSession, isGateEnabled } from './_lib/session'
import { renderGate } from './_lib/gate'

interface Env {
  TURNSTILE_SITE_KEY?: string
  TURNSTILE_SECRET_KEY?: string
  SESSION_SECRET?: string
  STATUS_TOKEN?: string
}

const PUBLIC_PATHS = new Set(['/favicon.ico', '/robots.txt'])

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  if (!isGateEnabled(env)) return context.next()

  const url = new URL(request.url)

  if (
    (url.pathname === '/api/verify' && request.method === 'POST') ||
    PUBLIC_PATHS.has(url.pathname)
  ) {
    return context.next()
  }

  if (url.pathname === '/api/health' && env.STATUS_TOKEN) {
    if (request.headers.get('x-status-token') === env.STATUS_TOKEN) return context.next()
  }

  if (await hasValidSession(request, env)) return context.next()

  const wantsHtml = (request.headers.get('Accept') ?? '').includes('text/html')
  if (request.method === 'GET' && wantsHtml) {
    return new Response(
      renderGate({ siteKey: env.TURNSTILE_SITE_KEY ?? '', next: url.pathname + url.search }),
      {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      },
    )
  }

  return Response.json(
    { error: 'human verification required' },
    { status: 401, headers: { 'Cache-Control': 'no-store' } },
  )
}
