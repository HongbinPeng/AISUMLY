/**
 * 读取后端 SSE 响应流并分发事件。
 * @param {ReadableStream<Uint8Array>} body fetch response body
 * @param {Record<string, Function>} handlers 事件处理函数集合
 */
export async function readSSE(body, handlers = {}) {
  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() || ''
    for (const chunk of chunks) {
      const evt = parseSSEChunk(chunk)
      if (!evt) continue
      handlers.onEvent?.(evt)
      if (evt.event === 'delta') handlers.onDelta?.(evt.data?.content || '')
      if (evt.event === 'tool_result') handlers.onToolResult?.(evt.data)
      if (evt.event === 'clarification') handlers.onClarification?.(evt.data?.question || '')
      if (evt.event === 'done') handlers.onDone?.(evt.data)
      if (evt.event === 'error') handlers.onError?.(evt.data)
    }
  }
}

function parseSSEChunk(chunk) {
  let event = 'message'
  const dataLines = []
  for (const line of chunk.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }
  if (!dataLines.length) return null
  let data = dataLines.join('\n')
  try {
    data = JSON.parse(data)
  } catch {
    data = { raw: data }
  }
  return { event, data }
}
