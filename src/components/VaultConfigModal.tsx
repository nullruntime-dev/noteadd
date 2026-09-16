import { useEffect } from "react"
import { X, Globe, FolderOpen, GitBranch, Loader2, Check } from "lucide-react"
import clsx from "clsx"
import { useVault } from "../store/vault"
import { useGit } from "../store/git"
import type { VaultMode } from "../types"

interface Props {
  open: boolean
  onClose: () => void
  /** Orchestrated by App: performs confirmation, pulls, and vault switches. */
  onSwitch: (mode: VaultMode) => void
  onSetupGit: () => void
}

const ACTION_BTN =
  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-[#232833] text-[#c8cdd6] hover:bg-[#2a2f3a] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"

export function VaultConfigModal({ open, onClose, onSwitch, onSetupGit }: Props) {
  const mode = useVault((s) => s.mode)
  const fsSupported = useVault((s) => s.fsSupported)
  const loading = useVault((s) => s.loading)
  const handleAttached = useVault((s) => s.rootHandle !== null)
  const gitConfigured = useGit((s) => s.configured)
  const gitConfig = useGit((s) => s.config)
  const pulling = useGit((s) => s.pulling)
  const pullError = useGit((s) => s.pullError)

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

  if (!open) return null

  const repoName = gitConfig?.GIT_REMOTE_URL
    ? gitConfig.GIT_REMOTE_URL.match(/\/([^/]+?)(?:\.git)?\/?$/)?.[1] ?? "remote"
    : "remote"
  const branch = gitConfig?.GIT_BRANCH || "main"

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#15171c] border border-[#232833] rounded-lg shadow-2xl mx-4 max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#232833]">
          <div className="flex items-center gap-2 text-white font-medium">
            <FolderOpen size={16} /> Vault Configuration
          </div>
          <button onClick={onClose} className="text-[#7a8290] hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-[#7a8290]">
            Change where your notes live — now and at any time. Each option explains what happens
            to your current notes before you switch.
          </p>

          {/* In-browser storage */}
          <OptionCard
            active={mode === "browser"}
            icon={<Globe size={16} />}
            title="In-Browser Storage"
            description="Notes live in this browser's IndexedDB. Nothing is written to disk. Your current notes are kept exactly as they are."
            action={
              <button
                onClick={() => onSwitch("browser")}
                disabled={mode === "browser"}
                className={ACTION_BTN}
              >
                {mode === "browser" ? "Current Vault" : "Use In-Browser Vault"}
              </button>
            }
          />

          {/* Local folder */}
          <OptionCard
            active={mode === "local"}
            icon={<FolderOpen size={16} />}
            title="Local Folder"
            description={
              fsSupported
                ? "Pick a folder on disk — its contents become your vault and every edit is written straight back to those files. The folder's contents replace the notes currently shown (you'll confirm first)."
                : "Requires the File System Access API (Chrome/Edge). Your browser doesn't support it."
            }
            action={
              <button
                onClick={() => onSwitch("local")}
                disabled={!fsSupported || loading}
                title={!fsSupported ? "Not supported in this browser" : undefined}
                className={ACTION_BTN}
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : null}
                {loading
                  ? "Opening…"
                  : mode === "local"
                    ? "Choose Another Folder"
                    : "Choose Folder…"}
              </button>
            }
          >
            {mode === "local" && !handleAttached && (
              <p className="text-[10px] text-[#e0af68] mb-2">
                ⚠ Folder detached (page was reloaded). Pick it again to resume writing to disk.
              </p>
            )}
          </OptionCard>

          {/* Git repository */}
          <OptionCard
            active={mode === "git"}
            icon={<GitBranch size={16} />}
            title="Git Repository"
            description={
              gitConfigured
                ? `Notes are pulled from ${repoName} (branch ${branch}). Notes with the same path adopt the remote version (you'll confirm first); the Pull / Upload buttons and auto-sync keep it in sync afterwards.`
                : "Not configured yet — set a remote URL, branch, and access token first."
            }
            action={
              !gitConfigured ? (
                <button onClick={onSetupGit} className={ACTION_BTN}>
                  <GitBranch size={13} /> Set Up Git…
                </button>
              ) : (
                <button
                  onClick={() => onSwitch("git")}
                  disabled={pulling}
                  className={ACTION_BTN}
                >
                  {pulling ? <Loader2 size={13} className="animate-spin" /> : null}
                  {pulling
                    ? "Pulling…"
                    : mode === "git"
                      ? "Refresh from Remote"
                      : "Switch to Git Vault"}
                </button>
              )
            }
          >
            {pullError && (
              <p className="text-[10px] text-[#f7768e] mb-2 break-words">
                ⚠ {pullError}
              </p>
            )}
          </OptionCard>
        </div>
      </div>
    </div>
  )
}

function OptionCard({
  icon,
  title,
  description,
  action,
  active,
  children,
}: {
  icon: React.ReactNode
  title: string
  description: string
  action: React.ReactNode
  active: boolean
  children?: React.ReactNode
}) {
  return (
    <div
      className={clsx(
        "rounded-lg border p-3",
        active ? "border-[#7aa2f7] bg-[#7aa2f710]" : "border-[#232833]",
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className={clsx(
            "flex items-center justify-center w-7 h-7 rounded flex-shrink-0",
            active ? "bg-[#7aa2f7] text-[#0f1115]" : "bg-[#1d2030] text-[#a0a7b5]",
          )}
        >
          {icon}
        </span>
        <span className="text-sm font-medium text-white">{title}</span>
        {active && (
          <span className="ml-auto text-[10px] uppercase tracking-wide text-[#9ece6a] flex items-center gap-1">
            <Check size={11} /> Current
          </span>
        )}
      </div>
      <p className="text-xs text-[#7a8290] mb-2.5">{description}</p>
      {children}
      <div className="flex justify-end">{action}</div>
    </div>
  )
}