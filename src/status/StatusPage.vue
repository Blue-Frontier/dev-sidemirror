<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'

const health = ref(null)
const status = ref(null)
const error = ref(null)
const loading = ref(true)
const now = ref(Date.now())

let timer = null

async function load() {
  try {
    const [healthRes, statusRes] = await Promise.all([fetch('/api/health'), fetch('/api/status')])
    if (!healthRes.ok || !statusRes.ok)
      throw new Error(`HTTP ${healthRes.status}/${statusRes.status}`)
    health.value = await healthRes.json()
    status.value = await statusRes.json()
    now.value = Date.now()
    error.value = null
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load()
  timer = setInterval(load, 60000)
})

onUnmounted(() => clearInterval(timer))

const okColor = '#22c55e'
const badColor = '#ef4444'
const idleColor = '#94a3b8'

const overall = computed(() => {
  const value = status.value?.overall?.ok
  if (value === null || value === undefined) return { color: idleColor, label: '暂无数据' }
  return value ? { color: okColor, label: '服务正常' } : { color: badColor, label: '服务异常' }
})

const components = computed(() => {
  const h = health.value
  if (!h) return []
  return [
    {
      name: 'GitHub API',
      ok: h.github?.status === 200,
      detail:
        h.github?.status === 200
          ? `额度剩余 ${h.github.remaining}`
          : `HTTP ${h.github?.status ?? '-'}`,
    },
    {
      name: 'Releases 接口',
      ok: h.github?.releasesStatus === 200,
      detail:
        h.github?.releasesStatus === 200 ? '可读取' : `HTTP ${h.github?.releasesStatus ?? '-'}`,
    },
    { name: 'KV 存储', ok: Boolean(h.bindings?.kv), detail: h.bindings?.kv ? '已绑定' : '未绑定' },
    { name: 'R2 存储', ok: Boolean(h.bindings?.r2), detail: h.bindings?.r2 ? '已绑定' : '未绑定' },
    {
      name: 'GitHub Token',
      ok: Boolean(h.githubToken),
      detail: h.githubToken ? '已配置' : '未配置',
    },
  ]
})

const windows = computed(() => {
  const w = status.value?.windows ?? {}
  return ['24h', '7d', '30d'].map((key) => ({
    key,
    label: { '24h': '24 小时', '7d': '7 天', '30d': '30 天' }[key],
    ...(w[key] ?? { total: 0, ok: 0, uptime: null, avgMs: null }),
  }))
})

const lastCheck = computed(() => {
  const t = status.value?.overall?.last?.t
  if (!t) return '暂无记录'
  return new Date(t).toLocaleString()
})

const avgMs = computed(() => {
  const value = status.value?.windows?.['24h']?.avgMs
  return value === null || value === undefined ? '-' : `${value} ms`
})

const strip = computed(() => {
  const samples = status.value?.samples ?? []
  const bucketMs = 15 * 60 * 1000
  const start = now.value - 24 * 60 * 60 * 1000
  const slots = Array.from({ length: 96 }, () => ({ total: 0, ok: 0 }))
  for (const sample of samples) {
    const index = Math.floor((sample.t - start) / bucketMs)
    if (index < 0 || index >= slots.length) continue
    slots[index].total += 1
    if (sample.ok) slots[index].ok += 1
  }
  return slots.map((slot) => {
    if (slot.total === 0) return idleColor
    return slot.ok === slot.total ? okColor : badColor
  })
})
</script>

<template>
  <div
    class="min-h-screen"
    :style="{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }"
  >
    <header class="border-b py-6" :style="{ borderColor: 'var(--border-color)' }">
      <div class="max-w-3xl mx-auto px-4 flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold">服务状态</h1>
          <p class="mt-1 text-sm" :style="{ color: 'var(--text-secondary)' }">
            Dev SideMirror · 每 15 分钟采样一次
          </p>
        </div>
        <a href="/" class="text-sm hover:underline">返回首页</a>
      </div>
    </header>

    <main class="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div v-if="loading" class="text-center py-12" :style="{ color: 'var(--text-secondary)' }">
        正在检测…
      </div>

      <template v-else>
        <section
          class="rounded-lg border p-5 flex items-center gap-3"
          :style="{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }"
        >
          <span class="w-3 h-3 rounded-full" :style="{ backgroundColor: overall.color }"></span>
          <div>
            <div class="text-lg font-semibold">{{ overall.label }}</div>
            <div class="text-xs" :style="{ color: 'var(--text-secondary)' }">
              最近检查：{{ lastCheck }}
            </div>
          </div>
        </section>

        <section
          class="rounded-lg border divide-y"
          :style="{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }"
        >
          <div
            v-for="component in components"
            :key="component.name"
            class="flex items-center justify-between px-5 py-3"
            :style="{ borderColor: 'var(--border-color)' }"
          >
            <div class="flex items-center gap-3">
              <span
                class="w-2 h-2 rounded-full"
                :style="{ backgroundColor: component.ok ? okColor : badColor }"
              ></span>
              <span class="text-sm">{{ component.name }}</span>
            </div>
            <span class="text-xs" :style="{ color: 'var(--text-secondary)' }">{{
              component.detail
            }}</span>
          </div>
        </section>

        <section class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div
            v-for="w in windows"
            :key="w.key"
            class="rounded-lg border p-4"
            :style="{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }"
          >
            <div class="text-xs" :style="{ color: 'var(--text-secondary)' }">
              {{ w.label }}可用率
            </div>
            <div class="mt-1 text-2xl font-semibold">
              {{ w.uptime === null ? '—' : `${w.uptime}%` }}
            </div>
            <div
              class="mt-2 h-1.5 rounded-full"
              :style="{ backgroundColor: 'var(--bg-secondary)' }"
            >
              <div
                class="h-1.5 rounded-full"
                :style="{
                  width: `${w.uptime === null ? 0 : Math.max(w.uptime, 2)}%`,
                  backgroundColor:
                    w.uptime === null ? idleColor : w.uptime >= 99 ? okColor : badColor,
                }"
              ></div>
            </div>
            <div class="mt-2 text-xs" :style="{ color: 'var(--text-secondary)' }">
              {{ w.total }} 次检查 · 平均 {{ w.avgMs ?? '—' }} ms
            </div>
          </div>
        </section>

        <section
          class="rounded-lg border p-5"
          :style="{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }"
        >
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium">最近 24 小时</span>
            <span class="text-xs" :style="{ color: 'var(--text-secondary)' }"
              >平均响应 {{ avgMs }}</span
            >
          </div>
          <div class="mt-3 grid gap-0.5" style="grid-template-columns: repeat(96, minmax(0, 1fr))">
            <span
              v-for="(color, index) in strip"
              :key="index"
              class="h-6 rounded-sm"
              :style="{ backgroundColor: color }"
            ></span>
          </div>
          <div
            class="mt-2 flex justify-between text-xs"
            :style="{ color: 'var(--text-secondary)' }"
          >
            <span>24 小时前</span>
            <span>现在</span>
          </div>
        </section>

        <p v-if="error" class="text-center text-sm text-red-500">检测失败：{{ error }}</p>
        <p class="text-center text-xs" :style="{ color: 'var(--text-secondary)' }">
          页面每 60 秒自动刷新；每次刷新会向 /api/health 与 /api/status 各发起一次请求。
        </p>
      </template>
    </main>
  </div>
</template>
