import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.setOptions({
  gfm: true,
  breaks: true,
})

export function renderMarkdown(
  markdown: string,
  resolveLink: (title: string) => string | undefined,
): string {
  const withAnchors = markdown.replace(
    /\[\[([^\]]+)\]\]/g,
    (_match, title: string) => {
      const target = resolveLink(title.trim())
      if (target) {
        return `[${title.trim()}](#note:${encodeURIComponent(target)})`
      }
      return `<span class="wiki-missing" title="尚未建立">${title.trim()}</span>`
    },
  )
  const rawHtml = marked.parse(withAnchors, { async: false }) as string
  return DOMPurify.sanitize(rawHtml, {
    ADD_ATTR: ['target'],
  })
}
