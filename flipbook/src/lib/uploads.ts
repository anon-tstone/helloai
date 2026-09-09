/**
 * Upload plumbing shared by the Uploads panel and canvas drops.
 *
 * Uploads go to R2 through the Worker. When the API is unreachable — static
 * hosting, or simply offline — the file is kept as a data URL instead, so the
 * editor and the offline export keep working.
 */
import type { AssetRef } from '../shared/types'
import { api } from './api'

export const ACCEPTED_UPLOAD_TYPES = 'image/*,video/mp4,video/webm'

export function isSupportedUpload(file: File): boolean {
  return file.type.startsWith('image/') || file.type === 'video/mp4' || file.type === 'video/webm'
}

export interface UploadOutcome {
  asset: AssetRef
  /** True when the API was unreachable and the file was kept in the document. */
  local: boolean
}

export async function uploadFile(file: File): Promise<UploadOutcome> {
  try {
    return { asset: await api.uploadAsset(file), local: false }
  } catch {
    const url = await fileToDataUrl(file)
    const dims = await measure(file, url)
    return {
      asset: {
        id: `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        mime: file.type,
        size: file.size,
        width: dims?.width,
        height: dims?.height,
        url,
      },
      local: true,
    }
  }
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** Intrinsic size of a locally-held file, so it is placed at its true ratio. */
async function measure(file: File, url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    if (file.type.startsWith('image/')) {
      const img = new Image()
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => resolve(null)
      img.src = url
      return
    }
    if (file.type.startsWith('video/')) {
      const video = document.createElement('video')
      video.onloadedmetadata = () => resolve({ width: video.videoWidth, height: video.videoHeight })
      video.onerror = () => resolve(null)
      video.src = url
      return
    }
    resolve(null)
  })
}
