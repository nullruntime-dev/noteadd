import { create } from "zustand"

export interface VolumeNote {
  path: string
  content: string
}

/**
 * Client for the server-backed volume vault (`/api/volume/*`). In volume mode
 * every mutation is written through to the server, which persists notes as
 * .md files inside a Docker volume.
 */
interface VolumeState {
  pulling: boolean
  pushing: boolean
  error: string | null
  lastSyncAt: number | null

  /** Fetch every note stored in the volume; null when the request failed. */
  pull: () => Promise<VolumeNote[] | null>
  /** Queue a note write; queued writes flush as one batched POST after a short debounce. */
  writeNote: (path: string, content: string) => void
  /** Immediately POST a full set of notes (e.g. pushing notes missing from the volume). */
  writeAll: (notes: VolumeNote[]) => Promise<boolean>
  /** Force-send any queued writes now (e.g. when leaving volume mode). */
  flush: () => Promise<void>
  /** Rename/move a note or folder server-side; drops queued writes under `from`. */
  movePath: (from: string, to: string) => Promise<boolean>
  /** Delete a note or folder server-side; drops queued writes under `path`. */
  removePath: (path: string) => Promise<boolean>
  clearError: () => void
}

const WRITE_DEBOUNCE_MS = 1000

// Queued write-through: note path -> content, flushed together in one request.
const pending = new Map<string, string>()
let flushTimer: number | null = null

/** Drop queued writes for `prefix` itself or anything nested below it. */
function dropPending(prefix: string): void {
  for (const key of [...pending.keys()]) {
    if (key === prefix || key.startsWith(`${prefix}/`)) pending.delete(key)
  }
}

async function request(
  method: "POST" | "DELETE",
  url: string,
  body: unknown,
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
    if (!res.ok || !data.ok) return { ok: false, error: data.error ?? `HTTP ${res.status}` }
    return { ok: true, error: null }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not reach server" }
  }
}

export const useVolume = create<VolumeState>((set, get) => ({
  pulling: false,
  pushing: false,
  error: null,
  lastSyncAt: null,

  clearError: () => set({ error: null }),

  pull: async () => {
    set({ pulling: true, error: null })
    try {
      const res = await fetch("/api/volume/notes")
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        notes?: VolumeNote[]
      }
      if (!res.ok || !data.ok) {
        set({ pulling: false, error: data.error ?? `HTTP ${res.status}` })
        return null
      }
      set({ pulling: false, lastSyncAt: Date.now(), error: null })
      return data.notes ?? []
    } catch (e) {
      set({ pulling: false, error: e instanceof Error ? e.message : "Could not reach server" })
      return null
    }
  },

  writeNote: (path, content) => {
    pending.set(path, content)
    if (flushTimer != null) window.clearTimeout(flushTimer)
    flushTimer = window.setTimeout(() => {
      flushTimer = null
      void get().flush()
    }, WRITE_DEBOUNCE_MS)
  },

  flush: async () => {
    if (flushTimer != null) {
      window.clearTimeout(flushTimer)
      flushTimer = null
    }
    if (pending.size === 0) return
    const notes = [...pending.entries()].map(([path, content]) => ({ path, content }))
    pending.clear()
    set({ pushing: true })
    const r = await request("POST", "/api/volume/notes", { notes })
    set({ pushing: false, error: r.error })
  },

  writeAll: async (notes) => {
    set({ pushing: true, error: null })
    const r = await request("POST", "/api/volume/notes", { notes })
    set({ pushing: false, error: r.error })
    return r.ok
  },

  movePath: async (from, to) => {
    dropPending(from)
    const r = await request("POST", "/api/volume/move", { from, to })
    set({ error: r.error })
    return r.ok
  },

  removePath: async (path) => {
    dropPending(path)
    const r = await request("DELETE", "/api/volume/notes", { path })
    set({ error: r.error })
    return r.ok
  },
}))