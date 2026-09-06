import {
  ArrowRight,
  BookOpenCheck,
  CircleDot,
  Flame,
  Network,
  Plus,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { DomainId, Note } from '../types'
import { domains } from '../data/domains'
import {
  getOutgoingNotes,
  noteExcerpt,
  relativeTime,
  sortByUpdated,
} from '../lib/notes'
import { DomainIcon, StatusPill } from './ui'

export function Home({
  notes,
  onOpen,
  onCreate,
  onOpenDomain,
}: {
  notes: Note[]
  onOpen: (id: string) => void
  onCreate: (domain: DomainId, title?: string) => void
  onOpenDomain: (id: string) => void
}) {
  const [quickTitle, setQuickTitle] = useState('')
  const [quickDomain, setQuickDomain] = useState<DomainId>('internal')

  const recent = useMemo(() => sortByUpdated(notes).slice(0, 7), [notes])
  const needsWork = useMemo(
    () =>
      sortByUpdated(notes.filter((note) => note.status !== 'stable')).slice(0, 6),
    [notes],
  )
  const linkCount = useMemo(
    () =>
      notes.reduce((sum, note) => sum + getOutgoingNotes(note, notes).length, 0),
    [notes],
  )
  const activeDomains = new Set(notes.map((note) => note.domain)).size
  const starredCount = notes.filter((note) => note.starred).length

  const today = new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date())

  const submitQuick = () => {
    const title = quickTitle.trim()
    if (!title) return
    onCreate(quickDomain, title)
    setQuickTitle('')
  }

  return (
    <div className="page home-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">{today}</p>
          <h1>知识工作台</h1>
          <p className="heading-sub">
            已收录 {notes.length} 个条目，横跨 {activeDomains}/{domains.length} 个知识域，形成{' '}
            {linkCount} 条显式连接。
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => onCreate('internal')}>
          <Plus size={17} />
          新建条目
        </button>
      </header>

      <section className="stat-grid" aria-label="知识库概览">
        <div className="stat-tile">
          <span className="stat-icon blue">
            <BookOpenCheck size={19} />
          </span>
          <div>
            <strong>{notes.length}</strong>
            <p>知识条目</p>
          </div>
        </div>
        <div className="stat-tile">
          <span className="stat-icon teal">
            <Network size={19} />
          </span>
          <div>
            <strong>{linkCount}</strong>
            <p>双向关联</p>
          </div>
        </div>
        <div className="stat-tile">
          <span className="stat-icon amber">
            <Flame size={19} />
          </span>
          <div>
            <strong>{activeDomains}</strong>
            <p>活跃领域</p>
          </div>
        </div>
        <div className="stat-tile">
          <span className="stat-icon rose">
            <CircleDot size={19} />
          </span>
          <div>
            <strong>{starredCount}</strong>
            <p>已收藏</p>
          </div>
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="panel home-domain-panel">
          <div className="panel-title-row">
            <div>
              <h2>领域覆盖</h2>
              <p>每个领域的条目数量与当前成熟度</p>
            </div>
            <button className="text-btn" onClick={() => onOpenDomain('seed-math')}>
              查看导览
              <ArrowRight size={15} />
            </button>
          </div>
          <div className="domain-bars">
            {domains.map((domain) => {
              const list = notes.filter((note) => note.domain === domain.id)
              const stable = list.filter((note) => note.status === 'stable').length
              const pct = list.length === 0 ? 0 : Math.round((stable / list.length) * 100)
              return (
                <button
                  key={domain.id}
                  className="domain-bar"
                  onClick={() => onOpen(list[0]?.id ?? '')}
                  disabled={list.length === 0}
                  title={domain.name}
                >
                  <DomainIcon domain={domain.id} />
                  <span className="domain-bar-name">{domain.shortName}</span>
                  <span className="domain-bar-track">
                    <span
                      style={{
                        width: `${Math.max(5, pct)}%`,
                        background: domain.color,
                      }}
                    />
                  </span>
                  <span className="domain-bar-count">{list.length}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="panel quick-panel">
          <div className="panel-title-row">
            <div>
              <h2>快速记录</h2>
              <p>先把闪过的想法放进对应领域</p>
            </div>
            <Sparkles className="panel-mark" size={18} />
          </div>
          <div className="quick-form">
            <input
              value={quickTitle}
              onChange={(event) => setQuickTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submitQuick()
              }}
              placeholder="此刻想记住什么"
            />
            <select
              value={quickDomain}
              onChange={(event) => setQuickDomain(event.target.value as DomainId)}
              aria-label="所属领域"
            >
              {domains.map((domain) => (
                <option key={domain.id} value={domain.id}>
                  {domain.name}
                </option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={submitQuick}>
              记录
            </button>
          </div>
          <div className="recent-mini-list">
            {recent.slice(0, 5).map((note) => (
              <button key={note.id} className="mini-note" onClick={() => onOpen(note.id)}>
                <span className="mini-note-title">{note.title}</span>
                <span className="mini-note-time">{relativeTime(note.updatedAt)}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel recent-panel">
          <div className="panel-title-row">
            <div>
              <h2>最近编辑</h2>
              <p>沿时间线回到正在生长的知识</p>
            </div>
            <TrendingUp className="panel-mark green" size={18} />
          </div>
          <div className="note-rows">
            {recent.map((note) => (
              <button
                key={note.id}
                className="note-row"
                onClick={() => onOpen(note.id)}
              >
                <DomainIcon domain={note.domain} />
                <span className="note-row-main">
                  <strong>{note.title}</strong>
                  <span>{noteExcerpt(note, 78)}</span>
                </span>
                <StatusPill status={note.status} />
                <time>{relativeTime(note.updatedAt)}</time>
              </button>
            ))}
          </div>
        </section>

        <section className="panel focus-panel">
          <div className="panel-title-row">
            <div>
              <h2>需要深化</h2>
              <p>想法、提纲与发展中条目优先补齐</p>
            </div>
            <span className="focus-badge">{needsWork.length}</span>
          </div>
          <div className="focus-list">
            {needsWork.map((note) => (
              <button key={note.id} onClick={() => onOpen(note.id)}>
                <span>
                  <strong>{note.title}</strong>
                  <small>
                    {note.tags.slice(0, 3).map((tag) => `#${tag}`).join(' ')}
                  </small>
                </span>
                <ArrowRight size={15} />
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
