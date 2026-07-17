import { Hash } from "lucide-react"
import { useAllTags, useVault } from "../store/vault"

export function TagsPanel() {
  const tags = useAllTags()
  const openNote = useVault((s) => s.openNote)
  const nodes = useVault((s) => s.nodes)

  if (tags.size === 0) {
    return (
      <div className="px-3 py-2 text-xs text-[#5c6370]">
        No tags yet. Use #tag in notes.
      </div>
    )
  }

  const entries = [...tags.entries()].sort((a, b) => b[1].length - a[1].length)

  return (
    <div className="px-2 py-1.5">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-[#7a8290] px-1 pb-1.5">
        <Hash size={12} /> Tags ({tags.size})
      </div>
      {entries.map(([tag, noteIds]) => (
        <div key={tag} className="px-1 py-0.5">
          <div className="text-xs text-[#bb9af7] px-1">#{tag} <span className="text-[#5c6370]">({noteIds.length})</span></div>
          <div className="pl-2">
            {noteIds.map((id) => {
              const n = nodes.find((x) => x.id === id)
              if (!n) return null
              return (
                <button
                  key={id}
                  onClick={() => openNote(id)}
                  className="block w-full text-left text-sm text-[#c8cdd6] hover:text-white hover:bg-[#1d2030] px-1 py-0.5 rounded truncate"
                >
                  {n.name}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}