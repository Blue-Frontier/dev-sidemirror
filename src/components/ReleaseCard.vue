<script setup>
import { computed } from 'vue'
import FileList from './FileList.vue'
import { useReleases } from '@/composables/useReleases'

const props = defineProps({
  release: { type: Object, required: true },
  latestTag: { type: String, default: null },
  targetOS: { type: String, default: null },
  targetArch: { type: String, default: null },
})

const { getRecommendedFile } = useReleases()

const isLatestStable = computed(() => {
  return props.latestTag !== null && props.latestTag === props.release.tagName
})

const recommendedFile = computed(() => {
  if (!props.targetOS) return null
  return getRecommendedFile(props.release, props.targetOS, props.targetArch)
})

const formattedDate = computed(() => {
  const d = new Date(props.release.publishedAt)
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
})

const fileCount = computed(() => props.release.releaseAssets?.length || 0)
</script>

<template>
  <div
    class="rounded-lg border p-5 transition-colors"
    :style="{
      backgroundColor: 'var(--bg-card)',
      borderColor: isLatestStable ? 'var(--accent)' : 'var(--border-color)',
    }"
  >
    <div class="flex items-start justify-between">
      <div>
        <div class="flex items-center gap-3">
          <h3 class="text-lg font-semibold">{{ release.tagName }}</h3>
          <span
            v-if="isLatestStable"
            class="px-2 py-0.5 text-xs font-medium rounded-full"
            style="background-color: var(--accent); color: white"
          >
            Latest
          </span>
          <span
            v-if="release.isPrerelease"
            class="px-2 py-0.5 text-xs font-medium rounded-full"
            style="background-color: #f59e0b; color: white"
          >
            Pre-release
          </span>
        </div>
        <p class="mt-1 text-sm" :style="{ color: 'var(--text-secondary)' }">
          {{ formattedDate }} · {{ fileCount }} file{{ fileCount !== 1 ? 's' : '' }}
        </p>
      </div>
    </div>

    <FileList
      v-if="fileCount > 0"
      class="mt-4"
      :assets="release.releaseAssets"
      :version="release.tagName"
      :recommendedFile="recommendedFile"
      :targetOS="targetOS"
      :targetArch="targetArch"
    />
  </div>
</template>
