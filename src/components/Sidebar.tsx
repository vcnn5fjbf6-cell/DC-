import {
  BookOpen,
  ChevronRight,
  Database,
  FolderTree,
  LayoutDashboard,
  Network,
  Search,
  Sparkles,
} from 'lucide-react'
import { Fragment } from 'react'
import type { Note } from '../types'
import { domains } from '../data/domains'
import { DomainIcon } from './ui'

export type ViewId = 'home' | 'notes' | 'tree' | 'graph' | 'settings'

const primaryItems: Array<{ id: ViewId; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'home', label: '工作台', icon: LayoutDashboard },
  { id: 'notes', label: '全部条目', icon: BookOpen },
  { id: 'tree', label: '知识领域', icon: FolderTree },
  { id: 'graph', label: '知识图谱', icon: Network },
  { id: 'settings', label: '数据设置', icon: Database },
]

function NoteTree({
  notes,
  onOpenNote,
  parentId,
  level,
}: {
  notes: Note[]
  onOpenNote: (id: string) => void
  parentId: string
  level: number
}) {
  const children = notes.filter((note) => note.parentId === parentId)
  if (children.length === 0 || level > 1) return null
  return (
    <div className="side-child-list">
      {children.map((child) => (
        <Fragment key={child.id}>
          <button
            type="button"
            onClick={() => onOpenNote(child.id)}
            title={child.title}
          >
            <span className="branch-bullet is-child" />
            <span>{child.title}</span>
          </button>
          <NoteTree
            notes={notes}
            onOpenNote={onOpenNote}
            parentId={child.id}
            level={level + 1}
          />
        </Fragment>
      ))}
    </div>
  )
}

export function Sidebar({
  view,
  onNavigate,
  onSearch,
  noteCount,
  onOpenNote,
  notes,
}: {
  view: ViewId
  onNavigate: (view: ViewId) => void
  onSearch: () => void
  noteCount: number
  onOpenNote: (id: string) => void
  notes: Note[]
}) {
  return (
    <>
      <aside className="sidebar">
        <button
          type="button"
          className="brand"
          onClick={() => onNavigate('home')}
        >
          <span className="brand-mark">
            <Sparkles size={20} />
          </span>
          <span className="brand-copy">
            <strong>全知库</strong>
            <small>AllKnow</small>
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
                {item.id === 'tree' && (
                  <div className="side-domain-inline">
                    {domains.map((domain) => (
                      <div key={domain.id} className="side-domain-tree">
                        <button
                          type="button"
                          className="side-domain-root"
                          onClick={() => onNavigate('tree')}
                          title={domain.description}
                        >
                          <DomainIcon domain={domain.id} size={16} />
                          <span>{domain.name}</span>
                          <ChevronRight size={13} />
                        </button>
                        <div className="side-domain-branches">
                          {domain.branches.map((branch) => (
                            <div key={branch.name} className="side-branch-item">
                              <button
                                type="button"
                                disabled={!branch.noteId}
                                onClick={() =>
                                  branch.noteId && onOpenNote(branch.noteId)
                                }
                                title={branch.blurb}
                              >
                                <span className="branch-bullet" />
                                <span>{branch.name}</span>
                              </button>
                              {branch.noteId && (
                                <NoteTree
                                  notes={notes}
                                  onOpenNote={onOpenNote}
                                  parentId={branch.noteId}
                                  level={1}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
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
            <strong>本地知识库</strong>
            <small>自动保存 · 随时导出</small>
          </div>
        </div>
      </aside>

      <nav className="mobile-nav" aria-label="移动端导航">
        {primaryItems.slice(0, 4).map((item) => {
          const Icon = item.icon
          const shortLabel =
            item.id === 'home'
              ? '首页'
              : item.id === 'notes'
                ? '笔记'
                : item.id === 'tree'
                  ? '领域'
                  : '图谱'
          return (
            <button
              key={item.id}
              type="button"
              className={view === item.id ? 'is-active' : ''}
              onClick={() => onNavigate(item.id)}
            >
              <Icon size={19} />
              <span>{shortLabel}</span>
            </button>
          )
        })}
        <button
          type="button"
          className={view === 'settings' ? 'is-active' : ''}
          onClick={() => onNavigate('settings')}
        >
          <Database size={19} />
          <span>设置</span>
        </button>
      </nav>
    </>
  )
}
