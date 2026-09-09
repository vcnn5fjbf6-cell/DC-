import {
  ArrowRight,
  BookOpen,
  Database,
  FilePlus2,
  FolderOpen,
  Server,
  Upload,
} from 'lucide-react'
import { useMemo } from 'react'
import type { Note } from '../types'
import { relativeTime, sortByUpdated } from '../lib/notes'

export function Home({
  notes,
  onOpen,
  onCreate,
}: {
  notes: Note[]
  onOpen: (id: string) => void
  onCreate: () => void
}) {
  const machine = useMemo(
    () => notes.find((note) => note.id === 'seed-machine-room'),
    [notes],
  )
  const delivery = useMemo(
    () => notes.find((note) => note.id === 'seed-machine-delivery'),
    [notes],
  )
  const facility = useMemo(
    () => notes.find((note) => note.id === 'seed-machine-facility'),
    [notes],
  )
  const subLibraries = [delivery, facility].filter(
    (note): note is Note => Boolean(note),
  )
  const recent = useMemo(() => sortByUpdated(notes).slice(0, 6), [notes])

  return (
    <div className="page home-v2">
      <header className="page-heading home-v2-heading">
        <div>
          <p className="eyebrow">内部知识平台</p>
          <h1>内部知识库</h1>
          <p className="heading-sub">
            机房运维、交付与设施流程资料统一管理，上传附件后自动用真实 AI 整理正文。
          </p>
        </div>
        <div className="home-v2-actions">
          <button className="btn" onClick={() => machine && onOpen(machine.id)}>
            <Upload size={17} />
            进入机房运维
          </button>
          <button className="btn btn-primary" onClick={onCreate}>
            <FilePlus2 size={17} />
            新建条目
          </button>
        </div>
      </header>

      <div className="home-v2-grid">
        <section className="home-v2-directory">
          <div className="home-v2-section-head">
            <div>
              <h2>知识库目录</h2>
              <p>当前只保留内部知识库，按机房运维组织内容。</p>
            </div>
            <span>{notes.length} 条文档</span>
          </div>

          {machine && (
            <button
              type="button"
              className="home-v2-main-card"
              onClick={() => onOpen(machine.id)}
            >
              <span className="home-v2-main-icon">
                <Server size={26} />
              </span>
              <span className="home-v2-main-copy">
                <strong>机房运维</strong>
                <small>
                  {subLibraries.length} 个子知识库 · 运维资料统一入口
                </small>
              </span>
              <span className="home-v2-card-action">
                打开
                <ArrowRight size={16} />
              </span>
            </button>
          )}

          <div className="home-v2-sub-list">
            {subLibraries.map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => onOpen(note.id)}
              >
                <span className="home-v2-sub-icon">
                  <FolderOpen size={18} />
                </span>
                <span>
                  <strong>{note.title}</strong>
                  <small>
                    {note.tags.slice(0, 2).join(' / ') || '内部知识库'}
                  </small>
                </span>
                <ArrowRight size={16} />
              </button>
            ))}
          </div>
        </section>

        <aside className="home-v2-side">
          <div className="home-v2-summary">
            <span className="home-v2-summary-icon">
              <Database size={18} />
            </span>
            <div>
              <strong>内部知识库</strong>
              <small>唯一知识领域</small>
            </div>
          </div>
          <div className="home-v2-summary">
            <span className="home-v2-summary-icon amber">
              <FolderOpen size={18} />
            </span>
            <div>
              <strong>{subLibraries.length} 个子知识库</strong>
              <small>交付与设施</small>
            </div>
          </div>
          <div className="home-v2-summary">
            <span className="home-v2-summary-icon blue">
              <BookOpen size={18} />
            </span>
            <div>
              <strong>{notes.length} 条文档</strong>
              <small>当前全部内容</small>
            </div>
          </div>
        </aside>
      </div>

      <section className="home-v2-recent">
        <div className="home-v2-section-head">
          <div>
            <h2>最近使用</h2>
            <p>按更新时间查看条目，方便继续补充。</p>
          </div>
        </div>
        {recent.length > 0 ? (
          <div className="home-v2-recent-list">
            {recent.map((note) => (
              <button key={note.id} onClick={() => onOpen(note.id)}>
                <span className="home-v2-recent-dot" />
                <span>
                  <strong>{note.title}</strong>
                  <small>{relativeTime(note.updatedAt)}</small>
                </span>
                <ArrowRight size={15} />
              </button>
            ))}
          </div>
        ) : (
          <p className="home-v2-empty">还没有内容，先新建一个条目。</p>
        )}
      </section>
    </div>
  )
}
