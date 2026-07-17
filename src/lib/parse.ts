import type { ParsedNote } from "../types"

const WIKILINK_RE = /\[\[([^\]\n]+?)\]\]/g
const TAG_RE = /(?:^|\s)#([\p{L}\p{N}_/-]+)/gu

/**
 * Characters disallowed across common filesystems (Windows, macOS, Linux).
 * Windows is the strictest: \ / : * ? " < > |  and trailing dots/spaces.
 */
const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/g
const MAX_FILENAME_LEN = 100

export function parseNote(content: string): ParsedNote {
  const links = new Set<string>()
  const tags = new Set<string>()

  for (const m of content.matchAll(WIKILINK_RE)) {
    const target = m[1].trim()
    if (target) links.add(target)
  }
  for (const m of content.matchAll(TAG_RE)) {
    tags.add(m[1].toLowerCase())
  }

  return { links: [...links], tags: [...tags] }
}

/** Strip the trailing `.md` extension if present. */
export function normalizeName(name: string): string {
  return name.replace(/\.md$/i, "").trim()
}

export function toFileName(name: string): string {
  const clean = name.replace(/\.md$/i, "").trim()
  return `${clean}.md`
}

/**
 * Extract the first H1 (`# ...`) title from markdown content.
 * Returns null if none found.
 */
export function extractTitle(content: string): string | null {
  const m = content.match(/^\s*#\s+(.+?)\s*$/m)
  return m ? m[1].trim() : null
}

/**
 * Validate a candidate filename (note title).
 * Returns null when valid, or an error message describing the problem.
 */
export function validateFilename(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return "Title cannot be empty"
  if (INVALID_FILENAME_CHARS.test(trimmed)) {
    return 'Title contains invalid characters: \\ / : * ? " < > |'
  }
  if (/^[.\s]+$/.test(trimmed)) return "Title must contain more than dots/spaces"
  if (trimmed.length > MAX_FILENAME_LEN) {
    return `Title is too long (max ${MAX_FILENAME_LEN} chars)`
  }
  // Reserved Windows names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
  const base = trimmed.replace(/\.md$/i, "").split(".")[0].toUpperCase()
  if (
    /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(base)
  ) {
    return `"${base}" is a reserved filename on Windows`
  }
  return null
}

/**
 * Sanitize a title into a filesystem-safe note name.
 * Strips invalid chars and clamps length.
 */
export function sanitizeFilename(name: string): string {
  let clean = name.replace(INVALID_FILENAME_CHARS, "").trim()
  // Collapse runs of whitespace
  clean = clean.replace(/\s+/g, " ")
  // Strip trailing dots/spaces (Windows forbids)
  clean = clean.replace(/[.\s]+$/g, "")
  if (clean.length > MAX_FILENAME_LEN) {
    clean = clean.slice(0, MAX_FILENAME_LEN).trim()
  }
  return clean || "Untitled"
}