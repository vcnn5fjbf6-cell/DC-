import { Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { buildSeedNotes } from './data/seed'
import { domains } from './data/domains'
import { clearAttachmentFiles, deleteAttachmentsForNote } from './lib/fileStore'
import type { DomainId, Note } from './types'
import { nowIso, uid } from './lib/notes'
import { CommandSearch } from './components/CommandSearch'
import { GraphPage } from './components/GraphPage'
import { Home } from './components/Home'
import { NoteEditor } from './components/NoteEditor'
import { NotesList } from './components/NotesList'
import { SettingsPage } from './components/SettingsPage'
import { Sidebar, type ViewId } from './components/Sidebar'
import { TreePage } from './components/TreePage'

const STORAGE_KEY = 'allknow-notes-v1'
const REMOVED_SEED_NOTES = new Set([
  'seed-delivery-process',
  'seed-facility-process',
  'seed-machine-inspection',
  'seed-machine-assets',
  'seed-machine-incident',
])

function validateImported(note: Note): boolean {
  const knownDomain = domains.some((domain) => domain.id === note.domain)
  return Boolean(knownDomain && note.id)
}

function belongsToInternalDomain(note: Note): boolean {
  return note.domain === 'internal' && !REMOVED_SEED_NOTES.has(note.id)
}

function readStoredNotes(): Note[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return buildSeedNotes()
    const parsed = JSON.parse(raw) as Note[]
    if (!Array.isArray(parsed)) return buildSeedNotes()
    const valid = parsed.filter(belongsToInternalDomain)
    const seeds = buildSeedNotes()
    const byId = new Set(valid.map((note) => note.id))
    return [...valid, ...seeds.filter((note) => !byId.has(note.id))]
  } catch {
    return buildSeedNotes()
  }
}

export default function App() {
  const [notes, setNotes] = useState<Note[]>(readStoredNotes)
  const [view, setView] = useState<ViewId | 'note'>('home')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
  }, [notes])

  useEffect(() => {
    void Promise.all(
      [...REMOVED_SEED_NOTES].map((id) => deleteAttachmentsForNote(id)),
    )
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const openNote = useCallback(
    (id: string) => {
      if (!id) return
      if (!notes.some((note) => note.id === id)) return
      setActiveId(id)
      setView('note')
    },
    [notes],
  )

  const navigate = useCallback((next: ViewId) => {
    setView(next)
    setActiveId(null)
  }, [])

  const updateNote = useCallback((id: string, patch: Partial<Note>) => {
    setNotes((current) => {
      const target = current.find((note) => note.id === id)
      if (!target) return current
      const merged: Note = { ...target, ...patch, updatedAt: nowIso() }
      let next = current.map((note) => (note.id === id ? merged : note))
      const oldTitle = target.title.trim()
      const newTitle = merged.title.trim()
      if (oldTitle && newTitle && oldTitle !== newTitle) {
        next = next.map((note) => {
          const escaped = oldTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const hasOld = new RegExp(`\\[\\[\\s*${escaped}\\s*]]`).test(note.body)
          if (!hasOld) return note
          return {
            ...note,
            body: note.body.replaceAll(`[[${oldTitle}]]`, `[[${newTitle}]]`),
          }
        })
      }
      return next
    })
  }, [])

  const deleteNote = useCallback(async (id: string) => {
    await deleteAttachmentsForNote(id)
    setNotes((current) => current.filter((note) => note.id !== id))
    setView('notes')
    setActiveId(null)
  }, [])

  const createNote = useCallback(
    (domain: DomainId = 'internal', title?: string, parentId?: string) => {
      const safeTitle = title?.trim() || '未命名知识'
      const now = nowIso()
      const note: Note = {
        id: uid('note'),
        title: safeTitle,
        body: `# ${safeTitle}\n\n`,
        domain,
        status: 'idea',
        confidence: 2,
        tags: parentId ? ['机房运维'] : [],
        parentId,
        createdAt: now,
        updatedAt: now,
      }
      setNotes((current) => [note, ...current])
      setActiveId(note.id)
      setView('note')
    },
    [],
  )

  const createChildNote = useCallback(
    (parentId: string, title: string) => {
      createNote('internal', title, parentId)
    },
    [createNote],
  )

  const importNotes = useCallback((imported: Note[]) => {
    const clean = imported
      .filter(belongsToInternalDomain)
      .map((note, index) => ({
        ...note,
        id: note.id || uid('imported'),
        title: note.title || `导入条目 ${index + 1}`,
        body: note.body ?? '',
        createdAt: note.createdAt || nowIso(),
        updatedAt: note.updatedAt || nowIso(),
      }))
    setNotes(clean)
    setView('notes')
    setActiveId(null)
  }, [])

  const exportNotes = useCallback(() => {
    const blob = new Blob([JSON.stringify(notes, null, 2)], {
      type: 'application/json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `全知库-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }, [notes])

  const activeNote = useMemo(
    () => notes.find((note) => note.id === activeId) ?? null,
    [notes, activeId],
  )

  const saveActive = useCallback(
    (patch: Partial<Note>) => {
      if (activeId) updateNote(activeId, patch)
    },
    [activeId, updateNote],
  )

  const renderedImports = notes.filter(validateImported)

  let content: ReactNode
  if (view === 'note' && activeNote) {
    content = (
      <NoteEditor
        key={activeNote.id}
        note={activeNote}
        allNotes={notes}
        onBack={() => {
          if (activeNote?.parentId) openNote(activeNote.parentId)
          else navigate('notes')
        }}
        onSave={saveActive}
        onDelete={() => deleteNote(activeNote.id)}
        onOpen={openNote}
        onCreateChild={createChildNote}
        onCreate={() => createNote()}
      />
    )
  } else {
    switch (view) {
      case 'home':
        content = (
          <Home
            notes={renderedImports}
            onOpen={openNote}
            onCreate={createNote}
            onOpenDomain={openNote}
          />
        )
        break
      case 'tree':
        content = (
          <TreePage
            notes={renderedImports}
            onOpen={openNote}
            onOpenDomain={openNote}
            onCreate={() => createNote()}
          />
        )
        break
      case 'graph':
        content = (
          <GraphPage
            notes={renderedImports}
            onOpen={openNote}
            onCreate={() => createNote()}
          />
        )
        break
      case 'notes':
        content = (
          <NotesList
            notes={renderedImports}
            onOpen={openNote}
            onCreate={createNote}
          />
        )
        break
      case 'settings':
        content = (
          <SettingsPage
            notes={renderedImports}
            onExport={exportNotes}
            onImport={importNotes}
            onReset={() => {
              void clearAttachmentFiles()
              setNotes(buildSeedNotes())
            }}
            onCreate={() => createNote()}
          />
        )
        break
      default:
        content = null
    }
  }

  return (
    <div className="app-shell">
      <Sidebar
        view={view === 'note' ? 'notes' : view}
        onNavigate={navigate}
        onSearch={() => setSearchOpen(true)}
        noteCount={renderedImports.length}
        onOpenNote={openNote}
        notes={renderedImports}
      />
      <main className="app-main">{content}</main>
      {view !== 'note' && (
        <button
          type="button"
          className="mobile-create"
          onClick={() => createNote()}
          title="新建条目"
          aria-label="新建条目"
        >
          <Plus size={22} />
        </button>
      )}
      <CommandSearch
        notes={notes}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onOpen={openNote}
      />
    </div>
  )
}
