const encoder = new TextEncoder()

const COOKIE_NAME = 'dsm_pass'
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60

interface SessionEnv {
  SESSION_SECRET?: string
  TURNSTILE_SECRET_KEY?: string
}

function secretOf(env: SessionEnv): string {
  return env.SESSION_SECRET || env.TURNSTILE_SECRET_KEY || ''
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function isGateEnabled(env: SessionEnv & { TURNSTILE_SITE_KEY?: string }): boolean {
  return Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY && secretOf(env))
}

export async function createSessionCookie(env: SessionEnv): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  const signature = await hmac(secretOf(env), String(expiresAt))
  return `${COOKIE_NAME}=${expiresAt}.${signature}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`
}

export async function hasValidSession(request: Request, env: SessionEnv): Promise<boolean> {
  const raw = request.headers.get('Cookie') ?? ''
  const entry = raw
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
  if (!entry) return false

  const value = entry.slice(COOKIE_NAME.length + 1)
  const [expiresRaw, signature] = value.split('.')
  const expiresAt = Number(expiresRaw)
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() / 1000) return false

  const expected = await hmac(secretOf(env), expiresRaw)
  return timingSafeEqual(signature ?? '', expected)
}
