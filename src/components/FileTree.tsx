import { useMemo, useState } from "react"
import { ChevronRight, ChevronDown, FilePlus, FolderPlus, Trash2, Pencil } from "lucide-react"
import clsx from "clsx"
import { useVault } from "../store/vault"
import type { NoteNode } from "../types"

interface TreeNodeProps {
  node: NoteNode
  depth: number
}

export function FileTree() {
  const nodes = useVault((s) => s.nodes)
  const createNote = useVault((s) => s.createNote)
  const createFolder = useVault((s) => s.createFolder)

  const roots = useMemo(
    () => nodes.filter((n) => n.parentId === null).sort(compareNodes),
    [nodes],
  )

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#232833]">
        <span className="text-xs uppercase tracking-wide text-[#7a8290]">Vault</span>
        <div className="flex gap-1">
          <button
            onClick={() => createNote(null, "Untitled")}
            title="New note"
            className="p-1.5 rounded hover:bg-[#2a2f3a] text-[#a0a7b5] hover:text-white"
          >
            <FilePlus size={14} />
          </button>
          <button
            onClick={() => createFolder(null, "New Folder")}
            title="New folder"
            className="p-1.5 rounded hover:bg-[#2a2f3a] text-[#a0a7b5] hover:text-white"
          >
            <FolderPlus size={14} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto py-1">
        {roots.length === 0 ? (
          <div className="px-3 py-4 text-xs text-[#5c6370]">
            No notes yet. Click + above.
          </div>
        ) : (
          roots.map((n) => <TreeNode key={n.id} node={n} depth={0} />)
        )}
      </div>
    </div>
  )
}

function TreeNode({ node, depth }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(true)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(node.name)

  const nodes = useVault((s) => s.nodes)
  const activeId = useVault((s) => s.activeId)
  const openNote = useVault((s) => s.openNote)
  const createNote = useVault((s) => s.createNote)
  const createFolder = useVault((s) => s.createFolder)
  const renameNode = useVault((s) => s.renameNode)
  const deleteNode = useVault((s) => s.deleteNode)

  const children = useMemo(
    () => nodes.filter((n) => n.parentId === node.id).sort(compareNodes),
    [nodes, node.id],
  )

  const isActive = activeId === node.id

  function onClick() {
    if (node.type === "folder") setExpanded((e) => !e)
    else openNote(node.id)
  }

  async function commitRename() {
    setRenaming(false)
    if (name.trim() && name !== node.name) await renameNode(node.id, name)
    else setName(node.name)
  }

  return (
    <div>
      <div
        className={clsx(
          "group flex items-center gap-1 pr-2 py-1 cursor-pointer select-none",
          isActive && "bg-[#1d2030]",
        )}
        style={{ paddingLeft: depth * 12 + 8 }}
        onClick={onClick}
      >
        {node.type === "folder" ? (
          expanded ? <ChevronDown size={14} className="text-[#7a8290] flex-shrink-0" /> : <ChevronRight size={14} className="text-[#7a8290] flex-shrink-0" />
        ) : (
          <span className="w-[14px] flex-shrink-0" />
        )}
        <span className={clsx("flex-1 truncate text-sm", isActive ? "text-white" : "text-[#c8cdd6]")}>
          {renaming ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename()
                if (e.key === "Escape") {
                  setRenaming(false)
                  setName(node.name)
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-[#0f1115] border border-[#4a5266] rounded px-1 text-sm"
            />
          ) : (
            node.name
          )}
        </span>
        {!renaming && (
          <div className="hidden group-hover:flex gap-0.5">
            {node.type === "folder" && (
              <>
                <button
                  title="New note"
                  onClick={(e) => {
                    e.stopPropagation()
                    createNote(node.id, "Untitled")
                    setExpanded(true)
                  }}
                  className="p-0.5 hover:bg-[#2a2f3a] rounded text-[#a0a7b5]"
                >
                  <FilePlus size={12} />
                </button>
                <button
                  title="New folder"
                  onClick={(e) => {
                    e.stopPropagation()
                    createFolder(node.id, "New Folder")
                    setExpanded(true)
                  }}
                  className="p-0.5 hover:bg-[#2a2f3a] rounded text-[#a0a7b5]"
                >
                  <FolderPlus size={12} />
                </button>
              </>
            )}
            <button
              title="Rename"
              onClick={(e) => {
                e.stopPropagation()
                setRenaming(true)
              }}
              className="p-0.5 hover:bg-[#2a2f3a] rounded text-[#a0a7b5]"
            >
              <Pencil size={12} />
            </button>
            <button
              title="Delete"
              onClick={(e) => {
                e.stopPropagation()
                if (confirm(`Delete "${node.name}"?`)) deleteNode(node.id)
              }}
              className="p-0.5 hover:bg-[#2a2f3a] rounded text-[#f7768e]"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>
      {node.type === "folder" && expanded && children.length > 0 && (
        <div>
          {children.map((c) => <TreeNode key={c.id} node={c} depth={depth + 1} />)}
        </div>
      )}
    </div>
  )
}

function compareNodes(a: NoteNode, b: NoteNode): number {
  if (a.type !== b.type) return a.type === "folder" ? -1 : 1
  return a.name.localeCompare(b.name)
}