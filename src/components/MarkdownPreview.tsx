import { useMemo } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeHighlight from "rehype-highlight"
import { useVault } from "../store/vault"
import { normalizeName } from "../lib/parse"
import clsx from "clsx"

interface PreviewProps {
  noteId: string
  content: string
}

function remarkWikilinks() {
  // Inline plugin — convert [[Target]] into <a class="wikilink"> nodes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tree: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const visit = (node: any) => {
      if (node.type === "text") {
        const text = node.value as string
        if (!text.includes("[[")) return
        const parts = text.split(/(\[\[[^\]\n]+?\]\])/g).filter(Boolean)
        if (parts.length <= 1) return
        // Replace this text node with mixed children
        node.type = "parent"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        node.children = parts.map((p): any => {
          const m = p.match(/^\[\[([^\]\n]+?)\]\]$/)
          if (m) {
            return {
              type: "link",
              url: `wikilink:${m[1]}`,
              data: { hProperties: { className: "wikilink" } },
              children: [{ type: "text", value: m[1] }],
            }
          }
          return { type: "text", value: p }
        })
        delete node.value
      } else if (node.children && Array.isArray(node.children)) {
        node.children.forEach(visit)
      }
    }
    visit(tree)
  }
}

function remarkTags() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tree: any) => {
    const TAG = /(\s|^)(#[\p{L}\p{N}_/-]+)/gu
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const visit = (node: any) => {
      if (node.type === "text") {
        const text = node.value as string
        if (!text.includes("#")) return
        const out: unknown[] = []
        let last = 0
        let m: RegExpExecArray | null
        while ((m = TAG.exec(text))) {
          const tagStart = m.index + m[1].length
          const before = text.slice(last, tagStart)
          if (before) out.push({ type: "text", value: before })
          out.push({
            type: "link",
            url: `tag:${m[2].slice(1).toLowerCase()}`,
            data: { hProperties: { className: "tag" } },
            children: [{ type: "text", value: m[2] }],
          })
          last = tagStart + m[2].length
        }
        if (last < text.length) out.push({ type: "text", value: text.slice(last) })
        if (out.length <= 1) return
        node.type = "parent"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        node.children = out as any
        delete node.value
      } else if (node.children && Array.isArray(node.children)) {
        node.children.forEach(visit)
      }
    }
    visit(tree)
  }
}

export function MarkdownPreview({ noteId, content }: PreviewProps) {
  const findByName = useVault((s) => s.findByName)
  const openNote = useVault((s) => s.openNote)
  const allNodes = useVault((s) => s.nodes)

  const existingNames = useMemo(
    () => new Set(allNodes.filter((n) => n.type === "note").map((n) => n.name.toLowerCase())),
    [allNodes],
  )

  // Pre-parse to mark missing wikilinks
  function onClick(e: React.MouseEvent) {
    const target = (e.target as HTMLElement).closest("a")
    if (!target) return
    const href = target.getAttribute("href") ?? ""
    if (href.startsWith("wikilink:")) {
      e.preventDefault()
      const name = decodeURIComponent(href.slice("wikilink:".length))
      const found = findByName(name)
      if (found) openNote(found.id)
      else openNote(noteId) // stay — missing links handled visually
    } else if (href.startsWith("tag:")) {
      e.preventDefault()
      // Tag click is handled in parent via event delegation; just ignore for now
    }
  }

  // Custom render to mark missing wikilinks
  return (
    <div
      className="prose-noteadd h-full overflow-auto px-8 py-6"
      onClick={onClick}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkWikilinks, remarkTags]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          a: ({ node: _node, href, children, ...props }) => {
            if (href?.startsWith("wikilink:")) {
              const name = decodeURIComponent(href.slice("wikilink:".length))
              const exists = existingNames.has(normalizeName(name).toLowerCase())
              return (
                <a
                  href={href}
                  className={clsx("wikilink", !exists && "wikilink-missing")}
                  {...props}
                >
                  {children}
                </a>
              )
            }
            if (href?.startsWith("tag:")) {
              return (
                <a href={href} className="tag" {...props}>
                  {children}
                </a>
              )
            }
            return <a href={href} target="_blank" rel="noreferrer" {...props}>{children}</a>
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}