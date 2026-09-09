import {
  BookOpen,
  FilePlus2,
  Filter,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { DomainId, Note, NoteStatus } from '../types'
import { domains } from '../data/domains'
import {
  noteExcerpt,
  relativeTime,
  sortByUpdated,
} from '../lib/notes'
import { DomainIcon, EmptyState, StatusPill, TagChip } from './ui'

const sortOptions = [
  { id: 'updated', label: '最近更新' },
  { id: 'created', label: '最近创建' },
  { id: 'title', label: '标题排序' },
]

export function NotesList({
  notes,
  onOpen,
  onCreate,
  initialQuery = '',
  initialDomain,
}: {
  notes: Note[]
  onOpen: (id: string) => void
  onCreate: (domain?: DomainId) => void
  initialQuery?: string
  initialDomain?: DomainId | 'all'
}) {
  const [query, setQuery] = useState(initialQuery)
  const [domain, setDomain] = useState<DomainId | 'all'>(initialDomain ?? 'all')
  const [status, setStatus] = useState<NoteStatus | 'all'>('all')
  const [tag, setTag] = useState('all')
  const [sort, setSort] = useState('updated')
  const userDocuments = useMemo(
    () => notes.filter((note) => !note.id.startsWith('seed-')),
    [notes],
  )

  const filtered = useMemo(() => {
    const lower = query.trim().toLocaleLowerCase()
    const result = userDocuments.filter((note) => {
      if (domain !== 'all' && note.domain !== domain) return false
      if (status !== 'all' && note.status !== status) return false
      if (tag !== 'all' && !note.tags.includes(tag)) return false
      if (lower) {
        const haystack =
          `${note.title} ${note.body} ${note.tags.join(' ')}`.toLocaleLowerCase()
        if (!haystack.includes(lower)) return false
      }
      return true
    })
    if (sort === 'created') {
      return result.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
    }
    if (sort === 'title') {
      return result.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
    }
    return sortByUpdated(result)
  }, [userDocuments, query, domain, status, tag, sort])

  return (
    <div className="page notes-page">
      <header className="page-heading">
        <div>
          <h1>文档库</h1>
          <p className="heading-sub">
            这里只展示你实际新建的文档，不包含预置知识库条目。
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => onCreate()}>
          <FilePlus2 size={17} />
          新建条目
        </button>
      </header>

      <section className="filter-toolbar" aria-label="筛选条件">
        <div className="search-box">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题、正文或标签"
          />
        </div>
        <div className="toolbar-controls">
          <span className="toolbar-label">
            <SlidersHorizontal size={15} />
            领域
          </span>
          <select
            value={domain}
            onChange={(event) =>
              setDomain(event.target.value as DomainId | 'all')
            }
          >
            <option value="all">全部领域</option>
            {domains.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as NoteStatus | 'all')
            }
            aria-label="状态筛选"
          >
            <option value="all">全部状态</option>
            <option value="idea">想法</option>
            <option value="outline">提纲</option>
            <option value="developing">发展中</option>
            <option value="stable">成熟</option>
          </select>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            aria-label="排序方式"
          >
            {sortOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {tag !== 'all' && (
        <div className="active-tag-row">
          <Filter size={15} />
          <TagChip label={tag} onClick={() => setTag('all')} removable />
        </div>
      )}

      <section className="notes-table">
        <div className="notes-table-head">
          <span>条目</span>
          <span>领域</span>
          <span>状态</span>
          <span>最近更新</span>
        </div>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<BookOpen size={25} />}
            title="没有匹配的条目"
            hint="调整筛选条件，或新建一条知识记录。"
            action={
              <button className="btn btn-primary" onClick={() => onCreate()}>
                <FilePlus2 size={16} />
                新建条目
              </button>
            }
          />
        ) : (
          filtered.map((note) => (
            <button
              key={note.id}
              className="notes-table-row"
              onClick={() => onOpen(note.id)}
            >
              <span className="note-cell-title">
                <strong>{note.title}</strong>
                <span>{noteExcerpt(note, 92)}</span>
                {note.tags.length > 0 && (
                  <small>
                    {note.tags.slice(0, 4).map((item) => `#${item}`).join(' ')}
                  </small>
                )}
              </span>
              <span className="note-cell-domain">
                <DomainIcon domain={note.domain} size={15} />
                {domains.find((item) => item.id === note.domain)?.shortName}
              </span>
              <span className="note-cell-status">
                <StatusPill status={note.status} />
              </span>
              <time>{relativeTime(note.updatedAt)}</time>
            </button>
          ))
        )}
      </section>
    </div>
  )
}
