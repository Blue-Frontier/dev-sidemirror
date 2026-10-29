<script setup>
import { computed, ref } from 'vue'
import DOMPurify from 'dompurify'
import { markdownToHtml } from '@/utils/markdown'

const props = defineProps({
  body: { type: String, required: true },
  htmlUrl: { type: String, default: null },
})

const expanded = ref(false)
const collapsible = computed(() => props.body.length > 600)
const html = computed(() => DOMPurify.sanitize(markdownToHtml(props.body)))
</script>

<template>
  <div>
    <div class="flex items-center justify-between gap-3">
      <span class="text-xs font-medium" :style="{ color: 'var(--text-secondary)' }">更新说明</span>
      <a
        v-if="htmlUrl"
        :href="htmlUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="text-xs hover:underline"
      >
        在 GitHub 查看
      </a>
    </div>

    <div
      class="release-notes mt-2"
      :class="{ 'release-notes--collapsed': collapsible && !expanded }"
      v-html="html"
    ></div>

    <button
      v-if="collapsible"
      type="button"
      class="mt-2 text-xs font-medium"
      :style="{ color: 'var(--accent)' }"
      @click="expanded = !expanded"
    >
      {{ expanded ? '收起' : '展开全部' }}
    </button>
  </div>
</template>
