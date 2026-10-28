<script setup>
import { ref, computed } from 'vue'
import ReleaseCard from './ReleaseCard.vue'
import { useUserAgent } from '@/composables/useUserAgent'

const props = defineProps({
  releases: { type: Array, default: () => [] },
})

const { detectedOS, detectedArch } = useUserAgent()
const showPrereleases = ref(false)

const filteredReleases = computed(() => {
  if (showPrereleases.value) return props.releases
  return props.releases.filter((release) => !release.isPrerelease)
})

const latestTag = computed(() => {
  return props.releases.find((release) => !release.isPrerelease)?.tagName ?? null
})
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-lg font-semibold">Releases ({{ filteredReleases.length }})</h2>
      <label
        class="flex items-center gap-2 text-sm cursor-pointer"
        :style="{ color: 'var(--text-secondary)' }"
      >
        <input type="checkbox" v-model="showPrereleases" class="w-4 h-4 rounded" />
        Show pre-releases
      </label>
    </div>

    <div
      v-if="filteredReleases.length === 0"
      class="text-center py-12"
      :style="{ color: 'var(--text-secondary)' }"
    >
      No releases found.
    </div>

    <div class="space-y-4">
      <ReleaseCard
        v-for="release in filteredReleases"
        :key="release.tagName"
        :release="release"
        :latestTag="latestTag"
        :targetOS="detectedOS"
        :targetArch="detectedArch"
      />
    </div>
  </div>
</template>
