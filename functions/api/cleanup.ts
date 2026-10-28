interface Env {
  R2: R2Bucket
  KV: KVNamespace
  GITHUB_REPO: string
  KEEP_RELEASES_COUNT?: string
  CLEANUP_TOKEN?: string
  GITHUB_TOKEN?: string
}

const COUNT_INDEX_KEY = 'counts:index'

function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status })
}

function isAuthorized(request: Request, env: Env): boolean {
  if (!env.CLEANUP_TOKEN) return false
  const header = request.headers.get('Authorization') ?? ''
  const bearer = header.replace(/^Bearer\s+/i, '')
  const query = new URL(request.url).searchParams.get('token') ?? ''
  return bearer === env.CLEANUP_TOKEN || query === env.CLEANUP_TOKEN
}

async function listKeys(env: Env, prefix: string): Promise<string[]> {
  const keys: string[] = []
  let cursor: string | undefined
  for (let page = 0; page < 10; page++) {
    const listed = await env.R2.list({ prefix, cursor, limit: 1000 })
    keys.push(...listed.objects.map((object) => object.key))
    if (!listed.truncated) break
    cursor = listed.cursor
  }
  return keys
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { env, request } = context

  if (request.method !== 'GET' && request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, POST' } })
  }
  if (!env.CLEANUP_TOKEN) {
    return jsonError(503, 'cleanup disabled: CLEANUP_TOKEN is not configured')
  }
  if (!isAuthorized(request, env)) {
    return jsonError(401, 'Unauthorized')
  }

  const repo = env.GITHUB_REPO
  const keepCount = Number.parseInt(env.KEEP_RELEASES_COUNT ?? '3', 10)
  const headers: Record<string, string> = {
    'User-Agent': 'dev-sidemirror',
    Accept: 'application/vnd.github+json',
  }
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`

  let ghRes: Response
  try {
    ghRes = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100`, {
      headers,
      signal: AbortSignal.timeout(10000),
    })
  } catch (error) {
    console.error('GitHub releases request failed', error)
    return jsonError(502, 'GitHub API unreachable')
  }
  if (!ghRes.ok) {
    return jsonError(502, `GitHub API error (${ghRes.status})`)
  }

  const ghData = (await ghRes.json()) as Array<{
    prerelease: boolean
    draft: boolean
    tag_name: string
  }>
  const stableReleases = ghData
    .filter((release) => !release.prerelease && !release.draft)
    .map((release) => release.tag_name)

  const versionsToDelete = Number.isFinite(keepCount)
    ? stableReleases.slice(Math.max(0, keepCount))
    : []

  const deletedKeys: string[] = []
  for (const version of versionsToDelete) {
    const keys = await listKeys(env, `${version}/`)
    if (keys.length === 0) continue
    for (let start = 0; start < keys.length; start += 1000) {
      await env.R2.delete(keys.slice(start, start + 1000))
    }
    deletedKeys.push(...keys)
  }

  if (deletedKeys.length > 0) {
    const counts =
      ((await env.KV.get(COUNT_INDEX_KEY, 'json')) as Record<string, number> | null) ?? {}
    for (const key of deletedKeys) delete counts[key]
    await env.KV.put(COUNT_INDEX_KEY, JSON.stringify(counts))
  }

  return Response.json({ deleted: deletedKeys.length, versionsDeleted: versionsToDelete })
}
