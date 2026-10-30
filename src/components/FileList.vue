<script setup>
import { computed } from 'vue'
import FileCard from './FileCard.vue'

const props = defineProps({
  assets: { type: Array, default: () => [] },
  version: { type: String, required: true },
  recommendedFile: { type: Object, default: null },
  targetOS: { type: String, default: null },
  targetArch: { type: String, default: null },
})

const orderedAssets = computed(() => {
  const assets = props.assets ?? []
  if (!props.recommendedFile) return assets

  const index = assets.findIndex((asset) => asset.name === props.recommendedFile.name)
  if (index <= 0) return assets

  return [assets[index], ...assets.slice(0, index), ...assets.slice(index + 1)]
})
</script>

<template>
  <div class="space-y-2">
    <FileCard
      v-for="asset in orderedAssets"
      :key="asset.name"
      :asset="asset"
      :version="version"
      :isRecommended="recommendedFile?.name === asset.name"
      :targetOS="targetOS"
      :targetArch="targetArch"
    />
  </div>
</template>
