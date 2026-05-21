import { request } from '../utils/request.js'

export async function uploadImageFiles(files) {
  const normalized = Array.from(files || []).filter((file) => file?.type?.startsWith('image/'))
  if (normalized.length === 0) return []

  const payload = await Promise.all(normalized.map(async (file) => ({
    filename: file.name || `image-${Date.now()}.png`,
    mime_type: file.type || 'image/png',
    size_bytes: file.size,
    sha256: await sha256(file),
  })))

  const data = await request('/files/images/upload-urls', {
    method: 'POST',
    body: JSON.stringify({ files: payload }),
  })
  const items = data.items || []

  await Promise.all(items.map(async (item, index) => {
    if (!item.upload_required) return
    const res = await fetch(item.upload_url, {
      method: item.method || 'PUT',
      headers: item.headers || {},
      body: normalized[index],
    })
    if (!res.ok) {
      throw new Error('图片上传失败')
    }
  }))

  await request('/files/images/confirm', {
    method: 'POST',
    body: JSON.stringify({ file_ids: items.map((item) => item.file_id) }),
  })

  return items.map((item, index) => ({
    file_id: item.file_id,
    file: normalized[index],
  }))
}

async function sha256(file) {
  if (!crypto.subtle) return ''
  const buffer = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
