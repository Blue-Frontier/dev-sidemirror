<script setup>
import { onMounted } from 'vue'
import { useReleases } from './composables/useReleases'
import ReleaseList from './components/ReleaseList.vue'

const { releases, loading, error, fetchReleases } = useReleases()

onMounted(() => {
  fetchReleases()
})
</script>

<template>
  <div
    class="min-h-screen"
    :style="{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }"
  >
    <header class="border-b py-6" :style="{ borderColor: 'var(--border-color)' }">
      <div class="max-w-5xl mx-auto px-4 flex items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold">GitHub Release Mirror</h1>
          <p class="mt-1 text-sm" :style="{ color: 'var(--text-secondary)' }">
            Browse and download release files
          </p>
        </div>
        <a href="/status" class="text-sm hover:underline shrink-0">服务状态</a>
      </div>
    </header>

    <main class="max-w-5xl mx-auto px-4 py-8">
      <div v-if="loading" class="text-center py-12" :style="{ color: 'var(--text-secondary)' }">
        Loading releases...
      </div>

      <div v-else-if="error" class="text-center py-12 text-red-500">Error: {{ error }}</div>

      <ReleaseList v-else :releases="releases" />
    </main>
  </div>
</template>
