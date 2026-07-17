import { useEffect, useRef, useMemo } from "react"
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
} from "d3-force"
import { useVault } from "../store/vault"
import type { GraphLink, GraphNode } from "../types"
import { normalizeName, parseNote } from "../lib/parse"

interface GraphViewProps {
  onClose: () => void
}

type SimNode = GraphNode & SimulationNodeDatum
type SimLink = GraphLink & { source: SimNode | string; target: SimNode | string }

export function GraphView({ onClose }: GraphViewProps) {
  const nodes = useVault((s) => s.nodes)
  const openNote = useVault((s) => s.openNote)
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const { graphNodes, links } = useMemo(() => {
    const notes = nodes.filter((n) => n.type === "note")
    const nameToId = new Map<string, string>()
    notes.forEach((n) => nameToId.set(n.name.toLowerCase(), n.id))
    const gNodes: GraphNode[] = notes.map((n) => ({
      id: n.id,
      name: n.name,
      path: n.path,
      degree: 0,
    }))
    const idSet = new Set(gNodes.map((n) => n.id))
    const gLinks: GraphLink[] = []
    for (const n of notes) {
      const { links: ls } = parseNote(n.content)
      for (const l of ls) {
        const targetId = nameToId.get(normalizeName(l).toLowerCase())
        if (!targetId || targetId === n.id || !idSet.has(targetId)) continue
        gLinks.push({ source: n.id, target: targetId })
      }
    }
    // degree
    const deg = new Map<string, number>()
    for (const lk of gLinks) {
      deg.set(lk.source, (deg.get(lk.source) ?? 0) + 1)
      deg.set(lk.target, (deg.get(lk.target) ?? 0) + 1)
    }
    gNodes.forEach((n) => (n.degree = deg.get(n.id) ?? 0))
    return { graphNodes: gNodes, links: gLinks }
  }, [nodes])

  useEffect(() => {
    if (graphNodes.length === 0) return
    const svg = svgRef.current
    if (!svg) return
    const width = svg.clientWidth
    const height = svg.clientHeight

    const simNodes: SimNode[] = graphNodes.map((n) => ({ ...n, x: width / 2, y: height / 2 }))
    const simLinks: SimLink[] = links.map((l) => ({ ...l, source: l.source, target: l.target }))

    const sim = forceSimulation(simNodes)
      .force("charge", forceManyBody().strength(-120))
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(80)
          .strength(0.3),
      )
      .force("center", forceCenter(width / 2, height / 2))
      .force("collide", forceCollide(18))
      .stop()

    let raf = 0
    const tick = () => {
      sim.tick(1)
      draw()
      raf = requestAnimationFrame(tick)
    }

    const draw = () => {
      const lines = svg.querySelectorAll<SVGLineElement>("line")
      const circles = svg.querySelectorAll<SVGGElement>("g.node")
      simLinks.forEach((l, i) => {
        const s = l.source as SimNode
        const t = l.target as SimNode
        const ln = lines[i]
        if (ln && s.x != null && s.y != null && t.x != null && t.y != null) {
          ln.setAttribute("x1", String(s.x))
          ln.setAttribute("y1", String(s.y))
          ln.setAttribute("x2", String(t.x))
          ln.setAttribute("y2", String(t.y))
        }
      })
      simNodes.forEach((n, i) => {
        const g = circles[i]
        if (g && n.x != null && n.y != null) {
          g.setAttribute("transform", `translate(${n.x},${n.y})`)
        }
      })
    }

    // Build static DOM
    svg.innerHTML = ""
    const linkEls = simLinks.map(() => {
      const ln = document.createElementNS("http://www.w3.org/2000/svg", "line")
      ln.setAttribute("stroke", "#2a2f3a")
      ln.setAttribute("stroke-width", "1")
      svg.appendChild(ln)
      return ln
    })
    const nodeEls = simNodes.map((n) => {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g")
      g.setAttribute("class", "node")
      g.style.cursor = "pointer"
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle")
      const r = 4 + Math.min(12, n.degree * 1.8)
      c.setAttribute("r", String(r))
      c.setAttribute("fill", n.degree === 0 ? "#4a5266" : "#7aa2f7")
      g.appendChild(c)
      if (n.degree > 0 || simNodes.length <= 30) {
        const lbl = document.createElementNS("http://www.w3.org/2000/svg", "text")
        lbl.textContent = n.name
        lbl.setAttribute("x", "10")
        lbl.setAttribute("y", "4")
        lbl.setAttribute("fill", "#a0a7b5")
        lbl.setAttribute("font-size", "11")
        g.appendChild(lbl)
      }
      g.addEventListener("click", () => {
        openNote(n.id)
        onClose()
      })
      svg.appendChild(g)
      return g
    })

    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      sim.stop()
      linkEls.forEach((el) => el.remove())
      nodeEls.forEach((el) => el.remove())
    }
  }, [graphNodes, links, openNote, onClose])

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="w-[88vw] h-[80vh] bg-[#15171c] border border-[#232833] rounded-lg overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-3 right-3 z-10 flex gap-2">
          <button onClick={onClose} className="px-3 py-1 text-sm bg-[#2a2f3a] hover:bg-[#3a4252] rounded">
            Close
          </button>
        </div>
        <div className="absolute top-3 left-3 z-10 text-sm text-[#7a8290]">
          {graphNodes.length} notes · {links.length} links
        </div>
        {graphNodes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[#5c6370]">
            No notes to graph.
          </div>
        ) : (
          <svg ref={svgRef} className="w-full h-full" />
        )}
      </div>
    </div>
  )
}