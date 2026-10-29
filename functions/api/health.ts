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

interface Sample {
  t: number
  ms: number
  ok: boolean
}

interface DayBucket {
  total: number
  ok: number
  msSum: number
  samples: Sample[]
}

interface Rollup {
  days: Record<string, DayBucket>
}

const ROLLUP_KEY = 'status:rollup'
const TIMEOUT_MS = 10000
const MAX_SAMPLES_PER_DAY = 96
const RETAIN_DAYS = 35

async function probe(env: Env, url: string): Promise<Response> {
  const headers: Record<string, string> = {
    'User-Agent': 'dev-sidemirror',
    Accept: 'application/vnd.github+json',
  }
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`
  return fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
}

async function recordSample(env: Env, sample: Sample): Promise<void> {
  if (!env.KV) return

  const stored = (await env.KV.get(ROLLUP_KEY, 'json')) as Rollup | null
  const rollup: Rollup = stored ?? { days: {} }

  // 节流：5 分钟内不再记录，避免被刷写放大
  const latest = Object.values(rollup.days)
    .flatMap((bucket) => bucket.samples)
    .reduce<Sample | null>((acc, item) => (!acc || item.t > acc.t ? item : acc), null)
  if (latest && sample.t - latest.t < 5 * 60 * 1000) return

  const day = new Date(sample.t).toISOString().slice(0, 10)
  const bucket: DayBucket = rollup.days[day] ?? { total: 0, ok: 0, msSum: 0, samples: [] }

  bucket.total += 1
  if (sample.ok) bucket.ok += 1
  bucket.msSum += sample.ms
  bucket.samples.push(sample)
  if (bucket.samples.length > MAX_SAMPLES_PER_DAY) {
    bucket.samples = bucket.samples.slice(-MAX_SAMPLES_PER_DAY)
  }
  rollup.days[day] = bucket

  const cutoff = new Date(sample.t - RETAIN_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  for (const key of Object.keys(rollup.days)) {
    if (key < cutoff) delete rollup.days[key]
  }

  await env.KV.put(ROLLUP_KEY, JSON.stringify(rollup))
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { env, request } = context
  const startedAt = Date.now()
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

  const ok =
    github.status === 200 && github.releasesStatus === 200 && Boolean(env.KV) && Boolean(env.R2)

  const shouldRecord = new URL(request.url).searchParams.get('record') === '1'
  if (shouldRecord) {
    context.waitUntil(
      recordSample(env, { t: Date.now(), ms: Date.now() - startedAt, ok }).catch((error) =>
        console.error('failed to record status sample', error),
      ),
    )
  }

  return Response.json({
    repo: env.GITHUB_REPO ?? null,
    ok,
    githubToken: Boolean(env.GITHUB_TOKEN),
    cleanupToken: Boolean(env.CLEANUP_TOKEN),
    bindings: { kv: Boolean(env.KV), r2: Boolean(env.R2) },
    github,
  })
}
