import {
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FolderTree,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { DomainId, Note } from '../types'
import { domains } from '../data/domains'
import { relativeTime, sortByUpdated } from '../lib/notes'
import { DomainIcon, StatusPill } from './ui'

export function TreePage({
  notes,
  onOpen,
  onOpenDomain,
  onCreate,
}: {
  notes: Note[]
  onOpen: (id: string) => void
  onOpenDomain: (id: string) => void
  onCreate: () => void
}) {
  const [collapsed, setCollapsed] = useState<Set<DomainId>>(new Set())
  const noteMap = useMemo(() => {
    const map = new Map<DomainId, Note[]>()
    for (const domain of domains) map.set(domain.id, [])
    for (const note of notes) map.get(note.domain)?.push(note)
    map.forEach((list) => sortByUpdated(list))
    return map
  }, [notes])

  const toggle = (id: DomainId) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="page tree-page">
      <header className="page-heading">
        <div>
          <h1>领域与知识树</h1>
          <p className="heading-sub">
            {domains.length} 个一级领域，可持续扩展成任意深度的知识体系
          </p>
        </div>
        <button className="btn btn-primary" onClick={onCreate}>
          <FilePlus2 size={17} />
          新建条目
        </button>
      </header>

      <section className="tree-list" aria-label="知识领域树">
        {domains.map((domain) => {
          const list = noteMap.get(domain.id) ?? []
          const isOpen = !collapsed.has(domain.id)
          const mature = list.filter((note) => note.status === 'stable').length
          return (
            <article key={domain.id} className="tree-domain">
              <div className="tree-domain-head">
                <button
                  type="button"
                  className="tree-expand"
                  onClick={() => toggle(domain.id)}
                  aria-label={isOpen ? '收起领域' : '展开领域'}
                >
                  {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </button>
                <DomainIcon domain={domain.id} size={21} />
                <button
                  type="button"
                  className="tree-domain-title"
                  onClick={() => toggle(domain.id)}
                >
                  <strong>{domain.name}</strong>
                  <small>{domain.english}</small>
                </button>
                <span className="tree-metrics">
                  <span>{list.length} 条</span>
                  <span className="tree-metric-dot" />
                  <span>{mature} 条成熟</span>
                </span>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => onOpenDomain(`seed-${domain.id}`)}
                  disabled={!list.some((note) => note.title.includes('全景'))}
                >
                  领域导览
                  <ArrowUpRight size={14} />
                </button>
              </div>
              {isOpen && (
                <>
                  <div className="tree-domain-desc">{domain.description}</div>
                  <div className="branch-cloud">
                    {domain.branches.map((branch) => (
                      branch.noteId ? (
                        <button
                          key={branch.name}
                          type="button"
                          onClick={() => onOpen(branch.noteId as string)}
                          title={branch.blurb}
                        >
                          {branch.name}
                        </button>
                      ) : (
                        <span key={branch.name} title={branch.blurb}>
                          {branch.name}
                        </span>
                      )
                    ))}
                  </div>
                  {list.length > 0 && (
                    <div className="tree-notes">
                      {list.map((note) => (
                        <button
                          key={note.id}
                          className="tree-note-row"
                          onClick={() => onOpen(note.id)}
                        >
                          <BookOpen size={15} />
                          <span>
                            <strong>{note.title}</strong>
                            <small>
                              {note.tags.slice(0, 3).map((tag) => `#${tag}`).join(' ')}
                            </small>
                          </span>
                          <StatusPill status={note.status} />
                          <time>{relativeTime(note.updatedAt)}</time>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </article>
          )
        })}
      </section>

      {notes.length === 0 && (
        <div className="tree-empty">
          <FolderTree size={28} />
          <p>还没有任何条目。先为第一个领域写下第一篇知识。</p>
        </div>
      )}
    </div>
  )
}
