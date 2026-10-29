interface Env {
  KV?: KVNamespace
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
const HOUR = 60 * 60 * 1000

function summarize(samples: Sample[], windowMs: number, now: number) {
  const cutoff = now - windowMs
  const inWindow = samples.filter((sample) => sample.t >= cutoff)
  const total = inWindow.length
  const okCount = inWindow.filter((sample) => sample.ok).length
  const msSum = inWindow.reduce((sum, sample) => sum + sample.ms, 0)
  return {
    total,
    ok: okCount,
    uptime: total === 0 ? null : Math.round((okCount / total) * 10000) / 100,
    avgMs: total === 0 ? null : Math.round(msSum / total),
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { env } = context
  const now = Date.now()

  const stored = env.KV ? ((await env.KV.get(ROLLUP_KEY, 'json')) as Rollup | null) : null
  const samples: Sample[] = stored
    ? Object.values(stored.days)
        .flatMap((bucket) => bucket.samples)
        .sort((a, b) => a.t - b.t)
    : []

  const last = samples.length > 0 ? samples[samples.length - 1] : null

  return Response.json({
    generatedAt: now,
    overall: { ok: last ? last.ok : null, last },
    windows: {
      '24h': summarize(samples, 24 * HOUR, now),
      '7d': summarize(samples, 7 * 24 * HOUR, now),
      '30d': summarize(samples, 30 * 24 * HOUR, now),
    },
    samples: samples.filter((sample) => sample.t >= now - 24 * HOUR),
  })
}
