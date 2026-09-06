import { CornerDownLeft, FileSearch, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { Note } from '../types'
import { domains } from '../data/domains'
import { noteExcerpt, sortByUpdated } from '../lib/notes'
import { DomainIcon } from './ui'

export function CommandSearch({
  notes,
  open,
  onClose,
  onOpen,
}: {
  notes: Note[]
  open: boolean
  onClose: () => void
  onOpen: (id: string) => void
}) {
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (open) {
      setQuery('')
      window.setTimeout(() => document.getElementById('command-input')?.focus(), 10)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const results = useMemo(() => {
    const lower = query.trim().toLocaleLowerCase()
    if (!lower) return sortByUpdated(notes).slice(0, 8)
    return sortByUpdated(
      notes.filter((note) =>
        `${note.title} ${note.body} ${note.tags.join(' ')}`
          .toLocaleLowerCase()
          .includes(lower),
      ),
    ).slice(0, 12)
  }, [notes, query])

  if (!open) return null

  return (
    <div className="command-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="command-panel"
        role="dialog"
        aria-label="搜索知识库"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="command-input-row">
          <Search size={20} />
          <input
            id="command-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索全部知识"
          />
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            title="关闭"
          >
            <X size={18} />
          </button>
        </div>
        <div className="command-results">
          <p className="command-results-label">
            {query ? `${results.length} 条结果` : '最近条目'}
          </p>
          {results.map((note) => (
            <button
              key={note.id}
              type="button"
              onClick={() => {
                onOpen(note.id)
                onClose()
              }}
            >
              <DomainIcon domain={note.domain} size={16} />
              <span className="command-result-main">
                <strong>{note.title}</strong>
                <small>{noteExcerpt(note, 70)}</small>
              </span>
              <span className="command-result-domain">
                {domains.find((item) => item.id === note.domain)?.shortName}
              </span>
              <CornerDownLeft size={15} />
            </button>
          ))}
          {results.length === 0 && (
            <div className="command-empty">
              <FileSearch size={26} />
              <p>没有找到匹配内容</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
