import { renderGate } from '../_lib/gate'
import { createSessionCookie, isGateEnabled } from '../_lib/session'

interface Env {
  TURNSTILE_SITE_KEY?: string
  TURNSTILE_SECRET_KEY?: string
  SESSION_SECRET?: string
}

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

function safeNext(value: string): string {
  return value.startsWith('/') && !value.startsWith('//') ? value : '/'
}

function html(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context

  if (!isGateEnabled(env)) {
    return new Response(null, { status: 302, headers: { Location: '/' } })
  }

  const form = await request.formData()
  const token = String(form.get('cf-turnstile-response') ?? '')
  const next = safeNext(String(form.get('next') ?? '/'))

  const payload = new FormData()
  payload.append('secret', env.TURNSTILE_SECRET_KEY ?? '')
  payload.append('response', token)
  const ip = request.headers.get('CF-Connecting-IP')
  if (ip) payload.append('remoteip', ip)

  let passed = false
  try {
    const res = await fetch(VERIFY_URL, { method: 'POST', body: payload })
    const data = (await res.json()) as { success?: boolean }
    passed = Boolean(data.success)
  } catch (error) {
    console.error('turnstile verification failed', error)
  }

  if (!passed) {
    return html(
      renderGate({
        siteKey: env.TURNSTILE_SITE_KEY ?? '',
        next,
        error: '验证失败，请重试',
      }),
      403,
    )
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: next,
      'Set-Cookie': await createSessionCookie(env),
      'Cache-Control': 'no-store',
    },
  })
}
