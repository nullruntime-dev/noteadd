import { create } from "zustand"
import { db } from "../db"
import type { NoteNode } from "../types"
import {
  extractTitle,
  normalizeName,
  parseNote,
  sanitizeFilename,
  validateFilename,
} from "../lib/parse"
import { useSync } from "./sync"

const fsAccessSupported =
  typeof window !== "undefined" && "showDirectoryPicker" in window

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

interface FSHandle {
  kind: "directory"
  name: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handle: any
}

interface VaultState {
  fsSupported: boolean
  rootName: string | null
  rootHandle: FSHandle | null
  nodes: NoteNode[]
  activeId: string | null
  loading: boolean
  error: string | null
  validationError: string | null

  openVault: () => Promise<void>
  loadAll: () => Promise<void>
  createNote: (parentId: string | null, name: string) => Promise<string | null>
  createFolder: (parentId: string | null, name: string) => Promise<string | null>
  renameNode: (id: string, newName: string) => Promise<boolean>
  deleteNode: (id: string) => Promise<void>
  updateContent: (id: string, content: string) => Promise<void>
  openNote: (id: string | null) => void
  findByName: (name: string) => NoteNode | undefined
  clearValidationError: () => void
  importNotes: (
    notes: { path: string; content: string }[],
    options?: { skipEditedSince?: number | null },
  ) => Promise<number>
}

async function readDirTree(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dirHandle: any,
  parentId: string | null,
  basePath: string,
  out: NoteNode[],
): Promise<void> {
  for await (const entry of dirHandle.values()) {
    const path = basePath ? `${basePath}/${entry.name}` : entry.name
    if (entry.kind === "directory") {
      const folder: NoteNode = {
        id: uid(),
        name: entry.name,
        path,
        type: "folder",
        parentId,
        content: "",
        updatedAt: Date.now(),
        createdAt: Date.now(),
      }
      out.push(folder)
      await readDirTree(entry, folder.id, path, out)
    } else if (entry.name.endsWith(".md")) {
      const file = await entry.getFile()
      const content = await file.text()
      const note: NoteNode = {
        id: uid(),
        name: entry.name.replace(/\.md$/i, ""),
        path,
        type: "note",
        parentId,
        content,
        updatedAt: file.lastModified,
        createdAt: file.lastModified,
      }
      out.push(note)
    }
  }
}

export const useVault = create<VaultState>((set, get) => ({
  fsSupported: fsAccessSupported,
  rootName: null,
  rootHandle: null,
  nodes: [],
  activeId: null,
  loading: false,
  error: null,
  validationError: null,

  clearValidationError: () => set({ validationError: null }),

  openVault: async () => {
    if (!fsAccessSupported) {
      // Just initialize an empty in-memory vault if nothing exists.
      await get().loadAll()
      if (get().nodes.length === 0) {
        await get().createNote(null, "Welcome")
      }
      return
    }
    try {
      set({ loading: true, error: null })
      // @ts-expect-error: FSA API not in current TS DOM lib typings
      const handle = await window.showDirectoryPicker()
      const nodes: NoteNode[] = []
      await readDirTree(handle, null, "", nodes)
      await db.nodes.clear()
      await db.nodes.bulkPut(nodes)
      set({
        rootName: handle.name,
        rootHandle: { kind: "directory", name: handle.name, handle },
        nodes,
        loading: false,
        activeId: null,
      })
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : "Failed to open vault" })
    }
  },

  loadAll: async () => {
    set({ loading: true })
    const nodes = await db.nodes.toArray()
    set({ nodes, loading: false, rootName: nodes.length ? "Local Vault" : null })
  },

  createNote: async (parentId, name) => {
    const clean = sanitizeFilename(normalizeName(name))
    const validation = validateFilename(clean)
    if (validation) {
      set({ validationError: validation })
      return null
    }
    const parent = parentId ? get().nodes.find((n) => n.id === parentId) : null
    const basePath = parent ? parent.path : ""
    // Ensure unique within parent
    const siblings = get().nodes.filter((n) => n.parentId === parentId)
    const unique = uniqueNameIn(clean, siblings.map((s) => s.name))
    const finalName = unique === clean ? clean : unique
    const finalPath = basePath ? `${basePath}/${finalName}.md` : `${finalName}.md`
    const now = Date.now()
    const node: NoteNode = {
      id: uid(),
      name: finalName,
      path: finalPath,
      type: "note",
      parentId,
      content: `# ${finalName}\n\n`,
      updatedAt: now,
      createdAt: now,
    }
    await db.nodes.put(node)
    set((s) => ({ nodes: [...s.nodes, node], activeId: node.id, validationError: null }))
    await persistFs(get, node)
    return node.id
  },

  createFolder: async (parentId, name) => {
    const clean = sanitizeFilename(name.trim())
    const validation = validateFilename(clean)
    if (validation) {
      set({ validationError: validation })
      return null
    }
    const parent = parentId ? get().nodes.find((n) => n.id === parentId) : null
    const basePath = parent ? parent.path : ""
    const siblings = get().nodes.filter((n) => n.parentId === parentId)
    const unique = uniqueNameIn(clean, siblings.map((s) => s.name))
    const finalName = unique === clean ? clean : unique
    const path = basePath ? `${basePath}/${finalName}` : finalName
    const now = Date.now()
    const node: NoteNode = {
      id: uid(),
      name: finalName,
      path,
      type: "folder",
      parentId,
      content: "",
      updatedAt: now,
      createdAt: now,
    }
    await db.nodes.put(node)
    set((s) => ({ nodes: [...s.nodes, node], validationError: null }))
    return node.id
  },

  renameNode: async (id, newName) => {
    const node = get().nodes.find((n) => n.id === id)
    if (!node) return false
    const clean = sanitizeFilename(
      node.type === "note" ? normalizeName(newName) : newName.trim(),
    )
    const validation = validateFilename(clean)
    if (validation) {
      set({ validationError: validation })
      return false
    }
    const oldPath = node.path
    const parent = node.parentId ? get().nodes.find((n) => n.id === node.parentId) : null
    const basePath = parent ? parent.path : ""
    // Ensure unique among siblings (excluding self)
    const siblings = get().nodes.filter(
      (n) => n.parentId === node.parentId && n.id !== id,
    )
    const unique = uniqueNameIn(clean, siblings.map((s) => s.name))
    const finalName = unique === clean ? clean : unique
    const newPath =
      node.type === "note"
        ? basePath ? `${basePath}/${finalName}.md` : `${finalName}.md`
        : basePath ? `${basePath}/${finalName}` : finalName
    // Cascade rename descendants
    const updateList = (ns: NoteNode[]): NoteNode[] =>
      ns.map((n) => {
        if (n.id === id) return { ...n, name: finalName, path: newPath }
        if (n.path.startsWith(oldPath + "/")) {
          return { ...n, path: newPath + n.path.slice(oldPath.length) }
        }
        return n
      })
    const updated = updateList(get().nodes)
    await db.nodes.bulkPut(updated)
    set({ nodes: updated, validationError: null })
    return true
  },

  deleteNode: async (id) => {
    const node = get().nodes.find((n) => n.id === id)
    if (!node) return
    const toDelete = get().nodes.filter(
      (n) => n.id === id || (node.type === "folder" && n.path.startsWith(node.path + "/")),
    )
    const ids = new Set(toDelete.map((n) => n.id))
    await db.nodes.bulkDelete([...ids])
    set((s) => ({
      nodes: s.nodes.filter((n) => !ids.has(n.id)),
      activeId: ids.has(s.activeId ?? "") ? null : s.activeId,
    }))
  },

  updateContent: async (id, content) => {
    const node = get().nodes.find((n) => n.id === id)
    if (!node || node.type !== "note") return
    useSync.getState().markEdited()

    // If the H1 title changed and is valid, sync the filename to match.
    const title = extractTitle(content)
    let finalNode: NoteNode = { ...node, content, updatedAt: Date.now() }
    let didRename = false
    if (
      title &&
      title !== node.name &&
      validateFilename(title) === null
    ) {
      const sanitized = sanitizeFilename(title)
      if (sanitized && sanitized !== node.name) {
        // Ensure unique among siblings
        const siblings = get().nodes.filter(
          (n) => n.parentId === node.parentId && n.id !== id,
        )
        const unique = uniqueNameIn(sanitized, siblings.map((s) => s.name))
        const finalName = unique === sanitized ? sanitized : unique
        const parent = node.parentId
          ? get().nodes.find((n) => n.id === node.parentId)
          : null
        const basePath = parent ? parent.path : ""
        const newPath = basePath
          ? `${basePath}/${finalName}.md`
          : `${finalName}.md`
        finalNode = { ...finalNode, name: finalName, path: newPath }
        didRename = true
      }
    }

    await db.nodes.put(finalNode)
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? finalNode : n)),
      validationError: null,
    }))
    await persistFs(get, finalNode)
    // If we renamed, the old file should be removed on disk.
    if (didRename) await removeFsFile(get, node)
  },

  openNote: (id) => set({ activeId: id }),

  findByName: (name) => {
    const target = normalizeName(name).toLowerCase()
    return get().nodes.find(
      (n) => n.type === "note" && n.name.toLowerCase() === target,
    )
  },

  importNotes: async (notes, options) => {
    if (notes.length === 0) return 0
    const now = Date.now()
    const existing = [...get().nodes]
    // Index existing by path for quick lookup
    const byPath = new Map(existing.map((n) => [n.path, n]))
    const createdOrUpdated: NoteNode[] = []
    let skippedCount = 0
    // Skip pulling into notes whose updatedAt is newer than this cutoff
    // (i.e. the user has edited them locally since the last sync).
    const skipEditedSince = options?.skipEditedSince ?? null

    for (const note of notes) {
      const safePath = note.path.replace(/^\/+/, "")
      const segments = safePath.split("/")
      const fileName = segments[segments.length - 1]
      const name = fileName.replace(/\.md$/i, "")
      const parentSegments = segments.slice(0, -1)

      // Ensure folders exist
      let parentId: string | null = null
      let curPath = ""
      for (const seg of parentSegments) {
        curPath = curPath ? `${curPath}/${seg}` : seg
        let folder = existing.find((n) => n.path === curPath && n.type === "folder")
        if (!folder) {
          folder = {
            id: uid(),
            name: seg,
            path: curPath,
            type: "folder",
            parentId,
            content: "",
            updatedAt: now,
            createdAt: now,
          }
          existing.push(folder)
          createdOrUpdated.push(folder)
        }
        parentId = folder.id
      }

      const existingNode = byPath.get(safePath)
      if (existingNode && existingNode.type === "note") {
        // If the user edited this note since the last sync, skip overwriting it.
        const wasEdited =
          skipEditedSince != null && existingNode.updatedAt > skipEditedSince
        if (wasEdited) {
          skippedCount++
          continue
        }
        // Update content if changed
        if (existingNode.content !== note.content) {
          const updated: NoteNode = {
            ...existingNode,
            content: note.content,
            updatedAt: now,
          }
          const idx = existing.findIndex((n) => n.id === existingNode.id)
          if (idx >= 0) existing[idx] = updated
          createdOrUpdated.push(updated)
        }
      } else {
        const node: NoteNode = {
          id: uid(),
          name,
          path: safePath,
          type: "note",
          parentId,
          content: note.content,
          updatedAt: now,
          createdAt: now,
        }
        existing.push(node)
        byPath.set(safePath, node)
        createdOrUpdated.push(node)
      }
    }

    await db.nodes.bulkPut(createdOrUpdated)
    set({ nodes: existing, activeId: null })
    return notes.length - skippedCount
  },
}))

/**
 * Append " 2", " 3", ... to `base` to make it unique among `existing` names.
 * Returns `base` if already unique.
 */
function uniqueNameIn(base: string, existing: string[]): string {
  const set = new Set(existing.map((e) => e.toLowerCase()))
  if (!set.has(base.toLowerCase())) return base
  let i = 2
  while (set.has(`${base} ${i}`.toLowerCase())) i++
  return `${base} ${i}`
}

// Cache for FS directory handles so we can persist notes to disk.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dirHandleCache = new Map<string, any>()

async function resolveParentDir(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  root: any,
  segments: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  let cur = root
  const acc: string[] = []
  for (const seg of segments) {
    acc.push(seg)
    const key = acc.join("/")
    if (dirHandleCache.has(key)) {
      cur = dirHandleCache.get(key)
      continue
    }
    cur = await cur.getDirectoryHandle(seg, { create: true })
    dirHandleCache.set(key, cur)
  }
  return cur
}

async function persistFs(
  get: () => VaultState,
  node: NoteNode,
): Promise<void> {
  const root = get().rootHandle?.handle
  if (!root || node.type !== "note") return
  try {
    const segments = node.path.split("/").slice(0, -1).filter(Boolean)
    const dir = await resolveParentDir(root, segments)
    const fileHandle = await dir.getFileHandle(`${node.name}.md`, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(node.content)
    await writable.close()
  } catch {
    // FS persistence best-effort
  }
}

async function removeFsFile(
  get: () => VaultState,
  node: NoteNode,
): Promise<void> {
  const root = get().rootHandle?.handle
  if (!root || node.type !== "note") return
  try {
    const segments = node.path.split("/").slice(0, -1).filter(Boolean)
    const dir = await resolveParentDir(root, segments)
    await dir.removeEntry(`${node.name}.md`)
  } catch {
    // File may not exist on disk yet — best-effort.
  }
}

/** Derived selectors */
export function useBacklinks(noteId: string | null): NoteNode[] {
  const nodes = useVault((s) => s.nodes)
  if (!noteId) return []
  const target = nodes.find((n) => n.id === noteId)
  if (!target) return []
  const wanted = target.name.toLowerCase()
  return nodes.filter(
    (n) => n.type === "note" && n.id !== noteId &&
      parseNote(n.content).links.some((l: string) => normalizeName(l).toLowerCase() === wanted),
  )
}

export function useAllTags(): Map<string, string[]> {
  const nodes = useVault((s) => s.nodes)
  const map = new Map<string, string[]>()
  for (const n of nodes) {
    if (n.type !== "note") continue
    for (const t of parseNote(n.content).tags) {
      const arr = map.get(t) ?? []
      arr.push(n.id)
      map.set(t, arr)
    }
  }
  return map
}