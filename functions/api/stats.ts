interface Env {
  KV: KVNamespace
}

const COUNT_INDEX_KEY = 'counts:index'

export const onRequest: PagesFunction<Env> = async (context) => {
  const { env } = context

  const counts =
    ((await env.KV.get(COUNT_INDEX_KEY, 'json')) as Record<string, number> | null) ?? {}
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)

  return Response.json({ total, stats: counts })
}
