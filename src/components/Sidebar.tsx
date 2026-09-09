import {
  BookOpen,
  Database,
  LayoutDashboard,
  Search,
  Sparkles,
} from 'lucide-react'
import { Fragment } from 'react'
import type { Note } from '../types'

export type ViewId = 'home' | 'notes' | 'settings'

const primaryItems: Array<{
  id: ViewId
  label: string
  icon: typeof LayoutDashboard
}> = [
  { id: 'home', label: '首页', icon: LayoutDashboard },
  { id: 'notes', label: '文档库', icon: BookOpen },
  { id: 'settings', label: '数据设置', icon: Database },
]

export function Sidebar({
  view,
  onNavigate,
  onSearch,
  noteCount,
  notes,
  onOpenNote,
}: {
  view: ViewId
  onNavigate: (view: ViewId) => void
  onSearch: () => void
  noteCount: number
  notes: Note[]
  onOpenNote: (id: string) => void
}) {
  return (
    <>
      <aside className="sidebar">
        <button type="button" className="brand" onClick={() => onNavigate('home')}>
          <span className="brand-mark">
            <Sparkles size={20} />
          </span>
          <span className="brand-copy">
            <strong>内部知识库</strong>
            <small>Knowledge Ops</small>
          </span>
        </button>

        <button type="button" className="sidebar-search" onClick={onSearch}>
          <Search size={16} />
          <span>搜索知识库</span>
          <kbd>⌘ K</kbd>
        </button>

        <nav className="side-nav" aria-label="主导航">
          <span className="side-nav-label">知识空间</span>
          {primaryItems.map((item) => {
            const Icon = item.icon
            return (
              <Fragment key={item.id}>
                <button
                  type="button"
                  className={view === item.id ? 'is-active' : ''}
                  onClick={() => onNavigate(item.id)}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                  {item.id === 'notes' && <em>{noteCount}</em>}
                </button>
                {item.id === 'notes' && (
                  <div className="side-child-list side-library-shortcuts">
                    {notes
                      .filter(
                        (note) =>
                          note.parentId === 'seed-machine-room' &&
                          (note.id === 'seed-machine-delivery' ||
                            note.id === 'seed-machine-facility'),
                      )
                      .map((note) => (
                        <button
                          key={note.id}
                          type="button"
                          onClick={() => onOpenNote(note.id)}
                          title={note.title}
                        >
                          <span className="branch-bullet is-child" />
                          <span>{note.title}</span>
                        </button>
                      ))}
                  </div>
                )}
              </Fragment>
            )
          })}
        </nav>

        <div className="sidebar-foot">
          <span className="status-dot" />
          <div>
            <strong>本机知识库</strong>
            <small>Codex AI · 自动保存</small>
          </div>
        </div>
      </aside>

      <nav className="mobile-nav" aria-label="移动端导航">
        {primaryItems.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              className={view === item.id ? 'is-active' : ''}
              onClick={() => onNavigate(item.id)}
            >
              <Icon size={19} />
              <span>{item.label.replace('数据设置', '设置')}</span>
            </button>
          )
        })}
      </nav>
    </>
  )
}
