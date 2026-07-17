import { useEffect, useMemo, useState } from "react"
import { Search, X } from "lucide-react"
import { useVault } from "../store/vault"

interface SearchProps {
  open: boolean
  onClose: () => void
}

export function SearchPalette({ open, onClose }: SearchProps) {
  const [query, setQuery] = useState("")
  const nodes = useVault((s) => s.nodes)
  const openNote = useVault((s) => s.openNote)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return nodes
      .filter((n) => n.type === "note")
      .map((n) => {
        const nameHit = n.name.toLowerCase().includes(q)
        const bodyHit = n.content.toLowerCase().includes(q)
        const score = (nameHit ? 2 : 0) + (bodyHit ? 1 : 0)
        return { node: n, score }
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.node.name.localeCompare(b.node.name))
      .slice(0, 20)
  }, [query, nodes])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-start justify-center pt-32 z-50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-[#15171c] border border-[#232833] rounded-lg shadow-2xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#232833]">
          <Search size={16} className="text-[#7a8290]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes by name or content..."
            className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-[#5c6370]"
          />
          <button onClick={onClose} className="text-[#7a8290] hover:text-white">
            <X size={16} />
          </button>
        </div>
        <div className="max-h-80 overflow-auto">
          {query && results.length === 0 && (
            <div className="px-4 py-6 text-sm text-[#5c6370] text-center">No results.</div>
          )}
          {results.map(({ node }) => (
            <button
              key={node.id}
              onClick={() => {
                openNote(node.id)
                onClose()
              }}
              className="block w-full text-left px-4 py-2 hover:bg-[#1d2030]"
            >
              <div className="text-sm text-white truncate">{node.name}</div>
              {query.length > 2 && (
                <div className="text-xs text-[#5c6370] truncate">{snippet(node.content, query)}</div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function snippet(content: string, q: string): string {
  const i = content.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return content.slice(0, 80)
  const start = Math.max(0, i - 30)
  return (start > 0 ? "…" : "") + content.slice(start, start + 80).trim()
}