interface StreamCallbacks {
  onToken: (token: string) => void
  onDone: (fullText: string) => void
  onError: (error: Error) => void
}

export function streamChat(
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  callbacks: StreamCallbacks,
): AbortController {
  const controller = new AbortController()

  ;(async () => {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errorBody = await response.text()
        throw new Error(`OpenAI API error (${response.status}): ${errorBody}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let fullText = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          const data = trimmed.slice(6)
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            const token = parsed.choices?.[0]?.delta?.content
            if (token) {
              fullText += token
              callbacks.onToken(token)
            }
          } catch {
            // skip malformed JSON
          }
        }
      }

      callbacks.onDone(fullText)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        callbacks.onError(err as Error)
      }
    }
  })()

  return controller
}
