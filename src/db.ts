import Dexie, { type Table } from "dexie"
import type { NoteNode } from "./types"

/**
 * IndexedDB-backed vault. Used both as the primary store when the browser
 * lacks the File System Access API, and as a cache mirror when one is open.
 */
export class NoteDB extends Dexie {
  nodes!: Table<NoteNode, string>

  constructor() {
    super("noteadd")
    this.version(1).stores({
      // Index path + type so lookups for all notes or by-path are fast.
      nodes: "id, path, type, parentId, updatedAt",
    })
  }
}

export const db = new NoteDB()