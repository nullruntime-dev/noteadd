import { useEffect, useState } from "react"
import { X, GitBranch, GitCommit } from "lucide-react"
import { useGit, type GitConfig } from "../store/git"

interface Props {
  open: boolean
  onClose: () => void
}

const DEFAULT_CONFIG: GitConfig = {
  GIT_REMOTE_URL: "",
  GIT_BRANCH: "main",
  GIT_AUTHOR_NAME: "notepadd",
  GIT_AUTHOR_EMAIL: "notepadd@local",
  GIT_TOKEN: "",
}

export function GitConfigModal({ open, onClose }: Props) {
  const config = useGit((s) => s.config)
  const saveConfig = useGit((s) => s.saveConfig)
  const uploadError = useGit((s) => s.uploadError)
  const clearUploadError = useGit((s) => s.clearUploadError)

  const [form, setForm] = useState<GitConfig>(DEFAULT_CONFIG)
  const [saving, setSaving] = useState(false)
  // Track whether the user touched the token field — if not, we don't send it
  const [tokenEdited, setTokenEdited] = useState(false)

  useEffect(() => {
    if (open && config) {
      setForm(config)
      setTokenEdited(false)
      clearUploadError()
    }
  }, [open, config, clearUploadError])

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

  function update<K extends keyof GitConfig>(key: K, value: GitConfig[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    if (key === "GIT_TOKEN") setTokenEdited(true)
  }

  async function handleSave() {
    setSaving(true)
    const payload: Partial<GitConfig> & { GIT_REMOTE_URL: string; GIT_BRANCH: string } = {
      GIT_REMOTE_URL: form.GIT_REMOTE_URL,
      GIT_BRANCH: form.GIT_BRANCH,
      GIT_AUTHOR_NAME: form.GIT_AUTHOR_NAME,
      GIT_AUTHOR_EMAIL: form.GIT_AUTHOR_EMAIL,
    }
    // Only send the token if the user typed something new.
    // The server keeps the existing token when GIT_TOKEN is undefined.
    if (tokenEdited) payload.GIT_TOKEN = form.GIT_TOKEN
    await saveConfig(payload)
    setSaving(false)
    if (!useGit.getState().uploadError) onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#15171c] border border-[#232833] rounded-lg shadow-2xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#232833]">
          <div className="flex items-center gap-2 text-white font-medium">
            <GitBranch size={16} /> Git Repository
          </div>
          <button onClick={onClose} className="text-[#7a8290] hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <Field label="Remote URL">
            <input
              type="text"
              value={form.GIT_REMOTE_URL}
              onChange={(e) => update("GIT_REMOTE_URL", e.target.value)}
              placeholder="https://github.com/user/repo.git"
              className="w-full bg-[#0f1115] border border-[#232833] rounded px-2 py-1.5 text-sm text-white outline-none focus:border-[#7aa2f7]"
            />
          </Field>
          <Field label="Branch">
            <input
              type="text"
              value={form.GIT_BRANCH}
              onChange={(e) => update("GIT_BRANCH", e.target.value)}
              placeholder="main"
              className="w-full bg-[#0f1115] border border-[#232833] rounded px-2 py-1.5 text-sm text-white outline-none focus:border-[#7aa2f7]"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name">
              <input
                type="text"
                value={form.GIT_AUTHOR_NAME}
                onChange={(e) => update("GIT_AUTHOR_NAME", e.target.value)}
                placeholder="Your Name"
                className="w-full bg-[#0f1115] border border-[#232833] rounded px-2 py-1.5 text-sm text-white outline-none focus:border-[#7aa2f7]"
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={form.GIT_AUTHOR_EMAIL}
                onChange={(e) => update("GIT_AUTHOR_EMAIL", e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-[#0f1115] border border-[#232833] rounded px-2 py-1.5 text-sm text-white outline-none focus:border-[#7aa2f7]"
              />
            </Field>
          </div>
          <Field label="Access Token">
            <input
              type="password"
              value={tokenEdited ? form.GIT_TOKEN : ""}
              onChange={(e) => update("GIT_TOKEN", e.target.value)}
              placeholder={config?.GIT_TOKEN ? "•••• (saved on server — type to replace)" : "ghp_… or gitlab token"}
              className="w-full bg-[#0f1115] border border-[#232833] rounded px-2 py-1.5 text-sm text-white outline-none focus:border-[#7aa2f7]"
            />
            <p className="text-xs text-[#5c6370] mt-1">
              Saved to the server&apos;s <code>.env</code> file. Never stored in the browser.
            </p>
          </Field>

          {uploadError && (
            <div className="text-xs text-[#f7768e] bg-[#f7768e10] border border-[#f7768e40] rounded px-2 py-1.5">
              {uploadError}
            </div>
          )}

          <div className="flex items-center gap-1.5 text-xs text-[#5c6370] pt-1">
            <GitCommit size={12} />
            Each upload commits all vault notes and pushes to the configured branch.
          </div>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#232833]">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-[#a0a7b5] hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-sm bg-[#7aa2f7] hover:bg-[#8db4ff] text-[#0f1115] font-medium rounded disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save to .env"}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-[#7a8290] mb-1">{label}</span>
      {children}
    </label>
  )
}