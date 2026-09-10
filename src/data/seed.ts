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

- [[交付相关文档库]]
- [[设施相关文档库]]

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
      '交付相关文档库',
      `# 交付相关文档库

交付相关文档库保存机房相关项目与设备的交付资料。

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
      '设施相关文档库',
      `# 设施相关文档库

设施相关文档库保存机房的供电、制冷、安防和消防等设施资料。

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

    createNote(
      'seed-delivery-mop',
      'MOP',
      `# MOP

MOP 用于沉淀交付实施的方法、步骤与执行要求，确保现场操作按统一流程完成。

## 适用内容

- 设备到货、搬运、上架和布线方法
- 配置、测试、切换和回退步骤
- 实施前检查、实施中控制和实施后确认
- 交付过程中的风险提示与操作边界

所属文档库：[[交付相关文档库]]`,
      ['机房运维', '交付相关', '文档分类', 'MOP'],
      'idea',
      day(0),
      'seed-machine-delivery',
    ),
    createNote(
      'seed-delivery-sop',
      'SOP',
      `# SOP

SOP 用于保存交付相关标准作业程序，明确每项工作的操作顺序、责任和完成标准。

## 适用内容

- 标准交付作业流程
- 操作步骤、检查点和确认记录
- 角色职责与交接要求
- 异常处理和升级路径

所属文档库：[[交付相关文档库]]`,
      ['机房运维', '交付相关', '文档分类', 'SOP'],
      'idea',
      day(1),
      'seed-machine-delivery',
    ),
    createNote(
      'seed-delivery-eop',
      'EOP',
      `# EOP

EOP 用于保存交付过程中出现异常、告警或紧急情况时的应急处置方案。

## 适用内容

- 交付异常和紧急故障处置
- 回退、恢复和业务保护步骤
- 应急联系人、升级路径与时限
- 复盘记录和预防措施

所属文档库：[[交付相关文档库]]`,
      ['机房运维', '交付相关', '文档分类', 'EOP'],
      'idea',
      day(2),
      'seed-machine-delivery',
    ),
    createNote(
      'seed-delivery-other',
      '其他文档',
      `# 其他文档

其他与交付相关、但不属于 MOP、SOP 或 EOP 的文档统一归档在这里。

## 适用内容

- 交付计划、会议纪要和沟通记录
- 验收资料、移交表和客户反馈
- 项目附件、参考模板和补充说明

所属文档库：[[交付相关文档库]]`,
      ['机房运维', '交付相关', '文档分类', '其他'],
      'idea',
      day(3),
      'seed-machine-delivery',
    ),
    createNote(
      'seed-facility-mop',
      'MOP',
      `# MOP

MOP 用于沉淀设施维护和操作的方法、步骤与执行要求。

## 适用内容

- UPS、配电、空调、消防和门禁操作方法
- 设施巡检、维护、切换和恢复步骤
- 操作前检查、操作中控制和操作后确认
- 设施操作风险与边界条件

所属文档库：[[设施相关文档库]]`,
      ['机房运维', '设施相关', '文档分类', 'MOP'],
      'idea',
      day(0),
      'seed-machine-facility',
    ),
    createNote(
      'seed-facility-sop',
      'SOP',
      `# SOP

SOP 用于保存设施相关标准作业程序，明确设施工作的操作顺序、责任和验收标准。

## 适用内容

- 设施巡检和维护标准流程
- 设备切换、保养和检修步骤
- 责任分工、检查点和交接要求
- 异常上报和升级路径

所属文档库：[[设施相关文档库]]`,
      ['机房运维', '设施相关', '文档分类', 'SOP'],
      'idea',
      day(1),
      'seed-machine-facility',
    ),
    createNote(
      'seed-facility-eop',
      'EOP',
      `# EOP

EOP 用于保存设施异常、告警和紧急事件发生时的应急处置方案。

## 适用内容

- 供电、制冷、消防和门禁应急处理
- 故障隔离、备用设备切换和恢复步骤
- 应急响应人员、联系方式和升级时限
- 事件复盘、整改和预防措施

所属文档库：[[设施相关文档库]]`,
      ['机房运维', '设施相关', '文档分类', 'EOP'],
      'idea',
      day(2),
      'seed-machine-facility',
    ),
    createNote(
      'seed-facility-other',
      '其他文档',
      `# 其他文档

其他与设施相关、但不属于 MOP、SOP 或 EOP 的文档统一归档在这里。

## 适用内容

- 设施台账、维保计划和检修记录
- 运行参数、报警记录和变更资料
- 安全检查、应急预案和补充说明

所属文档库：[[设施相关文档库]]`,
      ['机房运维', '设施相关', '文档分类', '其他'],
      'idea',
      day(3),
      'seed-machine-facility',
    ),
  ]
}
