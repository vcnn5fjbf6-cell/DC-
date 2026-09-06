import type { Note } from '../types'

export function nowIso(): string {
  return new Date().toISOString()
}

export function uid(prefix = 'note'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function parseWikiLinks(markdown: string): string[] {
  const matches = Array.from(markdown.matchAll(/\[\[([^\]]+)\]\]/g))
  return [...new Set(matches.map((match) => match[1].trim()))]
}

export function findNoteByTitle(notes: Note[], title: string): Note | undefined {
  const normalized = title.trim().toLocaleLowerCase()
  return notes.find(
    (note) => note.title.trim().toLocaleLowerCase() === normalized,
  )
}

export function getOutgoingNotes(note: Note, notes: Note[]): Note[] {
  return parseWikiLinks(note.body)
    .map((title) => findNoteByTitle(notes, title))
    .filter((item): item is Note => Boolean(item))
}

export function getIncomingNotes(note: Note, notes: Note[]): Note[] {
  return notes.filter((candidate) =>
    parseWikiLinks(candidate.body).some(
      (title) =>
        title.toLocaleLowerCase() === note.title.trim().toLocaleLowerCase(),
    ),
  )
}

export function noteExcerpt(note: Note, maxLength = 110): string {
  const bodyWithoutHeading = note.body
    .replace(/^\s*#\s+[^\n]+\n+/u, '')
    .trim()
  const plain = bodyWithoutHeading
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`|~\[\]-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (plain.length <= maxLength) return plain
  return `${plain.slice(0, maxLength).trim()}…`
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return new Date(iso).toLocaleDateString('zh-CN')
}

export function formatDate(iso: string): string {
  const date = new Date(iso)
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

export function sortByUpdated(notes: Note[]): Note[] {
  return [...notes].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )
}

export function getStatusLabel(status: Note['status']): string {
  const labels: Record<Note['status'], string> = {
    idea: '想法',
    outline: '提纲',
    developing: '发展中',
    stable: '成熟',
  }
  return labels[status]
}

export function getConfidenceLabel(value: Note['confidence']): string {
  return '●'.repeat(value)
}

export function allTags(notes: Note[]): string[] {
  return [...new Set(notes.flatMap((note) => note.tags))].sort((a, b) =>
    a.localeCompare(b, 'zh-CN'),
  )
}
