export type NodeType = "folder" | "note"

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