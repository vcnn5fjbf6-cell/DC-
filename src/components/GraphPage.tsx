import {
  ArrowUpRight,
  Crosshair,
  Expand,
  FilePlus2,
  FileText,
  Focus,
  Network,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { DomainId, Note } from '../types'
import { domains, domainMap } from '../data/domains'
import {
  findNoteByTitle,
  getIncomingNotes,
  getOutgoingNotes,
  noteExcerpt,
  parseWikiLinks,
  relativeTime,
} from '../lib/notes'
import { DomainIcon, StatusPill } from './ui'

type PosMap = Map<string, { x: number; y: number }>

function makeLayout(notes: Note[]): PosMap {
  const positions: PosMap = new Map()
  const groups = new Map<DomainId, Note[]>()
  for (const note of notes) {
    const list = groups.get(note.domain) ?? []
    list.push(note)
    groups.set(note.domain, list)
  }

  const domainEntries = [...groups.entries()]
  domainEntries.forEach(([_domain, list], groupIndex) => {
    const angle = (groupIndex / Math.max(1, domainEntries.length)) * Math.PI * 2
    const anchorX = 500 + Math.cos(angle) * 175
    const anchorY = 310 + Math.sin(angle) * 145
    list.forEach((note, index) => {
      const spread = (index / Math.max(1, list.length)) * Math.PI * 2
      positions.set(note.id, {
        x: anchorX + Math.cos(spread) * 66 + (Math.random() - 0.5) * 36,
        y: anchorY + Math.sin(spread) * 55 + (Math.random() - 0.5) * 30,
      })
    })
  })

  const links: Array<[Note, Note]> = []
  for (const note of notes) {
    for (const title of parseWikiLinks(note.body)) {
      const target = findNoteByTitle(notes, title)
      if (target && target.id !== note.id) links.push([note, target])
    }
  }

  for (let iteration = 0; iteration < 90; iteration += 1) {
    const noteList = [...positions.entries()]
    for (let i = 0; i < noteList.length; i += 1) {
      for (let j = i + 1; j < noteList.length; j += 1) {
        const a = noteList[i][1]
        const b = noteList[j][1]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const distance = Math.max(18, Math.hypot(dx, dy))
        if (distance > 360) continue
        const force = 7500 / (distance * distance)
        const moveX = (dx / distance) * force * 0.35
        const moveY = (dy / distance) * force * 0.35
        a.x -= moveX
        a.y -= moveY
        b.x += moveX
        b.y += moveY
      }
    }

    for (const [source, target] of links) {
      const a = positions.get(source.id)
      const b = positions.get(target.id)
      if (!a || !b) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      const distance = Math.max(36, Math.hypot(dx, dy))
      const desired = 104
      const force = (distance - desired) * 0.032
      const moveX = (dx / distance) * force
      const moveY = (dy / distance) * force
      a.x += moveX
      a.y += moveY
      b.x -= moveX
      b.y -= moveY
    }

    for (const [, pos] of positions) {
      pos.x += (500 - pos.x) * 0.012
      pos.y += (300 - pos.y) * 0.012
      pos.x = Math.max(72, Math.min(928, pos.x))
      pos.y = Math.max(76, Math.min(560, pos.y))
    }
  }

  return positions
}

export function GraphPage({
  notes,
  onOpen,
  onCreate,
}: {
  notes: Note[]
  onOpen: (id: string) => void
  onCreate: () => void
}) {
  const [filterDomain, setFilterDomain] = useState<DomainId | 'all'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [view, setView] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ x: number; y: number; dragging: boolean }>({
    x: 0,
    y: 0,
    dragging: false,
  })

  const filtered = useMemo(
    () =>
      filterDomain === 'all'
        ? notes
        : notes.filter((note) => note.domain === filterDomain),
    [notes, filterDomain],
  )

  const layout = useMemo(() => makeLayout(filtered), [filtered])
  const selected = useMemo(
    () => notes.find((note) => note.id === selectedId) ?? null,
    [notes, selectedId],
  )

  const edges = useMemo(() => {
    const seen = new Set<string>()
    const result: Array<[Note, Note]> = []
    for (const note of filtered) {
      for (const title of parseWikiLinks(note.body)) {
        const target = findNoteByTitle(filtered, title)
        if (!target || target.id === note.id) continue
        const key = [note.id, target.id].sort().join('|')
        if (seen.has(key)) continue
        seen.add(key)
        result.push([note, target])
      }
    }
    return result
  }, [filtered])

  const focusNote = selected ?? (filtered[0] ? notes.find((n) => n.id === filtered[0].id) : null)
  const incoming = focusNote ? getIncomingNotes(focusNote, notes) : []
  const outgoing = focusNote ? getOutgoingNotes(focusNote, notes) : []
  const allConnections = useMemo(() => {
    if (!focusNote) return []
    const map = new Map<string, Note>()
    for (const note of [...incoming, ...outgoing]) map.set(note.id, note)
    return [...map.values()]
  }, [focusNote, incoming, outgoing])

  useEffect(() => {
    if (!selected) return
    const pos = layout.get(selected.id)
    if (!pos) return
    setView({ x: 0, y: 0 })
    setZoom(1)
  }, [selected?.id, layout])

  const startDrag = (event: React.PointerEvent) => {
    const target = event.target as Element
    if (target.closest('.graph-node')) return
    dragRef.current = { x: event.clientX, y: event.clientY, dragging: true }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event: React.PointerEvent) => {
    if (!dragRef.current.dragging) return
    setView((current) => ({
      x: current.x + event.clientX - dragRef.current.x,
      y: current.y + event.clientY - dragRef.current.y,
    }))
    dragRef.current.x = event.clientX
    dragRef.current.y = event.clientY
  }

  const endDrag = () => {
    dragRef.current.dragging = false
  }

  const applyZoom = (delta: number) => {
    setZoom((current) => Math.max(0.55, Math.min(2.2, current + delta)))
  }

  const activeId = hoverId ?? selectedId

  return (
    <div className="page graph-page">
      <header className="page-heading graph-heading">
        <div>
          <h1>知识图谱</h1>
          <p className="heading-sub">
            当前视图 {filtered.length} 个节点 · {edges.length} 条连接
          </p>
        </div>
        <div className="graph-head-actions">
          <button className="btn btn-primary" onClick={onCreate}>
            <FilePlus2 size={17} />
            新建条目
          </button>
          <div className="graph-zoom" aria-label="图谱缩放">
            <button
              type="button"
              className="icon-btn"
              onClick={() => applyZoom(0.15)}
              title="放大"
            >
              <ZoomIn size={17} />
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              className="icon-btn"
              onClick={() => applyZoom(-0.15)}
              title="缩小"
            >
              <ZoomOut size={17} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                setZoom(1)
                setView({ x: 0, y: 0 })
              }}
              title="重置视图"
            >
              <Crosshair size={17} />
            </button>
          </div>
        </div>
      </header>

      <div className="graph-filter">
        <button
          type="button"
          className={filterDomain === 'all' ? 'chip is-active' : 'chip'}
          onClick={() => {
            setFilterDomain('all')
            setSelectedId(null)
          }}
        >
          <Network size={14} />
          全部
        </button>
        {domains.map((domain) => (
          <button
            key={domain.id}
            type="button"
            className={filterDomain === domain.id ? 'chip is-active' : 'chip'}
            onClick={() => {
              setFilterDomain(domain.id)
              setSelectedId(null)
            }}
          >
            <span className="chip-dot" style={{ background: domain.color }} />
            {domain.shortName}
          </button>
        ))}
      </div>

      <div className="graph-layout">
        <section className="graph-canvas-wrap">
          <div
            className="graph-canvas"
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
          >
            <svg
              viewBox="0 0 1000 620"
              role="img"
              aria-label="知识节点连接图谱"
              style={{
                transform: `translate(${view.x}px, ${view.y}px) scale(${zoom})`,
                transformOrigin: 'center',
              }}
            >
              <defs>
                <filter id="graphGlow" x="-80%" y="-80%" width="260%" height="260%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <pattern id="gridDot" width="28" height="28" patternUnits="userSpaceOnUse">
                  <circle cx="1.2" cy="1.2" r="1.2" fill="#cbd5d0" />
                </pattern>
              </defs>
              <rect width="1000" height="620" fill="url(#gridDot)" />
              <g className="graph-edges">
                {edges.map(([a, b]) => {
                  const pa = layout.get(a.id)
                  const pb = layout.get(b.id)
                  if (!pa || !pb) return null
                  const isHot =
                    activeId === a.id || activeId === b.id || activeId === selectedId
                  return (
                    <line
                      key={`${a.id}-${b.id}`}
                      x1={pa.x}
                      y1={pa.y}
                      x2={pb.x}
                      y2={pb.y}
                      className={isHot ? 'is-hot' : ''}
                    />
                  )
                })}
              </g>
              <g className="graph-nodes">
                {filtered.map((note) => {
                  const pos = layout.get(note.id)
                  if (!pos) return null
                  const degree =
                    edges.filter(
                      ([a, b]) => a.id === note.id || b.id === note.id,
                    ).length
                  const domain = domainMap.get(note.domain)
                  const radius = Math.min(15, 8 + Math.min(degree * 1.25, 8))
                  const isActive = activeId === note.id
                  return (
                    <g
                      key={note.id}
                      className={`graph-node ${isActive ? 'is-active' : ''}`}
                      transform={`translate(${pos.x} ${pos.y})`}
                      onClick={() => {
                        setSelectedId(note.id)
                        setHoverId(null)
                      }}
                      onMouseEnter={() => setHoverId(note.id)}
                      onMouseLeave={() => setHoverId(null)}
                      style={{ cursor: 'pointer' }}
                    >
                      <title>{`${note.title}（${domain?.shortName ?? ''}）`}</title>
                      <circle
                        r={radius + 4}
                        fill={isActive ? domain?.color : 'transparent'}
                        opacity={isActive ? 0.14 : 0}
                      />
                      <circle
                        r={radius}
                        fill={domain?.color}
                        fillOpacity={0.92}
                        stroke={isActive ? '#fff' : domain?.color}
                        strokeWidth={isActive ? 3 : 1}
                        filter={isActive ? 'url(#graphGlow)' : undefined}
                      />
                      {isActive && (
                        <text
                          y={-radius - 10}
                          textAnchor="middle"
                          className="graph-node-label"
                        >
                          {note.title}
                        </text>
                      )}
                    </g>
                  )
                })}
              </g>
            </svg>
          </div>
          <div className="graph-legend">
            {filterDomain === 'all' ? (
              domains.map((domain) => (
                <button
                  key={domain.id}
                  type="button"
                  onClick={() => setFilterDomain(domain.id)}
                >
                  <span style={{ background: domain.color }} />
                  {domain.shortName}
                </button>
              ))
            ) : (
              <button type="button" onClick={() => setFilterDomain('all')}>
                <Focus size={13} />
                当前聚焦 {domainMap.get(filterDomain)?.name}，点击返回全部
              </button>
            )}
          </div>
        </section>

        <aside className="graph-detail">
          {focusNote ? (
            <>
              <div className="graph-detail-head">
                <DomainIcon domain={focusNote.domain} size={20} />
                <div>
                  <h2>{focusNote.title}</h2>
                  <p>{domainMap.get(focusNote.domain)?.name}</p>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => onOpen(focusNote.id)}
                  title="打开条目"
                >
                  <Expand size={17} />
                </button>
              </div>
              <StatusPill status={focusNote.status} />
              <p className="graph-detail-excerpt">
                {noteExcerpt(focusNote, 120)}
              </p>
              <div className="graph-detail-section">
                <strong>直接连接 ({allConnections.length})</strong>
                <div className="connection-list">
                  {allConnections.slice(0, 10).map((note) => (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => setSelectedId(note.id)}
                    >
                      <span className="connection-dot" />
                      <span>{note.title}</span>
                      <ArrowUpRight size={13} />
                    </button>
                  ))}
                  {allConnections.length === 0 && <p>暂无直接连接</p>}
                </div>
              </div>
              <div className="graph-detail-footer">
                <span>
                  <FileText size={14} />
                  更新于 {relativeTime(focusNote.updatedAt)}
                </span>
                <button type="button" className="text-btn" onClick={() => onOpen(focusNote.id)}>
                  打开完整条目
                </button>
              </div>
            </>
          ) : (
            <div className="graph-detail-empty">
              <Network size={28} />
              <h2>当前图谱</h2>
              <p>
                {filtered.length} 个节点 · {edges.length} 条连接 ·{' '}
                {new Set(filtered.map((note) => note.domain)).size} 个领域
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
