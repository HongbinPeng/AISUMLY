import { useCallback } from 'react'
import { createUploadURLs, confirmUpload, uploadToOSS } from '../api/index.js'

/**
 * 图片上传 Hook
 * 流程: upload-urls → PUT 并行上传 → confirm
 */
export function useImageUpload() {
  /**
   * 上传一批图片
   * @param {Array} images - [{ blob, filename, mimeType, sha256, size }]
   * @returns {Promise<number[]>} - 已上传成功的 file_ids
   */
  const uploadImages = useCallback(async (images) => {
    if (!images || images.length === 0) return []

    // Step 1: 请求 upload-urls
    const files = images.map(img => ({
      filename: img.filename,
      mime_type: img.mimeType,
      size_bytes: img.size,
      sha256: img.sha256 || '',
    }))

    const uploadData = await createUploadURLs(files)
    // uploadData is { items: [...] }
    const items = uploadData.items || uploadData

    // Step 2: 并行 PUT 上传到 OSS
    // 后端按输入顺序返回 items，直接用索引一一对应即可
    const uploadResults = await Promise.allSettled(
      items.map(async (item) => {
        if (!item.upload_required) {
          return { file_id: item.file_id, status: 'skipped' }
        }
        const img = images.find(i => i.sha256 === item.sha256 && i.sha256 !== '')
          || images.find(i => i.filename === item.filename)
        if (!img) {
          throw new Error(`找不到对应图片: sha256=${item.sha256}`)
        }
        await uploadToOSS(item.upload_url, img.blob, item.headers || {})
        return { file_id: item.file_id, status: 'uploaded' }
      })
    )

    // 收集成功的 file_id
    const successfulIDs = []
    const failedItems = []

    uploadResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successfulIDs.push(result.value.file_id)
      } else {
        failedItems.push({ index, error: result.reason, item: items[index] })
      }
    })

    if (failedItems.length > 0) {
      // 部分上传失败
      const errorMsg = failedItems.map(f => `图片 ${f.index + 1} 上传失败: ${f.error.message}`).join('\n')
      throw { type: 'partial', message: errorMsg, failedItems, successfulIDs }
    }

    // Step 3: 确认上传
    if (successfulIDs.length > 0) {
      await confirmUpload(successfulIDs)
    }

    return successfulIDs
  }, [])

  return { uploadImages }
}
