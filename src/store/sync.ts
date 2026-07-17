import { create } from "zustand"

/**
 * Tracks sync state for auto-sync.
 * - `snapshot` is a content hash of the vault the last time we pushed or pulled,
 *   used to detect whether there's anything to upload.
 * - `lastEditAt` is the timestamp of the most recent local content edit, used to
 *   protect notes from being overwritten by auto-pull.
 */

interface SyncState {
  /** sha-like hash of {path: content} for all notes at last sync point. */
  snapshot: string | null
  /** Timestamp (ms) of the last local edit. */
  lastEditAt: number | null
  /** Timestamp (ms) of the last successful push or pull. */
  lastSyncAt: number | null
  /** Auto-sync enabled by user. */
  autoSync: boolean
  /** Interval in ms. */
  intervalMs: number

  setSnapshot: (hash: string) => void
  markEdited: () => void
  setAutoSync: (on: boolean) => void
  setIntervalMs: (ms: number) => void
}

/** Build a stable string hash of the vault contents for change detection. */
export function hashNotes(notes: { path: string; content: string }[]): string {
  // Sort by path for determinism. Cheap FNV-1a 32-bit hash.
  const sorted = [...notes].sort((a, b) => a.path.localeCompare(b.path))
  let h = 0x811c9dc5
  for (const n of sorted) {
    const s = n.path + "\0" + n.content + "\0"
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
  }
  return (h >>> 0).toString(16)
}

const STORE_KEY = "notepadd.sync.v1"

function loadStored(): { autoSync: boolean; intervalMs: number } {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) {
      const p = JSON.parse(raw) as { autoSync?: boolean; intervalMs?: number }
      return {
        autoSync: p.autoSync ?? false,
        intervalMs: p.intervalMs ?? 60_000,
      }
    }
  } catch {
    // ignore
  }
  return { autoSync: false, intervalMs: 60_000 }
}

const stored = loadStored()

export const useSync = create<SyncState>((set) => ({
  snapshot: null,
  lastEditAt: null,
  lastSyncAt: null,
  autoSync: stored.autoSync,
  intervalMs: stored.intervalMs,

  setSnapshot: (hash) => set({ snapshot: hash }),
  markEdited: () => set({ lastEditAt: Date.now() }),
  setAutoSync: (on) => {
    set({ autoSync: on })
    try {
      const cur = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}")
      localStorage.setItem(STORE_KEY, JSON.stringify({ ...cur, autoSync: on }))
    } catch {
      // ignore
    }
  },
  setIntervalMs: (ms) => {
    set({ intervalMs: ms })
    try {
      const cur = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}")
      localStorage.setItem(STORE_KEY, JSON.stringify({ ...cur, intervalMs: ms }))
    } catch {
      // ignore
    }
  },
}))