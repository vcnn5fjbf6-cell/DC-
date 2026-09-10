import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  ChevronRight,
  CircleDot,
  Database,
  Eye,
  FilePlus2,
  Link2,
  Paperclip,
  PencilLine,
  Plus,
  Save,
  Search,
  Trash2,
  Unlink,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Note, NoteStatus } from '../types'
import { domains } from '../data/domains'
import { renderMarkdown } from '../lib/markdown'
import {
  findNoteByTitle,
  formatDate,
  getIncomingNotes,
  getOutgoingNotes,
  noteExcerpt,
  parseWikiLinks,
  relativeTime,
} from '../lib/notes'
import { AttachmentPanel } from './AttachmentPanel'
import { DomainIcon, StarToggle, StatusPill, TagChip } from './ui'

const statusOptions: Array<{ id: NoteStatus; label: string }> = [
  { id: 'idea', label: '想法' },
  { id: 'outline', label: '提纲' },
  { id: 'developing', label: '发展中' },
  { id: 'stable', label: '成熟' },
]

export function NoteEditor({
  note,
  allNotes,
  onBack,
  onSave,
  onDelete,
  onOpen,
  onCreateChild,
  onCreate,
}: {
  note: Note
  allNotes: Note[]
  onBack: () => void
  onSave: (patch: Partial<Note>) => void
  onDelete: () => void
  onOpen: (id: string) => void
  onCreateChild: (parentId: string, title: string) => void
  onCreate: () => void
}) {
  const [draft, setDraft] = useState<Note>(note)
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'pending'>(
    'saved',
  )
  const [tagInput, setTagInput] = useState('')
  const [childTitle, setChildTitle] = useState('')
  const [landingQuery, setLandingQuery] = useState('')
  const uploadRef = useRef<{ open: () => void } | null>(null)

  const editableFieldsEqual = (
    a: Note,
    b: Note,
  ): boolean =>
    a.title === b.title &&
    a.body === b.body &&
    a.domain === b.domain &&
    a.status === b.status &&
    a.confidence === b.confidence &&
    a.source === b.source &&
    a.description === b.description &&
    a.starred === b.starred &&
    JSON.stringify(a.tags) === JSON.stringify(b.tags)

  useEffect(() => {
    setDraft(note)
    setSaveState('saved')
  }, [note.id])

  useEffect(() => {
    if (editableFieldsEqual(draft, note)) return
    setSaveState('pending')
    const timer = window.setTimeout(() => {
      onSave({
        title: draft.title,
        body: draft.body,
        domain: draft.domain,
        status: draft.status,
        confidence: draft.confidence,
        tags: draft.tags,
        source: draft.source,
        description: draft.description,
        starred: draft.starred,
      })
      setSaveState('saved')
    }, 650)
    return () => window.clearTimeout(timer)
  }, [draft, note, onSave])

  const html = useMemo(
    () =>
      renderMarkdown(draft.body, (title) => {
        const target = findNoteByTitle(allNotes, title)
        return target?.id
      }),
    [draft.body, allNotes],
  )

  const outgoing = useMemo(
    () => getOutgoingNotes(draft, allNotes),
    [draft, allNotes],
  )
  const incoming = useMemo(
    () => getIncomingNotes(draft, allNotes),
    [draft, allNotes],
  )
  const mentionedTitles = useMemo(() => parseWikiLinks(draft.body), [draft.body])
  const missingLinks = mentionedTitles.filter(
    (title) => !findNoteByTitle(allNotes, title),
  )
  const childNotes = useMemo(
    () =>
      allNotes
        .filter((item) => item.parentId === note.id)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
    [allNotes, note.id],
  )
  const isMachineRoom = note.id === 'seed-machine-room'
  const isLibraryLanding =
    note.parentId === 'seed-machine-room' ||
    (!note.parentId && !isMachineRoom && childNotes.length > 0)
  const isLanding = isMachineRoom || isLibraryLanding
  const landingKind = isLibraryLanding ? '文档条目' : '子知识库'
  const childEntryCounts = useMemo(() => {
    const counts = new Map<string, number>()
    const countDescendants = (parentId: string): number =>
      allNotes
        .filter((item) => item.parentId === parentId)
        .reduce(
          (total, child) => total + 1 + countDescendants(child.id),
          0,
        )
    for (const child of childNotes) {
      counts.set(child.id, countDescendants(child.id))
    }
    return counts
  }, [allNotes, childNotes])
  const libraryEntries = useMemo(() => {
    const entries: Array<{ note: Note; depth: number }> = []
    const visited = new Set<string>([note.id])
    const visit = (parentId: string, depth: number) => {
      const children = allNotes
        .filter((item) => item.parentId === parentId)
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )
      for (const child of children) {
        if (visited.has(child.id)) continue
        visited.add(child.id)
        entries.push({ note: child, depth })
        visit(child.id, depth + 1)
      }
    }
    visit(note.id, 0)
    return entries
  }, [allNotes, note.id])
  const filteredLibraryEntries = useMemo(() => {
    const query = landingQuery.trim().toLocaleLowerCase()
    if (!query) return libraryEntries
    return libraryEntries.filter(({ note: entry }) => {
      const haystack =
        `${entry.title} ${entry.body} ${entry.tags.join(' ')}`.toLocaleLowerCase()
      return haystack.includes(query)
    })
  }, [libraryEntries, landingQuery])
  const landingTitle = note.title.includes('：')
    ? note.title.split('：')[0]
    : note.title

  const patch = (value: Partial<Note>) => setDraft((current) => ({ ...current, ...value }))

  const applyAiContent = (text: string) => {
    const clean = text.trim()
    if (!clean) return
    setDraft((current) => ({
      ...current,
      body: clean,
    }))
    setSaveState('pending')
  }

  const changeTitle = (title: string) => {
    setDraft((current) => ({
      ...current,
      title,
      body: /^#\s/m.test(current.body)
        ? current.body.replace(/^#\s[^\n]*/u, `# ${title}`)
        : current.body,
    }))
  }

  const addTag = () => {
    const clean = tagInput.trim().replace(/^#/, '')
    if (!clean) return
    if (!draft.tags.some((tag) => tag === clean)) {
      patch({ tags: [...draft.tags, clean] })
    }
    setTagInput('')
  }

  const defaultChildTitle = isLibraryLanding ? '未命名文档条目' : '未命名知识库'
  const addChild = () => {
    const title = childTitle.trim() || defaultChildTitle
    onCreateChild(note.id, title)
    setChildTitle('')
  }

  const createFromTopbar = () => {
    if (isLanding) {
      onCreateChild(note.id, defaultChildTitle)
      return
    }
    onCreate()
  }

  const removeTag = (tag: string) => {
    patch({ tags: draft.tags.filter((item) => item !== tag) })
  }

  const handlePreviewClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as Element).closest('a[href^="#note:"]')
    if (!anchor) return
    const id = decodeURIComponent(
      anchor.getAttribute('href')?.replace('#note:', '') ?? '',
    )
    event.preventDefault()
    if (id) onOpen(id)
  }

  return (
    <div className="note-editor-page">
      <div className="editor-topbar">
        <div className="editor-breadcrumb">
          <button
            type="button"
            className="icon-btn"
            onClick={onBack}
            title="返回列表"
          >
            <ArrowLeft size={18} />
          </button>
          <DomainIcon domain={draft.domain} />
          <span>{domains.find((item) => item.id === draft.domain)?.name}</span>
          <ChevronRight size={14} />
          <strong className="breadcrumb-title">{draft.title || '未命名条目'}</strong>
        </div>
        <div className="editor-actions">
          <button
            type="button"
            className="btn btn-primary editor-new-btn"
            onClick={createFromTopbar}
            title={
              isLibraryLanding
                ? '在当前文档库新建文档条目'
                : isLanding
                  ? '新建子知识库'
                  : '新建知识条目'
            }
          >
            <FilePlus2 size={16} />
            {isLibraryLanding
              ? '新建文档条目'
              : isLanding
                ? '新建知识库'
                : '新建条目'}
          </button>
          {!isLanding && (
            <button
              type="button"
              className="btn editor-upload-btn"
              onClick={() => uploadRef.current?.open()}
              title="上传附件并智能整理"
            >
              <Paperclip size={16} />
              上传附件
            </button>
          )}
          {!isLanding && (
            <>
              <span
                className={`save-state ${
                  saveState === 'pending' ? 'is-pending' : ''
                }`}
              >
                {saveState === 'pending' ? (
                  <>
                    <Save size={13} />
                    正在保存
                  </>
                ) : (
                  <>
                    <Check size={13} />
                    已保存
                  </>
                )}
              </span>
              <StarToggle
                starred={draft.starred}
                onClick={() => patch({ starred: !draft.starred })}
              />
              <button
                type="button"
                className="btn btn-danger-ghost"
                onClick={() => {
                  if (window.confirm(`确定删除“${draft.title}”吗？`)) onDelete()
                }}
              >
                <Trash2 size={16} />
                删除
              </button>
            </>
          )}
        </div>
      </div>

      <div className={`editor-layout ${isLanding ? 'is-landing' : ''}`}>
        <main className="editor-main">
          {isLanding && (
            <div className="category-landing">
              <header className="category-landing-head">
                <span className="category-landing-icon">
                  <Database size={20} />
                </span>
                <div>
                  <p>{isLibraryLanding ? '文档库' : '知识分类'}</p>
                  <h1>{landingTitle}</h1>
                </div>
              </header>

              {isLibraryLanding ? (
                <>
                  <section className="kb-library-search-block">
                    <div className="kb-library-search-head">
                      <span>
                        当前文档库共 {libraryEntries.length} 个条目
                      </span>
                      <small>
                        搜索范围仅限“{note.title}”
                      </small>
                    </div>
                    <div className="search-box">
                      <Search size={16} />
                      <input
                        value={landingQuery}
                        onChange={(event) => setLandingQuery(event.target.value)}
                        placeholder={`搜索${note.title}内的标题、正文或标签`}
                        aria-label={`搜索${note.title}`}
                      />
                    </div>
                  </section>
                  <div className="kb-entry-list">
                    {filteredLibraryEntries.length === 0 ? (
                      <p className="kb-entry-empty">
                        当前文档库没有匹配条目，可在下方新建。
                      </p>
                    ) : (
                      filteredLibraryEntries.map(({ note: entry, depth }) => (
                        <button
                          key={entry.id}
                          type="button"
                          className="kb-entry-row"
                          style={{ marginLeft: depth * 16 }}
                          onClick={() => onOpen(entry.id)}
                        >
                          <span className="kb-entry-copy">
                            <strong>{entry.title}</strong>
                            <small>
                              {noteExcerpt(entry, 96) || '暂无正文'}
                            </small>
                          </span>
                          <span className="kb-entry-meta">
                            <StatusPill status={entry.status} />
                            <time>{relativeTime(entry.updatedAt)}</time>
                            <ArrowRight size={15} />
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <div className="kb-nav-grid">
                  {childNotes.map((child) => (
                    <button
                      key={child.id}
                      type="button"
                      className="kb-nav-card"
                      onClick={() => onOpen(child.id)}
                    >
                      <span className="kb-nav-card-icon">
                        <Database size={18} />
                      </span>
                      <span className="kb-nav-card-copy">
                        <strong>{child.title}</strong>
                        <small>
                          {childEntryCounts.get(child.id) ?? 0} 个条目
                        </small>
                      </span>
                      <ArrowRight size={17} />
                    </button>
                  ))}
                </div>
              )}

              <section className="kb-create-zone">
                <div className="kb-create-zone-head">
                  <span>
                    <Plus size={17} />
                  </span>
                  <div>
                    <strong>新建{landingKind}</strong>
                    <small>
                      {isLibraryLanding
                        ? '新条目会归入当前文档库，留空自动命名'
                        : note.parentId
                          ? '新的三级条目'
                          : '新的机房运维分类'}
                    </small>
                  </div>
                </div>
                <div className="kb-create-form">
                  <input
                    value={childTitle}
                    onChange={(event) => setChildTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        addChild()
                      }
                    }}
                    placeholder={isLibraryLanding ? '输入文档条目名称' : '输入新知识库名称'}
                    aria-label={isLibraryLanding ? '文档条目名称' : '新知识库名称'}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={addChild}
                  >
                    <Plus size={16} />
                    创建{landingKind}
                  </button>
                </div>
              </section>
            </div>
          )}

          {!isLanding && (
            <>
              <input
                className="note-title-input"
                value={draft.title}
                onChange={(event) => changeTitle(event.target.value)}
                placeholder="无标题知识"
                aria-label="条目标题"
              />
              <input
                className="note-source-input"
                value={draft.source ?? ''}
                onChange={(event) => patch({ source: event.target.value })}
                placeholder="来源或出处"
                aria-label="来源"
              />

              <div className="editor-tabs">
                <button
                  type="button"
                  className={mode === 'edit' ? 'is-active' : ''}
                  onClick={() => setMode('edit')}
                >
                  <PencilLine size={15} />
                  编辑
                </button>
                <button
                  type="button"
                  className={mode === 'preview' ? 'is-active' : ''}
                  onClick={() => setMode('preview')}
                >
                  <Eye size={15} />
                  预览
                </button>
              </div>

              {mode === 'edit' ? (
                <textarea
                  className="note-body-input"
                  value={draft.body}
                  onChange={(event) => patch({ body: event.target.value })}
                  spellCheck={false}
                  aria-label="Markdown 正文"
                />
              ) : (
                <div
                  className="markdown-preview"
                  onClick={handlePreviewClick}
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              )}
            </>
          )}
        </main>

        {!isLanding && (
          <aside className="editor-meta">
          <AttachmentPanel
            noteId={note.id}
            onContentGenerated={applyAiContent}
            uploadRef={uploadRef}
          />

          <section className="meta-block">
            <h3>归属</h3>
            <label>
              <span>领域</span>
              <select
                value={draft.domain}
                onChange={(event) =>
                  patch({ domain: event.target.value as Note['domain'] })
                }
              >
                {domains.map((domain) => (
                  <option key={domain.id} value={domain.id}>
                    {domain.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>阶段</span>
              <div className="segmented">
                {statusOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={draft.status === option.id ? 'is-active' : ''}
                    onClick={() => patch({ status: option.id })}
                    title={option.label}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </label>
            <label>
              <span>置信度</span>
              <div className="confidence-row">
                {([1, 2, 3, 4, 5] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={draft.confidence === value ? 'is-active' : ''}
                    onClick={() => patch({ confidence: value })}
                    title={`${value} 星置信`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </label>
          </section>

          <section className="meta-block">
            <h3>标签</h3>
            <div className="tag-editor">
              {draft.tags.map((tag) => (
                <TagChip
                  key={tag}
                  label={tag}
                  onClick={() => removeTag(tag)}
                  removable
                />
              ))}
              <div className="tag-add">
                <input
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ',') {
                      event.preventDefault()
                      addTag()
                    }
                  }}
                  placeholder="添加标签"
                  aria-label="新标签"
                />
                <button type="button" className="icon-btn" onClick={addTag} title="添加">
                  <Plus size={15} />
                </button>
              </div>
            </div>
          </section>

          <section className="meta-block links-block">
            <h3>
              <Link2 size={14} />
              双向连接
            </h3>
            <div className="link-subsection">
              <span>指向 {outgoing.length} 条</span>
              {outgoing.length > 0 ? (
                outgoing.map((target) => (
                  <button key={target.id} onClick={() => onOpen(target.id)}>
                    <span className="link-arrow">→</span>
                    {target.title}
                    <ArrowRight size={13} />
                  </button>
                ))
              ) : (
                <p>暂无指向</p>
              )}
            </div>
            <div className="link-subsection">
              <span>被指向 {incoming.length} 条</span>
              {incoming.length > 0 ? (
                incoming.map((source) => (
                  <button key={source.id} onClick={() => onOpen(source.id)}>
                    <span className="link-arrow">←</span>
                    {source.title}
                    <ArrowRight size={13} />
                  </button>
                ))
              ) : (
                <p>暂无其他条目指向这里</p>
              )}
            </div>
            {missingLinks.length > 0 && (
              <div className="missing-links">
                <Unlink size={13} />
                <div>
                  {missingLinks.map((title) => (
                    <span key={title}>{title}</span>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="meta-block note-facts">
            <h3>条目信息</h3>
            <p>
              <CircleDot size={14} />
              <span>当前状态</span>
              <StatusPill status={draft.status} />
            </p>
            <p>
              <CalendarClock size={14} />
              <span>创建</span>
              <time>{formatDate(note.createdAt)}</time>
            </p>
            <p>
              <CalendarClock size={14} />
              <span>更新</span>
              <time>{formatDate(note.updatedAt)}</time>
            </p>
          </section>
          </aside>
        )}
      </div>
    </div>
  )
}
