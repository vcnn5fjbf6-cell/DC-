import { Workflow } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Domain, DomainId } from '../types'

export const domains: Domain[] = [
  {
    id: 'internal',
    name: '内部知识库',
    shortName: '内部',
    english: 'Internal Knowledge',
    color: '#4b5b6b',
    softColor: '#e9edf2',
    description: '组织沉淀的业务流程、规范与实操经验。',
    branches: [
      {
        name: '机房运维',
        blurb: '机房巡检、环境监控、设备维保与应急处理',
        noteId: 'seed-machine-room',
      },
    ],
  },
]

export const domainMap = new Map<DomainId, Domain>(
  domains.map((domain) => [domain.id, domain]),
)

export const domainIcons: Record<DomainId, LucideIcon> = {
  internal: Workflow,
}
