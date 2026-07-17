import { create } from "zustand"

export interface GitConfig {
  GIT_REMOTE_URL: string
  GIT_BRANCH: string
  GIT_AUTHOR_NAME: string
  GIT_AUTHOR_EMAIL: string
  /** Always comes back masked from server ("***" if set, "" if empty). */
  GIT_TOKEN: string
}

interface GitState {
  config: GitConfig | null
  configured: boolean
  uploading: boolean
  pulling: boolean
  uploadError: string | null
  pullError: string | null
  lastUploadAt: number | null
  lastPullAt: number | null

  loadConfig: () => Promise<void>
  saveConfig: (cfg: Partial<GitConfig> & { GIT_REMOTE_URL: string; GIT_BRANCH: string }) => Promise<boolean>
  upload: (notes: { path: string; content: string }[]) => Promise<boolean>
  pull: () => Promise<{ path: string; content: string }[] | null>
  clearUploadError: () => void
  clearPullError: () => void
}

const EMPTY_CONFIG: GitConfig = {
  GIT_REMOTE_URL: "",
  GIT_BRANCH: "main",
  GIT_AUTHOR_NAME: "notepadd",
  GIT_AUTHOR_EMAIL: "notepadd@local",
  GIT_TOKEN: "",
}

export const useGit = create<GitState>((set, get) => ({
  config: null,
  configured: false,
  uploading: false,
  pulling: false,
  uploadError: null,
  pullError: null,
  lastUploadAt: null,
  lastPullAt: null,

  loadConfig: async () => {
    try {
      const res = await fetch("/api/git/config")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as GitConfig & { configured: boolean }
      set({
        config: {
          GIT_REMOTE_URL: data.GIT_REMOTE_URL ?? "",
          GIT_BRANCH: data.GIT_BRANCH ?? "main",
          GIT_AUTHOR_NAME: data.GIT_AUTHOR_NAME ?? "notepadd",
          GIT_AUTHOR_EMAIL: data.GIT_AUTHOR_EMAIL ?? "notepadd@local",
          GIT_TOKEN: data.GIT_TOKEN ?? "",
        },
        configured: !!data.configured,
      })
    } catch (e) {
      set({
        config: EMPTY_CONFIG,
        configured: false,
        uploadError: e instanceof Error ? `Could not reach server: ${e.message}` : "Could not reach server",
      })
    }
  },

  saveConfig: async (cfg) => {
    set({ uploadError: null })
    try {
      const res = await fetch("/api/git/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        set({ uploadError: data.error ?? `HTTP ${res.status}` })
        return false
      }
      await get().loadConfig()
      return true
    } catch (e) {
      set({ uploadError: e instanceof Error ? e.message : "Failed to save config" })
      return false
    }
  },

  upload: async (notes) => {
    if (!get().configured) {
      set({ uploadError: "Git repo not configured. Open Settings to set remote URL and branch." })
      return false
    }
    set({ uploading: true, uploadError: null })
    try {
      const res = await fetch("/api/git/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        set({ uploading: false, uploadError: data.error ?? `HTTP ${res.status}` })
        return false
      }
      set({ uploading: false, lastUploadAt: Date.now(), uploadError: null })
      return true
    } catch (e) {
      set({ uploading: false, uploadError: e instanceof Error ? e.message : "Upload failed" })
      return false
    }
  },

  clearUploadError: () => set({ uploadError: null }),

  pull: async () => {
    if (!get().configured) {
      set({ pullError: "Git repo not configured. Open Settings to set remote URL and branch." })
      return null
    }
    set({ pulling: true, pullError: null })
    try {
      const res = await fetch("/api/git/pull", { method: "POST" })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        notes?: { path: string; content: string }[]
        message?: string
      }
      if (!res.ok || !data.ok) {
        set({ pulling: false, pullError: data.error ?? `HTTP ${res.status}` })
        return null
      }
      set({ pulling: false, lastPullAt: Date.now(), pullError: null })
      return data.notes ?? []
    } catch (e) {
      set({ pulling: false, pullError: e instanceof Error ? e.message : "Pull failed" })
      return null
    }
  },

  clearPullError: () => set({ pullError: null }),
}))