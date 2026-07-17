import { useRef, useMemo } from "react"
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror"
import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import { languages } from "@codemirror/language-data"
import { githubDark } from "@uiw/codemirror-theme-github"
import { EditorView } from "@codemirror/view"
import { Code2, Table } from "lucide-react"
import { useVault } from "../store/vault"

interface EditorProps {
  noteId: string
  content: string
}

export function MarkdownEditor({ noteId, content }: EditorProps) {
  const updateContent = useVault((s) => s.updateContent)
  const ref = useRef<ReactCodeMirrorRef>(null)

  const extensions = useMemo(
    () => [
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      EditorView.lineWrapping,
      EditorView.theme({
        "&": { backgroundColor: "transparent", fontSize: "14px" },
        ".cm-content": { padding: "1rem 1.5rem" },
        ".cm-gutters": { display: "none" },
      }),
    ],
    [],
  )

  /** Insert text at the current cursor position, replacing any selection. */
  function insertAtCursor(text: string, cursorOffset?: number) {
    const view = ref.current?.view
    if (!view) return
    const sel = view.state.selection.main
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: text },
      selection:
        cursorOffset != null
          ? { anchor: sel.from + cursorOffset }
          : { anchor: sel.from + text.length },
    })
    view.focus()
  }

  function insertCodeBlock() {
    const lang = "javascript"
    const snippet = "```" + lang + "\n\n```\n"
    // Place cursor on the empty line inside the fence
    insertAtCursor(snippet, lang.length + 2)
  }

  function insertTable() {
    const table =
      "| Column A | Column B | Column C |\n" +
      "| -------- | -------- | -------- |\n" +
      "| Cell 1   | Cell 2   | Cell 3   |\n" +
      "| Cell 4   | Cell 5   | Cell 6   |\n"
    insertAtCursor(table)
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[#232833] bg-[#13151b]">
        <button
          onClick={insertCodeBlock}
          className="flex items-center gap-1 px-2 py-1 text-xs text-[#a0a7b5] hover:text-white hover:bg-[#2a2f3a] rounded"
          title="Insert code block"
        >
          <Code2 size={13} /> Code
        </button>
        <button
          onClick={insertTable}
          className="flex items-center gap-1 px-2 py-1 text-xs text-[#a0a7b5] hover:text-white hover:bg-[#2a2f3a] rounded"
          title="Insert table"
        >
          <Table size={13} /> Table
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <CodeMirror
          ref={ref}
          value={content}
          height="100%"
          theme={githubDark}
          extensions={extensions}
          onChange={(val) => updateContent(noteId, val)}
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            highlightActiveLine: false,
            highlightActiveLineGutter: false,
          }}
        />
      </div>
    </div>
  )
}