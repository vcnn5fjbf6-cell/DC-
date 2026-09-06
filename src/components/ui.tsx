import { Star } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Note, NoteStatus } from '../types'
import { domainIcons, domainMap } from '../data/domains'
import { getStatusLabel } from '../lib/notes'

export function DomainIcon({
  domain,
  size = 18,
}: {
  domain: Note['domain']
  size?: number
}) {
  const Icon = domainIcons[domain]
  const meta = domainMap.get(domain)
  return (
    <span
      className="domain-icon"
      style={{ color: meta?.color, background: meta?.softColor }}
      aria-hidden="true"
    >
      <Icon size={size} strokeWidth={1.9} />
    </span>
  )
}

export function StatusPill({ status }: { status: NoteStatus }) {
  return (
    <span className={`status-pill status-${status}`}>
      {getStatusLabel(status)}
    </span>
  )
}

export function StarToggle({
  starred,
  onClick,
  label = '收藏',
}: {
  starred?: boolean
  onClick: () => void
  label?: string
}) {
  return (
    <button
      type="button"
      className={`icon-btn ${starred ? 'is-active' : ''}`}
      title={starred ? '取消收藏' : label}
      aria-label={starred ? '取消收藏' : label}
      onClick={onClick}
    >
      <Star size={17} fill={starred ? 'currentColor' : 'none'} />
    </button>
  )
}

export function TagChip({
  label,
  onClick,
  removable = false,
}: {
  label: string
  onClick?: () => void
  removable?: boolean
}) {
  return (
    <button
      type="button"
      className={`tag-chip ${onClick ? 'is-clickable' : ''}`}
      onClick={onClick}
      title={removable ? `移除 ${label}` : label}
    >
      <span className="tag-hash">#</span>
      {label}
      {removable && <span className="tag-remove">×</span>}
    </button>
  )
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: ReactNode
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <strong>{title}</strong>
      {hint && <p>{hint}</p>}
      {action}
    </div>
  )
}
