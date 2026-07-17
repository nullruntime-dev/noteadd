import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  FolderOpen,
  Search as SearchIcon,
  Network,
  PenLine,
  Eye,
  Columns2,
  UploadCloud,
  DownloadCloud,
  Settings,
  GitBranch,
  Loader2,
  RefreshCw,
} from "lucide-react"
import clsx from "clsx"
import { useVault } from "./store/vault"
import { useGit } from "./store/git"
import { useSync, hashNotes } from "./store/sync"
import { FileTree } from "./components/FileTree"
import { MarkdownEditor } from "./components/MarkdownEditor"
import { MarkdownPreview } from "./components/MarkdownPreview"
import { BacklinksPanel } from "./components/BacklinksPanel"
import { TagsPanel } from "./components/TagsPanel"
import { SearchPalette } from "./components/SearchPalette"
import { GraphView } from "./components/GraphView"
import { GitConfigModal } from "./components/GitConfigModal"

type ViewMode = "editor" | "preview" | "split"

export default function App() {
  const fsSupported = useVault((s) => s.fsSupported)
  const nodes = useVault((s) => s.nodes)
  const activeId = useVault((s) => s.activeId)
  const openVault = useVault((s) => s.openVault)
  const loadAll = useVault((s) => s.loadAll)
  const rootName = useVault((s) => s.rootName)
  const loading = useVault((s) => s.loading)
  const error = useVault((s) => s.error)
  const validationError = useVault((s) => s.validationError)
  const clearValidationError = useVault((s) => s.clearValidationError)

  const gitConfigured = useGit((s) => s.configured)
  const gitUploading = useGit((s) => s.uploading)
  const gitUploadError = useGit((s) => s.uploadError)
  const gitUpload = useGit((s) => s.upload)
  const gitPull = useGit((s) => s.pull)
  const gitPulling = useGit((s) => s.pulling)
  const loadGitConfig = useGit((s) => s.loadConfig)

  const autoSync = useSync((s) => s.autoSync)
  const setAutoSync = useSync((s) => s.setAutoSync)
  const intervalMs = useSync((s) => s.intervalMs)

  const [view, setView] = useState<ViewMode>("split")
  const [searchOpen, setSearchOpen] = useState(false)
  const [graphOpen, setGraphOpen] = useState(false)
  const [gitConfigOpen, setGitConfigOpen] = useState(false)
  const [uploadFlash, setUploadFlash] = useState<"ok" | "err" | null>(null)
  const [pullFlash, setPullFlash] = useState<"ok" | "err" | null>(null)
  const [autoFlash, setAutoFlash] = useState<string | null>(null)

  useEffect(() => {
    loadAll()
    loadGitConfig()
  }, [loadAll, loadGitConfig])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault()
        setSearchOpen((o) => !o)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "g") {
        e.preventDefault()
        setGraphOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  async function handleUpload() {
    if (!gitConfigured) {
      setGitConfigOpen(true)
      return
    }
    const notes = useVault
      .getState()
      .nodes.filter((n) => n.type === "note")
      .map((n) => ({ path: n.path, content: n.content }))
    const ok = await gitUpload(notes)
    if (ok) {
      useSync.getState().setSnapshot(hashNotes(notes))
      useSync.setState({ lastSyncAt: Date.now() })
    }
    setUploadFlash(ok ? "ok" : "err")
    setTimeout(() => setUploadFlash(null), 4000)
  }

  async function handlePull() {
    if (!gitConfigured) {
      setGitConfigOpen(true)
      return
    }
    const pulled = await gitPull()
    if (pulled) {
      const count = await useVault.getState().importNotes(pulled, {
        skipEditedSince: useSync.getState().lastSyncAt,
      })
      setPullFlash("ok")
      const notes = useVault
        .getState()
        .nodes.filter((n) => n.type === "note")
        .map((n) => ({ path: n.path, content: n.content }))
      useSync.getState().setSnapshot(hashNotes(notes))
      useSync.setState({ lastSyncAt: Date.now() })
      void count
    } else {
      setPullFlash("err")
    }
    setTimeout(() => setPullFlash(null), 4000)
  }

  /** Single auto-sync cycle: pull first, then upload if changed. */
  const doAutoSync = useCallback(async () => {
    if (!useGit.getState().configured) return
    const sync = useSync.getState()
    // PULL
    const pulled = await useGit.getState().pull()
    if (pulled) {
      await useVault.getState().importNotes(pulled, {
        skipEditedSince: sync.lastSyncAt,
      })
    }
    // Recompute snapshot after pull
    const notes = useVault
      .getState()
      .nodes.filter((n) => n.type === "note")
      .map((n) => ({ path: n.path, content: n.content }))
    const currentHash = hashNotes(notes)
    // UPLOAD only if content changed since last sync
    if (sync.snapshot === null || sync.snapshot !== currentHash) {
      const ok = await useGit.getState().upload(notes)
      if (ok) {
        useSync.getState().setSnapshot(currentHash)
        useSync.setState({ lastSyncAt: Date.now() })
        setAutoFlash(`Auto-sync: pushed ${notes.length} notes`)
      } else {
        setAutoFlash("Auto-sync: push failed")
      }
    } else {
      useSync.setState({ lastSyncAt: Date.now() })
      setAutoFlash("Auto-sync: up to date")
    }
    setTimeout(() => setAutoFlash(null), 4000)
  }, [])

  // Auto-sync loop
  const syncRunning = useRef(false)
  useEffect(() => {
    if (!autoSync) return
    let timer: number | null = null
    const run = async () => {
      if (syncRunning.current) return
      syncRunning.current = true
      try {
        await doAutoSync()
      } finally {
        syncRunning.current = false
      }
      timer = window.setTimeout(run, intervalMs)
    }
    timer = window.setTimeout(run, intervalMs)
    return () => {
      if (timer != null) window.clearTimeout(timer)
    }
  }, [autoSync, intervalMs, doAutoSync])

  const active = useMemo(
    () => nodes.find((n) => n.id === activeId && n.type === "note"),
    [nodes, activeId],
  )

  if (loading && nodes.length === 0) {
    return <div className="flex items-center justify-center h-full text-[#5c6370]">Loading…</div>
  }

  if (!rootName && !loading) {
    return (
      <WelcomeScreen
        fsSupported={fsSupported}
        onOpen={openVault}
        onLocal={() => loadAll().then(() => {
          if (useVault.getState().nodes.length === 0) {
            useVault.getState().createNote(null, "Welcome")
          }
        })}
        error={error}
        gitConfigured={gitConfigured}
        onSetupGit={() => setGitConfigOpen(true)}
      />
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <header className="flex items-center gap-2 px-3 py-2 border-b border-[#232833] bg-[#13151b]">
        <span className="text-sm font-semibold text-white mr-2">noteadd</span>
        <span className="text-xs text-[#5c6370]">/{rootName}</span>
        <div className="flex-1" />
        <div className="flex items-center gap-0.5 bg-[#0f1115] border border-[#232833] rounded p-0.5">
          <ViewBtn active={view === "editor"} onClick={() => setView("editor")} title="Editor only">
            <PenLine size={14} />
          </ViewBtn>
          <ViewBtn active={view === "split"} onClick={() => setView("split")} title="Split view">
            <Columns2 size={14} />
          </ViewBtn>
          <ViewBtn active={view === "preview"} onClick={() => setView("preview")} title="Preview only">
            <Eye size={14} />
          </ViewBtn>
        </div>
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-[#a0a7b5] hover:text-white border border-[#232833] rounded"
          title="Search (Ctrl+K)"
        >
          <SearchIcon size={13} /> Search
          <kbd className="text-[10px] text-[#5c6370]">⌘K</kbd>
        </button>
        <button
          onClick={() => setGraphOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-[#a0a7b5] hover:text-white border border-[#232833] rounded"
          title="Graph view (Ctrl+G)"
        >
          <Network size={13} /> Graph
        </button>

        <div className="flex items-center gap-1.5 pl-2 ml-1 border-l border-[#232833]">
          <button
            onClick={handlePull}
            disabled={gitPulling}
            className={clsx(
              "flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border rounded transition-colors",
              pullFlash === "ok" && "border-[#9ece6a] text-[#9ece6a] bg-[#9ece6a10]",
              pullFlash === "err" && "border-[#f7768e] text-[#f7768e] bg-[#f7768e10]",
              !pullFlash && "border-[#232833] text-[#a0a7b5] hover:text-white",
              gitPulling && "opacity-60 cursor-wait",
            )}
            title={
              !gitConfigured
                ? "Configure git repo first"
                : "Pull latest notes from remote"
            }
          >
            {gitPulling ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <DownloadCloud size={13} />
            )}
            Pull
          </button>
          <button
            onClick={handleUpload}
            disabled={gitUploading}
            className={clsx(
              "flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border rounded transition-colors",
              uploadFlash === "ok" && "border-[#9ece6a] text-[#9ece6a] bg-[#9ece6a10]",
              uploadFlash === "err" && "border-[#f7768e] text-[#f7768e] bg-[#f7768e10]",
              !uploadFlash && gitConfigured && "border-[#7aa2f7] text-[#7aa2f7] hover:bg-[#7aa2f710]",
              !uploadFlash && !gitConfigured && "border-[#232833] text-[#a0a7b5] hover:text-white",
              gitUploading && "opacity-60 cursor-wait",
            )}
            title={
              !gitConfigured
                ? "Configure git repo first"
                : "Commit all notes and push to remote"
            }
          >
            {gitUploading ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <UploadCloud size={13} />
            )}
            Upload
          </button>
          <button
            onClick={() => setGitConfigOpen(true)}
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-[#a0a7b5] hover:text-white border border-[#232833] rounded"
            title="Git repository settings"
          >
            {gitConfigured ? <GitBranch size={13} /> : <Settings size={13} />}
            {gitConfigured
              ? useGit.getState().config?.GIT_BRANCH ?? "git"
              : "Setup Git"}
          </button>
          <button
            onClick={() => setAutoSync(!autoSync)}
            disabled={!gitConfigured}
            className={clsx(
              "flex items-center gap-1.5 px-2 py-1 text-xs border rounded disabled:opacity-40 disabled:cursor-not-allowed",
              autoSync
                ? "border-[#9ece6a] text-[#9ece6a] bg-[#9ece6a10]"
                : "border-[#232833] text-[#a0a7b5] hover:text-white",
            )}
            title={
              !gitConfigured
                ? "Configure git repo first"
                : autoSync
                  ? "Auto-sync ON — pulls & pushes every minute. Click to disable."
                  : "Enable auto-sync (pull & push every minute)"
            }
          >
            <RefreshCw size={13} className={autoSync ? "animate-spin-slow" : ""} />
            Auto
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-64 flex-shrink-0 border-r border-[#232833] bg-[#13151b] flex flex-col">
          <FileTree />
          <div className="border-t border-[#232833] overflow-auto max-h-72">
            <TagsPanel />
          </div>
          <div className="border-t border-[#232833] overflow-auto max-h-72">
            {active && <BacklinksPanel noteId={active.id} />}
          </div>
        </aside>

        {/* Main editor area */}
        <main className="flex-1 min-w-0 flex flex-col">
          {validationError && (
            <div className="flex items-center justify-between gap-3 px-4 py-1.5 bg-[#f7768e10] border-b border-[#f7768e40] text-xs text-[#f7768e]">
              <span>⚠ {validationError}</span>
              <button
                onClick={clearValidationError}
                className="text-[#f7768e] hover:text-white px-1"
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          )}
          {active ? (
            <>
              <div className="px-4 py-1.5 border-b border-[#232833] text-xs text-[#7a8290] truncate">
                {active.path}
              </div>
              <div className="flex-1 min-h-0 flex">
                {view !== "preview" && (
                  <div className={clsx("min-h-0", view === "split" ? "w-1/2 border-r border-[#232833]" : "w-full")}>
                    <MarkdownEditor noteId={active.id} content={active.content} />
                  </div>
                )}
                {view !== "editor" && (
                  <div className={clsx("min-h-0", view === "split" ? "w-1/2" : "w-full")}>
                    <MarkdownPreview noteId={active.id} content={active.content} />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-[#5c6370]">
              Select or create a note to start writing.
            </div>
          )}
        </main>
      </div>

      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      {graphOpen && <GraphView onClose={() => setGraphOpen(false)} />}
      <GitConfigModal open={gitConfigOpen} onClose={() => setGitConfigOpen(false)} />

      {(uploadFlash || gitUploadError || pullFlash || autoFlash) && (
        <div
          className={clsx(
            "fixed bottom-4 right-4 z-50 max-w-sm px-3 py-2 rounded shadow-lg text-sm border",
            (uploadFlash === "ok" || pullFlash === "ok" || autoFlash?.includes("up to date") || autoFlash?.includes("pushed")) && "bg-[#15171c] border-[#9ece6a] text-[#9ece6a]",
            (uploadFlash === "err" || pullFlash === "err" || autoFlash?.includes("failed")) && "bg-[#15171c] border-[#f7768e] text-[#f7768e]",
          )}
        >
          {uploadFlash === "ok" && "Uploaded successfully"}
          {uploadFlash === "err" && (gitUploadError ?? "Upload failed")}
          {pullFlash === "ok" && "Pulled successfully"}
          {pullFlash === "err" && "Pull failed"}
          {autoFlash}
        </div>
      )}
    </div>
  )
}

function ViewBtn({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={clsx(
        "px-2 py-1 rounded",
        active ? "bg-[#2a2f3a] text-white" : "text-[#7a8290] hover:text-white",
      )}
    >
      {children}
    </button>
  )
}

function WelcomeScreen({
  fsSupported,
  onOpen,
  onLocal,
  error,
  gitConfigured,
  onSetupGit,
}: {
  fsSupported: boolean
  onOpen: () => void
  onLocal: () => void
  error: string | null
  gitConfigured: boolean
  onSetupGit: () => void
}) {
  return (
    <div className="flex items-center justify-center h-full overflow-auto p-6">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">notepadd</h1>
          <p className="text-[#7a8290]">
            A local-first markdown vault with wiki-links, backlinks, tags, a graph view, and git sync.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Vault setup */}
          <section className="bg-[#15171c] border border-[#232833] rounded-lg p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white mb-3 uppercase tracking-wide">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#7aa2f7] text-[#0f1115] text-xs">1</span>
              Open a Vault
            </h2>
            <p className="text-xs text-[#7a8290] mb-4">
              Choose where your notes live: a real folder on disk, or in-browser storage.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={onOpen}
                disabled={!fsSupported}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#7aa2f7] hover:bg-[#8db4ff] text-[#0f1115] text-sm font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FolderOpen size={16} />
                {fsSupported ? "Open Folder as Vault" : "FSA not supported"}
              </button>
              <button
                onClick={onLocal}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1d2030] hover:bg-[#2a2f3a] text-[#c8cdd6] text-sm font-medium rounded-md"
              >
                Use In-Browser Vault
              </button>
            </div>
            {!fsSupported && (
              <p className="text-xs text-[#5c6370] mt-3">
                Your browser doesn&apos;t support the File System Access API. Use Chrome/Edge for on-disk storage.
              </p>
            )}
            {error && <p className="text-sm text-[#f7768e] mt-3">{error}</p>}
          </section>

          {/* Git setup */}
          <section className="bg-[#15171c] border border-[#232833] rounded-lg p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white mb-3 uppercase tracking-wide">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#9ece6a] text-[#0f1115] text-xs">2</span>
              Configure Git Sync
              {gitConfigured && (
                <span className="ml-auto text-xs text-[#9ece6a] flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#9ece6a]" /> Ready
                </span>
              )}
            </h2>
            <p className="text-xs text-[#7a8290] mb-4">
              Push notes to a git repo and pull updates from it. Config is stored in the server&apos;s <code className="text-[#9ece6a]">.env</code>.
            </p>
            <button
              onClick={onSetupGit}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1d2030] hover:bg-[#2a2f3a] text-[#c8cdd6] text-sm font-medium rounded-md border border-[#232833]"
            >
              <GitBranch size={16} />
              {gitConfigured ? "Edit Git Settings" : "Set Up Git"}
            </button>
          </section>
        </div>

        {/* Steps guide */}
        <section className="mt-6 bg-[#15171c] border border-[#232833] rounded-lg p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white mb-4 uppercase tracking-wide">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#bb9af7] text-[#0f1115] text-xs">i</span>
            How to Set Up Git Sync
          </h2>
          <ol className="space-y-3 text-sm text-[#c8cdd6]">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#2a2f3a] text-[#7aa2f7] text-xs flex items-center justify-center font-mono">1</span>
              <div>
                <strong className="text-white">Create a remote repo</strong> on GitHub, GitLab, or any git host that supports HTTPS push. Copy its clone URL.
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#2a2f3a] text-[#7aa2f7] text-xs flex items-center justify-center font-mono">2</span>
              <div>
                <strong className="text-white">Create a personal access token</strong> with write access (GitHub: <code className="text-[#9ece6a]">repo</code> scope; GitLab: <code className="text-[#9ece6a]">write_repository</code>).
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#2a2f3a] text-[#7aa2f7] text-xs flex items-center justify-center font-mono">3</span>
              <div>
                <strong className="text-white">Click “Set Up Git”</strong> above and fill in:
                <ul className="mt-1.5 ml-4 space-y-0.5 text-xs text-[#a0a7b5]">
                  <li>• <strong>Remote URL</strong> — the HTTPS clone URL</li>
                  <li>• <strong>Branch</strong> — e.g. <code className="text-[#9ece6a]">main</code></li>
                  <li>• <strong>Name</strong> &amp; <strong>Email</strong> — commit author identity</li>
                  <li>• <strong>Access Token</strong> — your PAT (saved to <code className="text-[#9ece6a]">.env</code> on the server, never in the browser)</li>
                </ul>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#2a2f3a] text-[#7aa2f7] text-xs flex items-center justify-center font-mono">4</span>
              <div>
                <strong className="text-white">Click Save to .env</strong>. The config is written to the server&apos;s <code className="text-[#9ece6a]">.env</code> file and reloaded on restart.
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#2a2f3a] text-[#7aa2f7] text-xs flex items-center justify-center font-mono">5</span>
              <div>
                <strong className="text-white">Use the Upload / Pull buttons</strong> in the top bar to sync notes. Enable <strong>Auto</strong> to pull + push automatically every minute (only pushes when something changed; skips notes you&apos;ve edited since the last sync).
              </div>
            </li>
          </ol>
        </section>
      </div>
    </div>
  )
}