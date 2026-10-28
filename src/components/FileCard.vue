<script setup>
import { computed } from 'vue'
import { parseFilename, getOSIcon, getOSLabel, getArchLabel } from '@/utils/filenameParser'

const props = defineProps({
  asset: { type: Object, required: true },
  version: { type: String, required: true },
  isRecommended: { type: Boolean, default: false },
  targetOS: { type: String, default: null },
  targetArch: { type: String, default: null },
})

const parsed = computed(() => parseFilename(props.asset.name))
const osIcon = computed(() => getOSIcon(parsed.value.os))
const osLabel = computed(() => getOSLabel(parsed.value.os))
const archLabel = computed(() => getArchLabel(parsed.value.arch))

const formattedSize = computed(() => {
  const bytes = props.asset.size
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
})

const downloadUrl = computed(() => {
  return `/api/download/${encodeURIComponent(props.version)}/${encodeURIComponent(props.asset.name)}`
})
</script>

<template>
  <a
    :href="downloadUrl"
    class="flex items-center justify-between p-3 rounded-lg border transition-colors hover:opacity-80"
    :style="{
      backgroundColor: isRecommended ? 'var(--bg-secondary)' : 'var(--bg-card)',
      borderColor: isRecommended ? 'var(--accent)' : 'var(--border-color)',
    }"
  >
    <div class="flex items-center gap-3">
      <span class="text-xl">{{ osIcon }}</span>
      <div>
        <div class="flex items-center gap-2">
          <span class="font-medium text-sm">{{ asset.name }}</span>
          <span
            v-if="isRecommended"
            class="px-1.5 py-0.5 text-xs font-medium rounded"
            style="background-color: var(--accent); color: white"
          >
            Recommended
          </span>
        </div>
        <div
          class="flex items-center gap-2 mt-0.5 text-xs"
          :style="{ color: 'var(--text-secondary)' }"
        >
          <span v-if="osLabel !== 'Unknown'">{{ osLabel }}</span>
          <span v-if="archLabel">{{ archLabel }}</span>
          <span>·</span>
          <span>{{ formattedSize }}</span>
        </div>
      </div>
    </div>

    <div
      class="px-3 py-1.5 text-sm font-medium rounded"
      :style="{
        backgroundColor: isRecommended ? 'var(--accent)' : 'var(--bg-secondary)',
        color: isRecommended ? 'white' : 'var(--text-primary)',
      }"
    >
      Download
    </div>
  </a>
</template>
