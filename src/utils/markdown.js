import { marked } from 'marked'

marked.setOptions({ gfm: true, breaks: true })

export function markdownToHtml(markdown) {
  if (!markdown) return ''
  return marked.parse(markdown, { async: false })
}
