import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  FolderOpen,
  Search as SearchIcon,
  Network,
  PenLine,
  Eye,
  Columns2,
  Database,
  UploadCloud,
  DownloadCloud,
  Settings,
  GitBranch,
  Loader2,
  RefreshCw,
  Globe,
  ChevronDown,
  Menu,
  X,
} from "lucide-react"
import clsx from "clsx"
import { useVault } from "./store/vault"
import { useGit } from "./store/git"
import { useSync, hashNotes } from "./store/sync"
import { useVolume } from "./store/volume"
import type { VaultMode } from "./types"
import { FileTree } from "./components/FileTree"
import { MarkdownEditor } from "./components/MarkdownEditor"
import { MarkdownPreview } from "./components/MarkdownPreview"
import { ResizeHandle } from "./components/ResizeHandle"
import { BacklinksPanel } from "./components/BacklinksPanel"
import { TagsPanel } from "./components/TagsPanel"
import { SearchPalette } from "./components/SearchPalette"
import { GraphView } from "./components/GraphView"
import { GitConfigModal } from "./components/GitConfigModal"
import { VaultConfigModal } from "./components/VaultConfigModal"

type ViewMode = "editor" | "preview" | "split"

/** Extract a short repo name from an HTTPS clone URL, e.g. "user/repo.git" → "repo". */
function repoNameFromUrl(url: string | undefined): string {
  return url?.match(/\/([^/]+?)(?:\.git)?\/?$/)?.[1] ?? "Git Vault"
}

const SIDEBAR_WIDTH_KEY = "notepadd.ui.sidebarWidth.v1"
const SIDEBAR_MIN = 180
const SIDEBAR_MAX = 480
const SIDEBAR_DEFAULT = 256

function clampSidebarWidth(w: number): number {
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(w)))
}

function loadSidebarWidth(): number {
  try {
    const raw = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY))
    if (Number.isFinite(raw) && raw > 0) return clampSidebarWidth(raw)
  } catch {
    // ignore
  }
  return SIDEBAR_DEFAULT
}

function saveSidebarWidth(w: number): void {
  try {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(w)))
  } catch {
    // ignore
  }
}

const SPLIT_PCT_KEY = "notepadd.ui.splitPct.v1"
const SPLIT_MIN_PCT = 20
const SPLIT_MAX_PCT = 80
const SPLIT_DEFAULT_PCT = 50

function clampSplitPct(pct: number): number {
  return Math.min(SPLIT_MAX_PCT, Math.max(SPLIT_MIN_PCT, Math.round(pct * 100) / 100))
}

function loadSplitPct(): number {
  try {
    const raw = Number(localStorage.getItem(SPLIT_PCT_KEY))
    if (Number.isFinite(raw) && raw > 0) return clampSplitPct(raw)
  } catch {
    // ignore
  }
  return SPLIT_DEFAULT_PCT
}

function saveSplitPct(w: number): void {
  try {
    localStorage.setItem(SPLIT_PCT_KEY, String(w))
  } catch {
    // ignore
  }
}

const MOBILE_QUERY = "(max-width: 767px)"

/** Tracks the md breakpoint — phones get a drawer sidebar and single-pane view. */
function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const onChange = () => setMobile(mq.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])
  return mobile
}

export default function App() {
  const fsSupported = useVault((s) => s.fsSupported)
  const vaultMode = useVault((s) => s.mode)
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
  const volumePulling = useVolume((s) => s.pulling)

  const [view, setView] = useState<ViewMode>("split")
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth)
  const [splitPct, setSplitPct] = useState(loadSplitPct)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isMobile = useIsMobile()
  // Split view is a desktop affordance; phones always get a single pane.
  const effView: ViewMode = isMobile && view === "split" ? "editor" : view
  const [searchOpen, setSearchOpen] = useState(false)
  const [graphOpen, setGraphOpen] = useState(false)
  const [gitConfigOpen, setGitConfigOpen] = useState(false)
  const [vaultConfigOpen, setVaultConfigOpen] = useState(false)
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

  // --- Resizable panes (drag the separators; double-click resets) ---
  const sidebarWidthRef = useRef(sidebarWidth)
  const applySidebarWidth = useCallback((w: number, persist = true) => {
    const next = clampSidebarWidth(w)
    sidebarWidthRef.current = next
    setSidebarWidth(next)
    if (persist) saveSidebarWidth(next)
  }, [])

  const splitPctRef = useRef(splitPct)
  const splitRowRef = useRef<HTMLDivElement>(null)
  const applySplitPct = useCallback((pct: number, persist = true) => {
    const next = clampSplitPct(pct)
    splitPctRef.current = next
    setSplitPct(next)
    if (persist) saveSplitPct(next)
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

  /**
   * Pull the configured remote and make it the active vault (git mode).
   * Same-path local notes adopt the remote version unless skipped by confirm.
   */
  const activateGitVault = useCallback(async (opts?: { skipConfirm?: boolean }) => {
    if (!useGit.getState().configured) {
      setGitConfigOpen(true)
      return false
    }
    const vault = useVault.getState()
    if (!opts?.skipConfirm && vault.mode !== "git" && vault.nodes.length > 0) {
      if (
        !window.confirm(
          "Switch to the git vault? Notes with the same path on the remote will be overwritten by the remote version.",
        )
      ) {
        return false
      }
    }
    const pulled = await useGit.getState().pull()
    if (!pulled) return false
    await useVault.getState().importNotes(pulled, {})
    useVault
      .getState()
      .setMode("git", repoNameFromUrl(useGit.getState().config?.GIT_REMOTE_URL))
    const notes = useVault
      .getState()
      .nodes.filter((n) => n.type === "note")
      .map((n) => ({ path: n.path, content: n.content }))
    useSync.getState().setSnapshot(hashNotes(notes))
    useSync.setState({ lastSyncAt: Date.now() })
    setPullFlash("ok")
    setTimeout(() => setPullFlash(null), 4000)
    return true
  }, [])

  /**
   * Make the server volume the active vault (volume mode). Pulls its notes,
   * pushes any local notes the volume is missing, and writes all further
   * changes through to it.
   */
  const activateVolumeVault = useCallback(async (opts?: { skipConfirm?: boolean }) => {
    const vault = useVault.getState()
    const pulled = await useVolume.getState().pull()
    if (pulled === null) return false
    const localNotes = vault.nodes.filter((n) => n.type === "note")
    const pulledPaths = new Set(pulled.map((n) => n.path))
    const missing = localNotes
      .filter((n) => !pulledPaths.has(n.path))
      .map((n) => ({ path: n.path, content: n.content }))

    if (
      pulled.length > 0 &&
      vault.mode !== "volume" &&
      localNotes.length > 0 &&
      !opts?.skipConfirm &&
      !window.confirm(
        "Switch to the server volume? Notes with the same path will be replaced by the volume's version.",
      )
    ) {
      return false
    }

    // The volume is where all files live: push local notes it doesn't have yet.
    if (missing.length > 0) await useVolume.getState().writeAll(missing)
    if (pulled.length > 0) await useVault.getState().importNotes(pulled, {})
    useVault.getState().setMode("volume", "Server Volume")
    if (useVault.getState().nodes.length === 0) {
      await useVault.getState().createNote(null, "Welcome")
    }
    const notes = useVault
      .getState()
      .nodes.filter((n) => n.type === "note")
      .map((n) => ({ path: n.path, content: n.content }))
    useSync.getState().setSnapshot(hashNotes(notes))
    useSync.setState({ lastSyncAt: Date.now() })
    return true
  }, [])

  /** Switch the vault source: the server volume, in-browser storage, a local folder, or the git remote. */
  async function handleVaultSwitch(mode: VaultMode) {
    const vault = useVault.getState()
    if (mode === "volume") {
      const ok = await activateVolumeVault()
      if (ok) setVaultConfigOpen(false)
      return
    }
    if (mode === "browser") {
      if (vault.mode === "browser" && vault.rootName) {
        setVaultConfigOpen(false)
        return
      }
      if (useVault.getState().nodes.length === 0) {
        await useVault.getState().createNote(null, "Welcome")
      }
      useVault.getState().setMode("browser")
      setVaultConfigOpen(false)
      return
    }
    if (mode === "local") {
      if (!vault.fsSupported) return
      if (
        vault.nodes.length > 0 &&
        !window.confirm(
          "Open a folder as your vault? The folder's contents will REPLACE the notes currently shown.",
        )
      ) {
        return
      }
      await vault.openVault()
      if (useVault.getState().mode === "local") setVaultConfigOpen(false)
      return
    }
    // git
    const ok = await activateGitVault()
    if (ok) setVaultConfigOpen(false)
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

  // On load, resume the git vault if that was the last active source.
  const gitStartupPullDone = useRef(false)
  useEffect(() => {
    if (gitStartupPullDone.current) return
    if (!gitConfigured || useVault.getState().mode !== "git") return
    gitStartupPullDone.current = true
    void activateGitVault({ skipConfirm: true })
  }, [gitConfigured, activateGitVault])

  // On load, resume the volume vault when it's the active source (it's the
  // default). Waits for Dexie to load so local notes join the pull merge.
  const volumeStartupDone = useRef(false)
  useEffect(() => {
    if (volumeStartupDone.current) return
    if (useVault.getState().mode !== "volume") return
    if (useVault.getState().loading) return
    volumeStartupDone.current = true
    void activateVolumeVault({ skipConfirm: true })
  }, [loading, activateVolumeVault])

  const active = useMemo(
    () => nodes.find((n) => n.id === activeId && n.type === "note"),
    [nodes, activeId],
  )

  // Close the mobile drawer when a note is opened from the tree/search.
  const prevActiveId = useRef(activeId)
  useEffect(() => {
    if (prevActiveId.current !== activeId) {
      prevActiveId.current = activeId
      setSidebarOpen(false)
    }
  }, [activeId])

  // Escape closes the mobile drawer.
  useEffect(() => {
    if (!sidebarOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [sidebarOpen])

  if ((loading || volumePulling) && nodes.length === 0) {
    return <div className="flex items-center justify-center h-full text-[#5c6370]">Loading…</div>
  }

  if (!rootName && !loading && !volumePulling) {
    return (
      <>
        <WelcomeScreen
          fsSupported={fsSupported}
          onOpen={openVault}
          onLocal={() => loadAll().then(async () => {
            if (useVault.getState().nodes.length === 0) {
              await useVault.getState().createNote(null, "Welcome")
            }
            useVault.getState().setMode("browser")
          })}
          error={error}
          gitConfigured={gitConfigured}
          onSetupGit={() => setGitConfigOpen(true)}
          onGit={() => void handleVaultSwitch("git")}
          onVolume={() => void handleVaultSwitch("volume")}
        />
        <GitConfigModal open={gitConfigOpen} onClose={() => setGitConfigOpen(false)} />
      </>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar — wraps to two rows on phones: nav + git sync controls */}
      <header className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-[#232833] bg-[#13151b]">
        <button
          onClick={() => setSidebarOpen(true)}
          className="md:hidden flex items-center justify-center w-8 h-8 -ml-1 rounded text-[#c8cdd6] hover:bg-[#1d2030]"
          title="Open notes menu"
          aria-label="Open notes menu"
        >
          <Menu size={18} />
        </button>
        <span className="hidden sm:inline text-sm font-semibold text-white mr-2">noteadd</span>
        <button
          onClick={() => setVaultConfigOpen(true)}
          className="flex items-center gap-1.5 px-1.5 py-1 rounded text-xs text-[#5c6370] hover:text-[#c8cdd6] hover:bg-[#1d2030]"
          title="Vault configuration"
        >
          {vaultMode === "volume" ? <Database size={12} /> : null}
          {vaultMode === "browser" ? <Globe size={12} /> : null}
          {vaultMode === "local" ? <FolderOpen size={12} /> : null}
          {vaultMode === "git" ? <GitBranch size={12} /> : null}
          /{rootName}
          <ChevronDown size={12} />
        </button>
        <div className="flex-1" />
        <div className="flex items-center gap-0.5 bg-[#0f1115] border border-[#232833] rounded p-0.5">
          <ViewBtn active={effView === "editor"} onClick={() => setView("editor")} title="Editor only">
            <PenLine size={14} />
          </ViewBtn>
          <ViewBtn
            active={!isMobile && view === "split"}
            onClick={() => setView("split")}
            title="Split view"
            className="hidden md:block"
          >
            <Columns2 size={14} />
          </ViewBtn>
          <ViewBtn active={effView === "preview"} onClick={() => setView("preview")} title="Preview only">
            <Eye size={14} />
          </ViewBtn>
        </div>
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-[#a0a7b5] hover:text-white border border-[#232833] rounded"
          title="Search (Ctrl+K)"
        >
          <SearchIcon size={13} />
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden md:inline text-[10px] text-[#5c6370]">⌘K</kbd>
        </button>
        <button
          onClick={() => setGraphOpen(true)}
          className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-[#a0a7b5] hover:text-white border border-[#232833] rounded"
          title="Graph view (Ctrl+G)"
        >
          <Network size={13} />
          <span className="hidden sm:inline">Graph</span>
        </button>

        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-0.5 pt-1.5 -mx-3 px-3 border-t border-[#232833] sm:pt-0 sm:pb-0 sm:mx-0 sm:px-0 sm:pl-2 sm:ml-1 sm:border-t-0 sm:border-l">
          <button
            onClick={handlePull}
            disabled={gitPulling}
            className={clsx(
              "flex items-center flex-shrink-0 gap-1.5 px-2.5 py-1.5 sm:py-1 text-xs font-medium border rounded transition-colors",
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
              "flex items-center flex-shrink-0 gap-1.5 px-2.5 py-1.5 sm:py-1 text-xs font-medium border rounded transition-colors",
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
            className="flex items-center flex-shrink-0 gap-1.5 px-2 py-1.5 sm:py-1 text-xs text-[#a0a7b5] hover:text-white border border-[#232833] rounded"
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
              "flex items-center flex-shrink-0 gap-1.5 px-2 py-1.5 sm:py-1 text-xs border rounded disabled:opacity-40 disabled:cursor-not-allowed",
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
        {/* Desktop sidebar */}
        <aside
          style={{ width: sidebarWidth }}
          className="hidden md:flex flex-shrink-0 bg-[#13151b] flex-col"
        >
          <SidebarPanels noteId={active?.id} />
        </aside>
        <ResizeHandle
          direction="col"
          ariaLabel="Resize sidebar"
          className="hidden md:block w-1.5 border-r border-[#232833]"
          onDrag={(x) => applySidebarWidth(x, false)}
          onDragEnd={() => saveSidebarWidth(sidebarWidthRef.current)}
          onReset={() => applySidebarWidth(SIDEBAR_DEFAULT)}
          onKeyAdjust={(d) => applySidebarWidth(sidebarWidthRef.current + d * 24)}
        />

        {/* Mobile drawer */}
        <aside
          className={clsx(
            "fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] bg-[#13151b] shadow-2xl flex flex-col transition-transform duration-200 md:hidden",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#232833]">
            <span className="text-sm font-semibold text-white">noteadd</span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="flex items-center justify-center w-8 h-8 rounded text-[#a0a7b5] hover:bg-[#2a2f3a] hover:text-white"
              title="Close menu"
              aria-label="Close menu"
            >
              <X size={16} />
            </button>
          </div>
          <SidebarPanels noteId={active?.id} />
        </aside>
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

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
              <div ref={splitRowRef} className="flex-1 min-h-0 flex">
                {effView !== "preview" && (
                  <div
                    className={clsx("min-h-0", effView === "split" ? "flex-shrink-0" : "w-full")}
                    style={effView === "split" ? { width: `${splitPct}%` } : undefined}
                  >
                    <MarkdownEditor noteId={active.id} content={active.content} />
                  </div>
                )}
                {effView === "split" && (
                  <ResizeHandle
                    direction="col"
                    ariaLabel="Resize editor and preview"
                    className="w-1.5 border-r border-[#232833]"
                    onDrag={(x) => {
                      const rect = splitRowRef.current?.getBoundingClientRect()
                      if (!rect || rect.width === 0) return
                      applySplitPct(((x - rect.left) / rect.width) * 100, false)
                    }}
                    onDragEnd={() => saveSplitPct(splitPctRef.current)}
                    onReset={() => applySplitPct(SPLIT_DEFAULT_PCT)}
                    onKeyAdjust={(d) => applySplitPct(splitPctRef.current + d * 5)}
                  />
                )}
                {effView !== "editor" && (
                  <div className={clsx("min-h-0", effView === "split" ? "flex-1 min-w-0" : "w-full")}>
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
      <VaultConfigModal
        open={vaultConfigOpen}
        onClose={() => setVaultConfigOpen(false)}
        onSwitch={(m) => void handleVaultSwitch(m)}
        onSetupGit={() => {
          setVaultConfigOpen(false)
          setGitConfigOpen(true)
        }}
      />
      <GitConfigModal open={gitConfigOpen} onClose={() => setGitConfigOpen(false)} />

      {(uploadFlash || gitUploadError || pullFlash || autoFlash) && (
        <div
          className={clsx(
            "fixed bottom-4 left-4 right-4 sm:left-auto z-50 sm:max-w-sm px-3 py-2 rounded shadow-lg text-sm border",
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

/** File tree + tags + backlinks, shared by the desktop sidebar and mobile drawer. */
function SidebarPanels({ noteId }: { noteId?: string }) {
  return (
    <>
      <FileTree />
      <div className="border-t border-[#232833] overflow-auto max-h-72">
        <TagsPanel />
      </div>
      <div className="border-t border-[#232833] overflow-auto max-h-72">
        {noteId && <BacklinksPanel noteId={noteId} />}
      </div>
    </>
  )
}

function ViewBtn({
  active,
  onClick,
  title,
  className,
  children,
}: {
  active: boolean
  onClick: () => void
  title: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={clsx(
        "px-2 py-1 rounded",
        className,
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
  onVolume,
  error,
  gitConfigured,
  onSetupGit,
  onGit,
}: {
  fsSupported: boolean
  onOpen: () => void
  onLocal: () => void
  onVolume: () => void
  error: string | null
  gitConfigured: boolean
  onSetupGit: () => void
  onGit: () => void
}) {
  const pullError = useGit((s) => s.pullError)
  const volumeError = useVolume((s) => s.error)
  return (
    <div className="flex items-center justify-center h-full overflow-auto p-4 sm:p-6">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">notepadd</h1>
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
              Choose where your notes live — the server volume (default), a folder on disk,
              in-browser storage, or a git repository. You can change this any time from the header.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={onVolume}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#7aa2f7] hover:bg-[#8db4ff] text-[#0f1115] text-sm font-medium rounded-md"
              >
                <Database size={16} /> Use Server Volume
              </button>
              <button
                onClick={onOpen}
                disabled={!fsSupported}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1d2030] hover:bg-[#2a2f3a] text-[#c8cdd6] text-sm font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FolderOpen size={16} />
                {fsSupported ? "Open Folder as Vault" : "FSA not supported"}
              </button>
              <button
                onClick={onLocal}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1d2030] hover:bg-[#2a2f3a] text-[#c8cdd6] text-sm font-medium rounded-md"
              >
                <Globe size={16} />
                Use In-Browser Vault
              </button>
              <button
                onClick={onGit}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1d2030] hover:bg-[#2a2f3a] text-[#c8cdd6] text-sm font-medium rounded-md border border-[#232833]"
              >
                <GitBranch size={16} />
                {gitConfigured ? "Use Git Vault" : "Use Git Vault (set up first)"}
              </button>
            </div>
            {!fsSupported && (
              <p className="text-xs text-[#5c6370] mt-3">
                Your browser doesn&apos;t support the File System Access API. Use Chrome/Edge for on-disk storage.
              </p>
            )}
            {volumeError && (
              <p className="text-xs text-[#f7768e] mt-3 break-words">⚠ Volume unavailable: {volumeError}</p>
            )}
            {error && <p className="text-sm text-[#f7768e] mt-3">{error}</p>}
            {pullError && (
              <p className="text-xs text-[#f7768e] mt-3 break-words">⚠ {pullError}</p>
            )}
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