interface Env {
  R2: R2Bucket
  KV: KVNamespace
  GITHUB_REPO: string
  R2_MAX_CAPACITY?: string
  GITHUB_TOKEN?: string
}

const COUNT_INDEX_KEY = 'counts:index'
// Workers 内存上限 128MB，超过这个体积的文件直接透传，不进 Worker 内存搬运
const MAX_CACHE_BYTES = 50 * 1024 * 1024
const MAX_LIST_PAGES = 10

interface ResolvedDownload {
  url?: string
  status: number
}

function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status })
}

function githubHeaders(env: Env, extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': 'dev-sidemirror',
    Accept: 'application/vnd.github+json',
    ...extra,
  }
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`
  return headers
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

function splitPath(raw: string | string[] | undefined): { version: string; filename: string } {
  const segments = (Array.isArray(raw) ? raw : [raw ?? '']).map(decodeSegment)
  const filename = segments.pop() ?? ''
  return { version: segments.join('/'), filename }
}

function contentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

async function readCounts(env: Env): Promise<Record<string, number>> {
  const stored = (await env.KV.get(COUNT_INDEX_KEY, 'json')) as Record<string, number> | null
  return stored ?? {}
}

async function bumpCount(env: Env, key: string): Promise<void> {
  const counts = await readCounts(env)
  counts[key] = (counts[key] ?? 0) + 1
  await env.KV.put(COUNT_INDEX_KEY, JSON.stringify(counts))
}

async function listCachedObjects(env: Env): Promise<R2Object[]> {
  const objects: R2Object[] = []
  let cursor: string | undefined
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const listed = await env.R2.list({ cursor, limit: 1000 })
    objects.push(...listed.objects)
    if (!listed.truncated) break
    cursor = listed.cursor
  }
  return objects
}

function parseRange(header: string, size: number): { offset: number; length: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const [, rawStart, rawEnd] = match
  if (!rawStart && !rawEnd) return null

  let start: number
  let end: number
  if (!rawStart) {
    const suffix = Number(rawEnd)
    if (!Number.isFinite(suffix) || suffix <= 0) return null
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(rawStart)
    end = rawEnd ? Number(rawEnd) : size - 1
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null
  return { offset: start, length: Math.min(end, size - 1) - start + 1 }
}

async function serveFromCache(
  env: Env,
  key: string,
  filename: string,
  rangeHeader: string | null,
): Promise<Response | null> {
  if (!rangeHeader) {
    const object = await env.R2.get(key)
    if (!object) return null
    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
        'Content-Length': String(object.size),
        'Content-Disposition': contentDisposition(filename),
        'Accept-Ranges': 'bytes',
        'X-Cache': 'HIT',
      },
    })
  }

  const head = await env.R2.head(key)
  if (!head) return null
  const range = parseRange(rangeHeader, head.size)
  if (!range) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${head.size}`, 'X-Cache': 'HIT' },
    })
  }

  const object = await env.R2.get(key, { range })
  if (!object) return null
  return new Response(object.body, {
    status: 206,
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'Content-Length': String(range.length),
      'Content-Range': `bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}`,
      'Content-Disposition': contentDisposition(filename),
      'Accept-Ranges': 'bytes',
      'X-Cache': 'HIT',
    },
  })
}

async function resolveDownloadUrl(
  env: Env,
  version: string,
  filename: string,
): Promise<ResolvedDownload> {
  const [owner, repo] = env.GITHUB_REPO.split('/')
  let response: Response
  try {
    response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(version)}`,
      { headers: githubHeaders(env), signal: AbortSignal.timeout(10000) },
    )
  } catch (error) {
    console.error('GitHub API request failed', error)
    return { status: 502 }
  }

  if (response.status === 404) return { status: 404 }
  if (!response.ok) return { status: 502 }

  const release = (await response.json()) as {
    assets?: Array<{ name: string; browser_download_url: string }>
  }
  const asset = release.assets?.find((item) => item.name === filename)
  return asset ? { url: asset.browser_download_url, status: 200 } : { status: 404 }
}

async function cacheToR2(
  env: Env,
  key: string,
  body: ReadableStream,
  size: number,
  contentType: string,
): Promise<void> {
  const capacity = Number(env.R2_MAX_CAPACITY ?? '10737418240')
  const objects = await listCachedObjects(env)
  const counts = await readCounts(env)
  let usage = objects.reduce((sum, object) => sum + object.size, 0)

  if (usage + size > capacity) {
    const byUsage = [...objects].sort((a, b) => (counts[a.key] ?? 0) - (counts[b.key] ?? 0))
    for (const victim of byUsage) {
      if (usage + size <= capacity) break
      await env.R2.delete(victim.key)
      delete counts[victim.key]
      usage -= victim.size
    }
    await env.KV.put(COUNT_INDEX_KEY, JSON.stringify(counts))
  }

  if (usage + size > capacity) return

  await env.R2.put(key, body, { httpMetadata: { contentType } })
  counts[key] = counts[key] ?? 1
  await env.KV.put(COUNT_INDEX_KEY, JSON.stringify(counts))
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { env, params, request, waitUntil } = context
  const method = request.method

  if (method !== 'GET' && method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } })
  }

  const { version, filename } = splitPath(params.version)
  if (!version || !filename) return jsonError(400, 'Invalid download path')

  const key = `${version}/${filename}`
  const rangeHeader = request.headers.get('Range')

  const cached = await serveFromCache(env, key, filename, rangeHeader)
  if (cached) {
    waitUntil(
      bumpCount(env, key).catch((error) => console.error('failed to count download', key, error)),
    )
    return cached
  }

  const resolved = await resolveDownloadUrl(env, version, filename)
  if (!resolved.url) {
    return resolved.status === 404
      ? jsonError(404, 'File not found')
      : jsonError(502, 'GitHub API request failed')
  }

  let download: Response
  try {
    download = await fetch(resolved.url, {
      headers: githubHeaders(env, {
        Accept: 'application/octet-stream',
        ...(rangeHeader ? { Range: rangeHeader } : {}),
      }),
      redirect: 'follow',
    })
  } catch (error) {
    console.error('GitHub asset download failed', error)
    return jsonError(502, 'GitHub download failed')
  }

  if (!download.ok) return jsonError(502, `GitHub download failed (${download.status})`)

  const contentType = download.headers.get('Content-Type') ?? 'application/octet-stream'
  const headers = new Headers({
    'Content-Type': contentType,
    'Content-Disposition': contentDisposition(filename),
    'Accept-Ranges': 'bytes',
    'X-Cache': 'MISS',
  })

  const contentLength = download.headers.get('Content-Length')
  if (contentLength) headers.set('Content-Length', contentLength)

  if (download.status === 206) {
    const contentRange = download.headers.get('Content-Range')
    if (contentRange) headers.set('Content-Range', contentRange)
    return new Response(method === 'HEAD' ? null : download.body, { status: 206, headers })
  }

  if (method === 'HEAD' || !download.body) {
    return new Response(null, { status: download.status, headers })
  }

  const size = contentLength ? Number(contentLength) : 0
  if (!contentLength || !size || size > MAX_CACHE_BYTES) {
    return new Response(download.body, { status: download.status, headers })
  }

  const [clientStream, cacheStream] = download.body.tee()
  waitUntil(
    cacheToR2(env, key, cacheStream, size, contentType).catch((error) => {
      console.error('failed to cache release asset', key, error)
    }),
  )

  return new Response(clientStream, { status: download.status, headers })
}
