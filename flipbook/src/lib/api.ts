import type { AssetRef, FlipDoc } from '../shared/types'

export interface ProjectSummary {
  id: string
  title: string
  updatedAt: number
  pageCount: number
  thumbnail: string | null
  published: boolean
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { 'content-type': 'application/json' }
        : {}),
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new ApiError(text || `Request failed (${res.status})`, res.status)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  listProjects: () => request<{ projects: ProjectSummary[] }>('/api/projects'),

  getProject: (id: string) => request<{ id: string; doc: FlipDoc }>(`/api/projects/${id}`),

  createProject: (doc: FlipDoc) =>
    request<{ id: string }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ doc }),
    }),

  saveProject: (id: string, doc: FlipDoc) =>
    request<{ id: string; updatedAt: number }>(`/api/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ doc }),
    }),

  deleteProject: (id: string) => request<void>(`/api/projects/${id}`, { method: 'DELETE' }),

  publish: (id: string, slug?: string) =>
    request<{ slug: string; url: string }>(`/api/projects/${id}/publish`, {
      method: 'POST',
      body: JSON.stringify({ slug }),
    }),

  unpublish: (id: string) =>
    request<void>(`/api/projects/${id}/publish`, { method: 'DELETE' }),

  getPublished: (slug: string) => request<{ doc: FlipDoc }>(`/api/published/${slug}`),

  uploadAsset: async (file: File): Promise<AssetRef> => {
    const form = new FormData()
    form.append('file', file)
    return request<AssetRef>('/api/assets', { method: 'POST', body: form })
  },
}

/**
 * Reads an asset back as a Blob for offline export. Falls back to `fetch` on
 * the public URL, which works for both R2-backed and data-URL assets.
 */
export async function fetchAssetBlob(url: string): Promise<Blob> {
  if (url.startsWith('data:')) {
    const res = await fetch(url)
    return res.blob()
  }
  const res = await fetch(url, { cache: 'force-cache' })
  if (!res.ok) throw new ApiError(`Failed to download asset (${res.status})`, res.status)
  return res.blob()
}
