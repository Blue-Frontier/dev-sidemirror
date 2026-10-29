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
  releasesStatus?: number
  releasesMessage?: string
  message?: string
}

const TIMEOUT_MS = 10000

async function probe(env: Env, url: string): Promise<Response> {
  const headers: Record<string, string> = {
    'User-Agent': 'dev-sidemirror',
    Accept: 'application/vnd.github+json',
  }
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`
  return fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { env } = context
  const repo = env.GITHUB_REPO ?? ''
  const github: GithubProbe = {}

  try {
    const res = await probe(env, 'https://api.github.com/rate_limit')
    const text = await res.text()
    if (res.ok) {
      const data = JSON.parse(text) as {
        resources?: { core?: { limit?: number; remaining?: number } }
      }
      github.status = res.status
      github.limit = data.resources?.core?.limit
      github.remaining = data.resources?.core?.remaining
    } else {
      github.status = res.status
      github.message = text.slice(0, 200)
    }
  } catch (error) {
    github.message = error instanceof Error ? error.message : 'GitHub unreachable'
  }

  if (repo) {
    try {
      const res = await probe(env, `https://api.github.com/repos/${repo}/releases?per_page=1`)
      github.releasesStatus = res.status
      if (!res.ok) {
        github.releasesMessage = (await res.text()).slice(0, 200)
      }
    } catch (error) {
      github.releasesMessage = error instanceof Error ? error.message : 'request failed'
    }
  }

  return Response.json({
    repo: env.GITHUB_REPO ?? null,
    githubToken: Boolean(env.GITHUB_TOKEN),
    cleanupToken: Boolean(env.CLEANUP_TOKEN),
    bindings: { kv: Boolean(env.KV), r2: Boolean(env.R2) },
    github,
  })
}
