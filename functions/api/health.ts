interface Env {
  KV?: KVNamespace
  R2?: R2Bucket
  GITHUB_REPO?: string
  GITHUB_TOKEN?: string
  CLEANUP_TOKEN?: string
}

interface GithubProbe {
  status?: number
  limit?: number
  remaining?: number
  message?: string
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { env } = context

  const headers: Record<string, string> = {
    'User-Agent': 'dev-sidemirror',
    Accept: 'application/vnd.github+json',
  }
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`

  let github: GithubProbe
  try {
    const res = await fetch('https://api.github.com/rate_limit', {
      headers,
      signal: AbortSignal.timeout(10000),
    })
    const text = await res.text()
    if (res.ok) {
      const data = JSON.parse(text) as {
        resources?: { core?: { limit?: number; remaining?: number } }
      }
      github = {
        status: res.status,
        limit: data.resources?.core?.limit,
        remaining: data.resources?.core?.remaining,
      }
    } else {
      github = { status: res.status, message: text.slice(0, 200) }
    }
  } catch (error) {
    github = { message: error instanceof Error ? error.message : 'GitHub unreachable' }
  }

  return Response.json({
    repo: env.GITHUB_REPO ?? null,
    githubToken: Boolean(env.GITHUB_TOKEN),
    cleanupToken: Boolean(env.CLEANUP_TOKEN),
    bindings: { kv: Boolean(env.KV), r2: Boolean(env.R2) },
    github,
  })
}
