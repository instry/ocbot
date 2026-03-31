import { memo, useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

// Configure marked for GFM with line breaks
marked.setOptions({
  breaks: true,
  gfm: true,
})

interface MarkdownContentProps {
  content: string
}

export const MarkdownContent = memo(function MarkdownContent({ content }: MarkdownContentProps) {
  const html = useMemo(() => {
    const raw = marked.parse(content, { async: false }) as string
    return DOMPurify.sanitize(raw)
  }, [content])

  return (
    <div
      className="cv-markdown prose prose-sm max-w-none
        prose-headings:text-text-strong prose-headings:font-semibold
        prose-p:text-chat-text prose-p:leading-relaxed prose-p:my-2
        prose-a:text-accent prose-a:underline prose-a:underline-offset-2
        prose-code:rounded prose-code:bg-bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-[13px] prose-code:before:content-none prose-code:after:content-none
        prose-pre:bg-bg-muted prose-pre:rounded-lg prose-pre:p-4 prose-pre:my-3
        prose-strong:text-text-strong prose-strong:font-semibold
        prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5
        prose-blockquote:border-l-[3px] prose-blockquote:border-accent prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-muted-foreground
        prose-table:text-[13px]
        prose-th:text-left prose-th:py-1.5 prose-th:px-3 prose-th:border-b prose-th:border-border prose-th:font-semibold prose-th:text-text-strong
        prose-td:py-1.5 prose-td:px-3 prose-td:border-b prose-td:border-border"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
})
