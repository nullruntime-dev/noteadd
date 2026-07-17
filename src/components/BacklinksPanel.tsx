import { Link2 } from "lucide-react"
import { useBacklinks, useVault } from "../store/vault"

export function BacklinksPanel({ noteId }: { noteId: string }) {
  const backlinks = useBacklinks(noteId)
  const openNote = useVault((s) => s.openNote)

  if (backlinks.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-[#5c6370]">
        No backlinks yet. Use [[Note Name]] in other notes to link here.
      </div>
    )
  }

  return (
    <div className="px-2 py-1.5">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-[#7a8290] px-1 pb-1.5">
        <Link2 size={12} /> Backlinks ({backlinks.length})
      </div>
      {backlinks.map((b) => (
        <button
          key={b.id}
          onClick={() => openNote(b.id)}
          className="block w-full text-left text-sm text-[#c8cdd6] hover:text-white hover:bg-[#1d2030] px-2 py-1 rounded truncate"
        >
          {b.name}
        </button>
      ))}
    </div>
  )
}