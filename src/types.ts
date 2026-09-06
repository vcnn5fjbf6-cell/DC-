export type DomainId = 'internal'

export type NoteStatus = 'idea' | 'outline' | 'developing' | 'stable'

export interface Note {
  id: string
  title: string
  body: string
  domain: DomainId
  status: NoteStatus
  confidence: 1 | 2 | 3 | 4 | 5
  tags: string[]
  description?: string
  parentId?: string
  source?: string
  starred?: boolean
  createdAt: string
  updatedAt: string
}

export interface DomainBranch {
  name: string
  blurb: string
  noteId?: string
}

export interface AttachmentMeta {
  id: string
  noteId: string
  name: string
  mime: string
  size: number
  createdAt: string
}

export interface Domain {
  id: DomainId
  name: string
  shortName: string
  english: string
  color: string
  softColor: string
  description: string
  branches: DomainBranch[]
}
