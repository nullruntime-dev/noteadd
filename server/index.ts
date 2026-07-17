import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import fs from "node:fs"
import path from "node:path"
import { simpleGit } from "simple-git"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, "..")

const ENV_FILE = path.join(ROOT, ".env")
const REPO_DIR = path.join(ROOT, ".notepadd-repo")
const STATIC_DIR = path.join(ROOT, "dist")

dotenv.config({ path: ENV_FILE })

const app = express()
app.use(cors())
app.use(express.json({ limit: "50mb" }))

/** Read git config from .env (server-side only — never sent to client except masked status). */
function readEnv(): Record<string, string> {
  try {
    const raw = fs.readFileSync(ENV_FILE, "utf8")
    const out: Record<string, string> = {}
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "")
    }
    return out
  } catch {
    return {}
  }
}

/** Write git config to .env (preserves other keys). */
function writeEnv(values: Record<string, string>): void {
  const existing = readEnv()
  const merged = { ...existing, ...values }
  const lines = Object.entries(merged)
    .filter(([k, v]) => k && v !== undefined && v !== null)
    .map(([k, v]) => {
      const needsQuote = /[\s#"']/.test(v)
      return `${k}=${needsQuote ? JSON.stringify(v) : v}`
    })
  fs.writeFileSync(ENV_FILE, lines.join("\n") + "\n", "utf8")
}

interface GitConfig {
  GIT_REMOTE_URL: string
  GIT_BRANCH: string
  GIT_AUTHOR_NAME: string
  GIT_AUTHOR_EMAIL: string
  GIT_TOKEN: string
}

function getStoredConfig(): GitConfig {
  const env = readEnv()
  return {
    GIT_REMOTE_URL: env.GIT_REMOTE_URL ?? "",
    GIT_BRANCH: env.GIT_BRANCH ?? "main",
    GIT_AUTHOR_NAME: env.GIT_AUTHOR_NAME ?? "notepadd",
    GIT_AUTHOR_EMAIL: env.GIT_AUTHOR_EMAIL ?? "notepadd@local",
    GIT_TOKEN: env.GIT_TOKEN ?? "",
  }
}

function authedRemoteUrl(cfg: GitConfig): string {
  if (!cfg.GIT_TOKEN) return cfg.GIT_REMOTE_URL
  const m = cfg.GIT_REMOTE_URL.match(/^(https?:\/\/)([^/]+)(\/.*)$/)
  if (!m) return cfg.GIT_REMOTE_URL
  return `${m[1]}oauth2:${encodeURIComponent(cfg.GIT_TOKEN)}@${m[2]}${m[3]}`
}

/** GET /api/git/config — returns config (token masked). */
app.get("/api/git/config", (_req, res) => {
  const cfg = getStoredConfig()
  res.json({
    ...cfg,
    GIT_TOKEN: cfg.GIT_TOKEN ? "***" : "",
    configured: !!cfg.GIT_REMOTE_URL,
  })
})

/** POST /api/git/config — saves config to .env */
app.post("/api/git/config", (req, res) => {
  const body = req.body ?? {}
  const next: GitConfig = {
    GIT_REMOTE_URL: String(body.GIT_REMOTE_URL ?? "").trim(),
    GIT_BRANCH: String(body.GIT_BRANCH ?? "main").trim(),
    GIT_AUTHOR_NAME: String(body.GIT_AUTHOR_NAME ?? "notepadd").trim(),
    GIT_AUTHOR_EMAIL: String(body.GIT_AUTHOR_EMAIL ?? "notepadd@local").trim(),
    // Allow clearing the token with empty string, but keep existing if undefined
    GIT_TOKEN:
      body.GIT_TOKEN === undefined
        ? getStoredConfig().GIT_TOKEN
        : String(body.GIT_TOKEN ?? ""),
  }
  if (!next.GIT_REMOTE_URL || !next.GIT_BRANCH) {
    res.status(400).json({ error: "Remote URL and branch are required" })
    return
  }
  try {
    writeEnv(next as unknown as Record<string, string>)
    res.json({ ok: true, configured: true })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to save" })
  }
})

/** POST /api/git/upload — writes notes, commits, pushes. */
app.post("/api/git/upload", async (req, res) => {
  const cfg = getStoredConfig()
  if (!cfg.GIT_REMOTE_URL || !cfg.GIT_BRANCH) {
    res.status(400).json({ error: "Git not configured. Set remote URL and branch first." })
    return
  }
  const notes: { path: string; content: string }[] = req.body.notes ?? []
  if (!Array.isArray(notes)) {
    res.status(400).json({ error: "notes must be an array" })
    return
  }
  try {
    fs.mkdirSync(REPO_DIR, { recursive: true })
    const git = simpleGit(REPO_DIR)
    let isRepo = fs.existsSync(path.join(REPO_DIR, ".git"))
    if (!isRepo) {
      await git.init()
    }
    await git.addConfig("user.name", cfg.GIT_AUTHOR_NAME)
    await git.addConfig("user.email", cfg.GIT_AUTHOR_EMAIL)

    // Ensure we're on the configured branch.
    const branches = await git.branchLocal()
    const desired = cfg.GIT_BRANCH
    if (!branches.all.includes(desired)) {
      // Create the branch (renames current if unborn, or creates from current HEAD)
      try {
        await git.checkoutLocalBranch(desired)
      } catch {
        // If current branch exists with commits, rename it to desired
        try {
          await git.raw(["branch", "-M", desired])
        } catch {
          // fall through
        }
      }
    } else {
      await git.checkout(desired)
    }

    // Clean repo dir of non-.git contents so stale notes don't linger
    const existing = fs.readdirSync(REPO_DIR).filter((f) => f !== ".git")
    for (const f of existing) {
      const p = path.join(REPO_DIR, f)
      fs.rmSync(p, { recursive: true, force: true })
    }

    // Write notes
    for (const note of notes) {
      const safe = note.path.replace(/^\/+/, "")
      const full = path.join(REPO_DIR, safe)
      fs.mkdirSync(path.dirname(full), { recursive: true })
      fs.writeFileSync(full, note.content, "utf8")
    }

    // Stage everything
    await git.raw(["add", "-A"])

    // Always commit if there's anything staged. On a fresh repo HEAD doesn't
    // exist yet — `status.files` will list staged additions, so commit.
    let hasHead = true
    try {
      await git.raw(["rev-parse", "--verify", "HEAD"])
    } catch {
      hasHead = false
    }

    let hasStagedChanges = false
    try {
      const status = await git.status()
      hasStagedChanges =
        status.files.length > 0 ||
        status.staged.length > 0 ||
        status.not_added.length > 0 ||
        status.conflicted.length > 0
    } catch {
      // status throws on a repo with no commits yet — treat as "needs commit"
      hasStagedChanges = true
    }

    if (!hasHead || hasStagedChanges) {
      try {
        await git.commit(`notepadd: sync ${new Date().toISOString()}`)
      } catch {
        // Nothing to commit — ignore
      }
    }

    // Push
    const pushUrl = authedRemoteUrl(cfg)
    // Force-with-lease won't work on first push (no remote ref). Fall back to plain push.
    try {
      await git.push(pushUrl, desired, ["--force-with-lease"])
    } catch {
      await git.push(pushUrl, desired)
    }

    res.json({ ok: true, message: "Uploaded successfully" })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Upload failed" })
  }
})

interface PullResponse {
  ok: boolean
  notes: { path: string; content: string }[]
  message: string
}

/** POST /api/git/pull — clones/pulls the remote and returns all .md files. */
app.post("/api/git/pull", async (_req, res) => {
  const cfg = getStoredConfig()
  if (!cfg.GIT_REMOTE_URL || !cfg.GIT_BRANCH) {
    res.status(400).json({ error: "Git not configured. Set remote URL and branch first." })
    return
  }
  try {
    fs.mkdirSync(REPO_DIR, { recursive: true })
    const git = simpleGit(REPO_DIR)
    const isRepo = fs.existsSync(path.join(REPO_DIR, ".git"))
    const pullUrl = authedRemoteUrl(cfg)

    if (!isRepo) {
      // Clone into REPO_DIR. simple-git clone expects target dir empty or non-existent.
      // Clone to a temp parent then move, or use init+remote+fetch to avoid path constraints.
      await git.init()
      await git.addConfig("user.name", cfg.GIT_AUTHOR_NAME)
      await git.addConfig("user.email", cfg.GIT_AUTHOR_EMAIL)
      await git.addRemote("origin", pullUrl)
      await git.fetch("origin", cfg.GIT_BRANCH)
      await git.checkoutBranch(cfg.GIT_BRANCH, `origin/${cfg.GIT_BRANCH}`)
    } else {
      await git.addConfig("user.name", cfg.GIT_AUTHOR_NAME)
      await git.addConfig("user.email", cfg.GIT_AUTHOR_EMAIL)
      // Update remote URL in case it changed
      try {
        await git.removeRemote("origin")
      } catch {
        // may not exist
      }
      await git.addRemote("origin", pullUrl)
      // Fetch + reset to remote to reflect latest state
      await git.fetch("origin", cfg.GIT_BRANCH)
      try {
        await git.checkout(cfg.GIT_BRANCH)
      } catch {
        await git.checkoutBranch(cfg.GIT_BRANCH, `origin/${cfg.GIT_BRANCH}`)
      }
      await git.raw(["reset", "--hard", `origin/${cfg.GIT_BRANCH}`])
    }

    // Collect all .md files (excluding .git/)
    const notes: { path: string; content: string }[] = []
    function walk(dir: string, base: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name === ".git") continue
        const full = path.join(dir, entry.name)
        const rel = base ? `${base}/${entry.name}` : entry.name
        if (entry.isDirectory()) {
          walk(full, rel)
        } else if (entry.name.endsWith(".md")) {
          const content = fs.readFileSync(full, "utf8")
          notes.push({ path: rel, content })
        }
      }
    }
    walk(REPO_DIR, "")

    const response: PullResponse = {
      ok: true,
      notes,
      message: `Pulled ${notes.length} note${notes.length === 1 ? "" : "s"}`,
    }
    res.json(response)
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Pull failed" })
  }
})

const PORT = Number(process.env.PORT ?? 3001)

// In production, serve the built Vite client from dist/ on the same origin
// so the browser hits the same host:port for /api/* and the SPA shell.
if (fs.existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR))
  // SPA fallback: any non-/api GET returns index.html so client-side routing works
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      res.sendFile(path.join(STATIC_DIR, "index.html"))
      return
    }
    next()
  })
}

app.listen(PORT, () => {
  console.log(`notepadd server listening on http://localhost:${PORT}`)
})