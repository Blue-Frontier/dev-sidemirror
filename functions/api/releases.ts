interface Env {
  KV: KVNamespace
  GITHUB_REPO: string
  GITHUB_TOKEN?: string
}

const RELEASES_TTL = 300 // 5 minutes
const RELEASES_FALLBACK_TTL = 60 * 60 * 24 * 7

function cacheKeys(githubRepo: string): { cacheKey: string; fallbackKey: string } {
  return {
    cacheKey: `releases:${githubRepo}`,
    fallbackKey: `releases:last:${githubRepo}`,
  }
}

function githubHeaders(env: Env): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': 'dev-sidemirror',
    Accept: 'application/vnd.github+json',
  }
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`
  return headers
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { env, waitUntil } = context
  const repo = env.GITHUB_REPO
  const { cacheKey, fallbackKey } = cacheKeys(repo)

  const cached = await env.KV.get(cacheKey, 'json')
  if (cached) return Response.json({ releases: cached })

  let ghRes: Response
  try {
    ghRes = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100`, {
      headers: githubHeaders(env),
      signal: AbortSignal.timeout(10000),
    })
  } catch (error) {
    console.error('GitHub releases request failed', error)
    const stale = await env.KV.get(fallbackKey, 'json')
    if (stale) return Response.json({ releases: stale, stale: true })
    return Response.json({ error: 'GitHub API unreachable' }, { status: 502 })
  }

  if (!ghRes.ok) {
    // GitHub 限流或故障时，返回上一次成功的数据，别让页面整块报错
    const stale = await env.KV.get(fallbackKey, 'json')
    if (stale) return Response.json({ releases: stale, stale: true })

    const reason = ghRes.status === 403 ? 'GitHub API rate limited' : 'GitHub API error'
    return Response.json({ error: reason, status: ghRes.status }, { status: 502 })
  }

  const ghData = (await ghRes.json()) as any

  const releases = ghData
    .filter((release: any) => !release.draft)
    .map((release: any) => ({
      tagName: release.tag_name,
      name: release.name || release.tag_name,
      publishedAt: release.published_at,
      isPrerelease: release.prerelease,
      releaseAssets: (release.assets || []).map((asset: any) => ({
        name: asset.name,
        size: asset.size,
        downloadCount: asset.download_count,
        url: asset.browser_download_url,
      })),
    }))

  const serialized = JSON.stringify(releases)
  waitUntil(
    Promise.all([
      env.KV.put(cacheKey, serialized, { expirationTtl: RELEASES_TTL }),
      env.KV.put(fallbackKey, serialized, { expirationTtl: RELEASES_FALLBACK_TTL }),
    ]).catch((error) => console.error('failed to cache releases', error)),
  )

  return Response.json({ releases })
}
