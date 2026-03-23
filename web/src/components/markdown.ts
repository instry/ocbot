import { marked } from 'marked'
import DOMPurify from 'dompurify'

// Configure marked for safe rendering
marked.setOptions({
  breaks: true,
  gfm: true,
})

/** Render markdown string to sanitized HTML */
export function renderMarkdown(text: string): string {
  if (!text) return ''
  const raw = marked.parse(text) as string
  return DOMPurify.sanitize(raw)
}
