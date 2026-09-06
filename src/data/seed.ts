import type { Note } from '../types'

function createNote(
  id: string,
  title: string,
  body: string,
  tags: string[],
  status: Note['status'],
  createdAt: string,
  parentId?: string,
): Note {
  return {
    id,
    title,
    body,
    domain: 'internal',
    status,
    confidence: 4,
    tags,
    parentId,
    createdAt,
    updatedAt: createdAt,
  }
}

export function buildSeedNotes(): Note[] {
  const now = new Date('2026-09-06T00:00:00.000Z')
  const day = (offset: number) =>
    new Date(now.getTime() - offset * 86400000).toISOString()

  return [
    createNote(
      'seed-internal',
      '内部知识库：全景导览',
      `# 内部知识库：全景导览

内部知识库沉淀组织真正要反复使用的业务流程与实操规范。当前以机房运维为入口，把巡检、环境监控、设备维保和应急处置写成可执行、可检查、可复盘的知识。

## 当前分类

- 机房运维：机房巡检、环境监控、设备维保与应急处理。

> 本页是内部知识库入口，任何流程条目都可以通过 [[...]] 连接到这里的分类体系。`,
      ['领域导览', '流程地图'],
      'developing',
      day(2),
    ),
    createNote(
      'seed-machine-room',
      '机房运维：机房巡检与应急处置',
      `# 机房运维：机房巡检与应急处置

机房运维保障服务器、网络、供电、制冷与安防系统的连续可用。它需要明确的巡检基线、告警响应顺序和可追溯的处理记录。

## 核心问题

- 机房巡检应覆盖哪些位置、设备和环境指标？
- 温湿度、供电、网络与告警异常时，谁在什么时间内响应？
- 巡检、处置和变更记录如何留存，才能支持问题复盘？

## 关键概念

- 机柜、服务器、交换机与存储台账
- UPS、配电、空调、消防与门禁监控
- 温湿度、烟感、漏水与告警联动
- 巡检表、变更记录、故障处置与值班交接

## 子知识库

- [[交付相关知识库]]
- [[设施相关知识库]]

## 延伸方向

- 建立“机房点位-设备-巡检项-责任人”对照表
- 把常见告警整理成现象、定位步骤、处置动作与升级条件

相关：[[内部知识库：全景导览]]`,
      ['内部知识库', '机房运维', '设施管理'],
      'developing',
      day(0),
    ),
    createNote(
      'seed-machine-delivery',
      '交付相关知识库',
      `# 交付相关知识库

交付相关知识库保存机房相关项目与设备的交付资料。

## 常用内容

- 到货、上架、布线、配置与测试记录
- 需求确认、实施计划和验收清单
- 交付文档、移交表和验收照片
- 使用方反馈与问题跟进

相关：[[机房运维：机房巡检与应急处置]]`,
      ['机房运维', '交付相关', '知识库'],
      'idea',
      day(0),
      'seed-machine-room',
    ),
    createNote(
      'seed-machine-facility',
      '设施相关知识库',
      `# 设施相关知识库

设施相关知识库保存机房的供电、制冷、安防和消防等设施资料。

## 常用内容

- UPS、配电、空调、消防与门禁台账
- 设施维保计划和检修记录
- 运行参数、报警与处置记录
- 设施变更、安全检查和应急预案

相关：[[机房运维：机房巡检与应急处置]]`,
      ['机房运维', '设施相关', '知识库'],
      'idea',
      day(0),
      'seed-machine-room',
    ),
  ]
}
