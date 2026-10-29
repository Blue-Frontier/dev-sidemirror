import { describe, it, expect } from 'vitest'
import { markdownToHtml } from '../utils/markdown'

describe('markdownToHtml', () => {
  it('renders headings and lists', () => {
    const html = markdownToHtml('### 更新内容\n\n- 第一项\n- 第二项')
    expect(html).toContain('<h3')
    expect(html).toContain('<li>第一项</li>')
    expect(html).toContain('<li>第二项</li>')
  })

  it('renders inline code and links', () => {
    const html = markdownToHtml('用 `npm ci` 安装，见 [文档](https://example.com)')
    expect(html).toContain('<code>npm ci</code>')
    expect(html).toContain('href="https://example.com"')
  })

  it('returns an empty string for empty input', () => {
    expect(markdownToHtml('')).toBe('')
  })
})
