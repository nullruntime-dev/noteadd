export type NodeType = "folder" | "note"

/**
 * Where the vault's notes live: the server's persistent volume (default),
 * browser IndexedDB, a local disk folder, or a git remote.
 */
export type VaultMode = "volume" | "browser" | "local" | "git"

export interface NoteNode {
  id: string
  name: string
  path: string
  type: NodeType
  parentId: string | null
  content: string
  updatedAt: number
  createdAt: number
}

export interface ParsedNote {
  links: string[]
  tags: string[]
}

export interface GraphNode {
  id: string
  name: string
  path: string
  degree: number
}

export interface GraphLink {
  source: string
  target: string
}