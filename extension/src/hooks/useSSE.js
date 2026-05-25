import { useRef, useCallback } from 'react'
import { streamChat } from '../api/index.js'

/**
 * 解析 SSE 事件流
 * 格式: event: xxx\ndata: {...}\n\n
 */
function parseSSE(reader, onEvent, onComplete, onError) {
  const decoder = new TextDecoder()
  let buffer = ''

  async function readLoop() {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Split by double newline (SSE event boundary)
      const parts = buffer.split('\n\n')
      // Keep the last incomplete part in buffer
      buffer = parts.pop() || ''

      for (const part of parts) {
        if (!part.trim()) continue
        const lines = part.split('\n')
        let event = 'message'
        let data = null

        for (const line of lines) {
          if (line.startsWith('event:')) {
            event = line.slice(6).trim()
          } else if (line.startsWith('data:')) {
            const dataStr = line.slice(5).trim()
            try {
              data = JSON.parse(dataStr)
            } catch {
              data = dataStr
            }
          }
        }

        if (event === 'completed' || event === 'done') {
          onComplete?.(data)
          return
        } else if (event === 'error') {
          onError?.(data)
          return
        } else {
          onEvent?.(event, data)
        }
      }
    }
  }

  return readLoop()
}

/**
 * 流式聊天 Hook
 * @returns { startStream } 启动流式请求
 */
export function useSSE() {
  const abortRef = useRef(null)

  const startStream = useCallback(async (requestBody, { onEvent, onComplete, onError }) => {
    let reader = null
    try {
      const readableStream = await streamChat(requestBody)
      reader = readableStream.getReader()
      abortRef.current = reader

      await parseSSE(reader, onEvent, onComplete, onError)
    } catch (err) {
      if (err?.name === 'AbortError') return
      onError?.({ code: 50000, message: err?.message || '网络请求失败' })
    } finally {
      if (abortRef.current === reader) {
        abortRef.current = null
      }
      try {
        reader?.releaseLock?.()
      } catch {
        // Reader may already be released after cancellation.
      }
    }
  }, [])

  const abort = useCallback(() => {
    const reader = abortRef.current
    abortRef.current = null
    reader?.cancel?.().catch?.(() => {})
  }, [])

  return { startStream, abort }
}
