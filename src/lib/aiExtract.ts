const SETTINGS_KEY = 'allknow-ai-settings-v1'

export interface AiSettings {
  endpoint: string
  apiKey: string
  model: string
  enabled: boolean
}

export function defaultAiSettings(): AiSettings {
  return {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    apiKey: '',
    model: 'gpt-4o-mini',
    enabled: false,
  }
}

export function loadAiSettings(): AiSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY)
    if (!raw) return defaultAiSettings()
    return { ...defaultAiSettings(), ...(JSON.parse(raw) as Partial<AiSettings>) }
  } catch {
    return defaultAiSettings()
  }
}

export function saveAiSettings(settings: AiSettings): void {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

function extensionOf(name: string): string {
  return name.includes('.') ? name.split('.').pop()?.toLowerCase() ?? '' : ''
}

function detectMainCategory(fileName: string, content: string): string {
  const extension = extensionOf(fileName)
  const joined = content.slice(0, 6000).toLowerCase()
  if (['xlsx', 'xls', 'csv', 'et'].includes(extension)) return '数据与台账'
  if (
    /台账|清单|编号|资产|型号|备件|库存/.test(joined)
  ) {
    return '数据与台账'
  }
  if (
    /巡检|运维|机房|服务器|UPS|配电|空调|故障|告警|设备|门禁|消防/.test(joined)
  ) {
    return '设施与运维'
  }
  if (
    /流程|步骤|操作|实施|部署|配置|验收|交付|安装|上架|移交/.test(joined)
  ) {
    return '流程与交付'
  }
  if (/制度|规范|标准|办法|要求|禁止|不得|管理|审批/.test(joined)) {
    return '制度与规范'
  }
  if (/培训|教程|说明|知识|介绍|学习/.test(joined)) {
    return '知识与培训'
  }
  return '综合知识'
}

function classifyLine(line: string): string {
  const text = line.toLowerCase()
  if (/风险|注意|隐患|安全|警告/.test(text)) return '风险与注意事项'
  if (/故障|告警|异常|报修|处置|应急|恢复/.test(text)) return '故障与应急处置'
  if (/必须|不得|禁止|要求|标准|规范|一致/.test(text)) return '要求与标准'
  if (/巡检|检查|验收|核对|确认|复查|清单/.test(text)) return '检查与巡检'
  if (/流程|步骤|操作|安装|配置|部署|上架|实施|执行|移交/.test(text)) return '流程与步骤'
  if (/温度|湿度|电压|电流|功率|频率|型号|容量|参数|UPS|空调|配电/.test(text)) return '设备与参数'
  if (/负责人|责任|值班|联系人|审批|权限|岗位/.test(text)) return '角色与职责'
  if (/台账|记录|日志|变更|资产|编号|库存|备件/.test(text)) return '记录与台账'
  if (/文档|资料|文件|模板|制度|规范|手册/.test(text)) return '文件与资料'
  return '其他内容'
}

function isNoiseLine(text: string): boolean {
  if (text.length < 6) return true
  if (
    /^(第\s*\d+\s*页|page\s*\d+|www\.|https?:\/\/|©|copyright|版权所有|机密|内部资料|仅限内部|仅供参考|打印于|生成于|创建时间|更新时间)/iu.test(
      text,
    )
  ) {
    return true
  }
  if (
    /^(编号|版本|密级|编制人|审核人|批准人|文件号|联系电话|联系人)\s*[：:]/u.test(
      text,
    ) &&
    !/流程|规范|制度|步骤/u.test(text)
  ) {
    return true
  }
  if (
    /^(以上为示例|以上内容为示例|模板说明|本文档为示例|该模板|仅供内部使用|仅限内部|请勿直接使用|请勿外传|如有疑问请咨询|以下内容仅供参考|打印于|生成于)/u.test(
      text,
    )
  ) {
    return true
  }
  return false
}

function relevanceScore(
  line: string,
  category: string,
  mainCategory: string,
): number {
  let score = 0
  if (
    /必须|禁止|不得|要求|标准|验收|确认|检查|巡检|记录|流程|步骤|操作|参数|故障|风险|告警|异常|温度|湿度|电压|UPS|空调|负责人|值班|登记|上报|处置|配置|安装|上架|归档/u.test(
      line,
    )
  ) {
    score += 3
  }
  if (/\d+(\.\d+)?\s*(%|℃|度|V|A|W|Hz|小时|天|周|月)/u.test(line)) {
    score += 1
  }
  if (/\d+/u.test(line)) score += 1
  if (/模板|套话|举例说明|如有疑问|请咨询|咨询电话/u.test(line)) score -= 2
  if (category === '其他内容') score -= 2
  if (
    category === mainCategory ||
    (mainCategory === '设施与运维' &&
      /检查|巡检|参数|设备|故障|告警|UPS|空调|配电/u.test(line))
  ) {
    score += 1
  }
  return score
}

function splitSemanticUnit(text: string): string[] {
  if (text.length <= 36) return [text]
  const boundaries = [
    '验收单要求',
    '验收要求',
    '验收记录',
    '记录由',
    '温度高于',
    '温度低于',
    '巡检记录',
    '巡检发现',
    '发现风险',
    '风险隐患',
    '值班负责人',
    '必须记录',
    '每周检查',
    '每日登记',
    '发现异常',
    '立即上报',
    '同时',
  ]
  const cutPoints: number[] = []
  for (const boundary of boundaries) {
    const start = text.indexOf(boundary)
    if (start > 8 && !cutPoints.includes(start)) cutPoints.push(start)
  }
  cutPoints.sort((a, b) => a - b)
  if (cutPoints.length === 0) return [text]
  const parts: string[] = []
  let start = 0
  for (const point of cutPoints) {
    if (point - start < 10) continue
    parts.push(text.slice(start, point).trim())
    start = point
  }
  parts.push(text.slice(start).trim())
  return parts.filter(Boolean)
}

export async function extractFileText(file: File): Promise<string> {
  const extension = extensionOf(file.name)
  try {
    if (
      extension === 'txt' ||
      extension === 'md' ||
      extension === 'csv' ||
      extension === 'json'
    ) {
      return await file.text()
    }
    if (extension === 'docx') {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
      return result.value
    }
    if (extension === 'xlsx' || extension === 'xls') {
      const XLSX = await import('xlsx')
      const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), {
        type: 'array',
      })
      const parts: string[] = []
      for (const sheetName of workbook.SheetNames) {
        const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
          header: 1,
          defval: '',
        })
        parts.push(
          `${sheetName}\n${rows
            .map((row) =>
              Array.isArray(row)
                ? row.map((cell) => String(cell ?? '')).join('\t')
                : '',
            )
            .join('\n')}`,
        )
      }
      return parts.join('\n\n')
    }
    if (extension === 'pdf') {
      return await extractPdfText(await file.arrayBuffer())
    }
    return ''
  } catch {
    return ''
  }
}

async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise
  const pages: string[] = []
  for (let index = 1; index <= Math.min(doc.numPages, 30); index += 1) {
    const page = await doc.getPage(index)
    const content = await page.getTextContent()
    pages.push(
      content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' '),
    )
  }
  return pages.join('\n')
}

async function structureWithAi(
  fileName: string,
  content: string,
  settings: AiSettings,
): Promise<string> {
  const response = await fetch(settings.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content:
            '你是企业知识库结构化整理助手。只输出文档标题和两个部分，其余内容一律不输出：\n**文档标题**\n\n### 操作步骤\n**1. 一级标题**\n- 操作内容\n**1.1 二级标题**\n- 操作内容\n\n### 备注\n- 备注、注意事项、避免事项、参照内容\n\n删除页眉页脚、水印、页码、模板说明、联系方式、元信息、要求、完成标准和无关内容。没有操作步骤或备注的分节不要输出，不输出开场白。',
        },
        {
          role: 'user',
          content: `附件名称：${fileName}\n\n附件内容：\n${content.slice(0, 12000)}`,
        },
      ],
    }),
  })
  if (!response.ok) throw new Error(`AI request failed: ${response.status}`)
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const structured = data.choices?.[0]?.message?.content?.trim() ?? ''
  return /^###\s/m.test(structured) ? structured : ''
}

function splitLogicalUnits(text: string): string[] {
  const cleaned = text.replace(/\t/g, '；').replace(/[ \t]{2,}/g, ' ').trim()
  if (!cleaned) return []
  const punctuationUnits = cleaned
    .split(/(?<=[。！？；;.!?])\s*/u)
    .map((unit) => unit.trim())
    .filter((unit) => unit.length > 1)
  return punctuationUnits.flatMap((unit) => splitSemanticUnit(unit))
}

function polishLine(text: string): string {
  return text
    .replace(/^[\s>#*•·\-—]+/, '')
    .replace(/^[\d一二三四五六七八九十]+[.、．)]\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function extractHeading(line: string): string | null {
  const clean = line.replace(/^#{1,6}\s*/, '').replace(/[*_]/g, '').trim()
  if (clean.length > 90) return null
  if (
    clean.length > 30 &&
    !/^(第\s*[一二三四五六七八九十百\d]+\s*[章节篇部分]|附录|附件)/u.test(
      clean,
    )
  ) {
    return null
  }
  const headingPattern =
    /^(第\s*[一二三四五六七八九十百\d]+\s*[章节篇部分]|附录|附件|目的|适用范围|职责|流程|步骤|操作|要求|标准|检查|巡检|记录|应急|风险|注意|数据|参数|清单|制度|规范)/u
  const numberedPattern = /^([一二三四五六七八九十]+[、.．]|\d+\s*[.、．])\s*\S/u
  if (headingPattern.test(clean) || numberedPattern.test(clean)) return clean
  return null
}

function parseStepCandidate(line: string): string | null {
  if (line.includes('\t')) {
    const cells = line
      .split('\t')
      .map((cell) => cell.trim())
      .filter(Boolean)
    if (cells.length > 1) {
      const first = cells[0]
      if (/^(序号|步骤|操作|动作|流程|负责人|时间|备注|操作内容)$/i.test(first)) {
        return null
      }
      if (/^[一二三四五六七八九十\d]+$/.test(first)) {
        const action = cells
          .slice(1)
          .find((cell) => !/^(负责人|时间|备注)$/.test(cell) && cell.length > 1)
        if (action) return action
      }
      const body = cells.join('；')
      if (/步骤|操作|执行|检查|确认|登记/.test(body) && first.length <= 8) {
        return body
      }
    }
    return null
  }
  const text = line.trim()
  const explicit = text.match(
    /^(?:第\s*[一二三四五六七八九十百\d]+\s*步|步骤\s*[一二三四五六七八九十百\d]+|step\s*\d+)\s*[:：、.\-]?\s*(.+)$/i,
  )
  if (explicit) return explicit[1]
  const numbered = text.match(/^([一二三四五六七八九十]|\d+)\s*[、.．)]\s*(.+)$/u)
  if (numbered) {
    const body = numbered[2]
    if (
      /^(目的|适用范围|职责|概述|简介|定义|要求|标准|风险|注意|记录|清单|制度|规范|章节|操作步骤)/u.test(
        body,
      )
    ) {
      return null
    }
    return body
  }
  return null
}

function isStepSectionHeading(line: string): boolean {
  const text = line.trim()
  return (
    text.length < 26 &&
    /^(操作步骤|作业步骤|实施步骤|流程步骤|操作流程|具体操作|操作说明|操作规范|交付步骤|实施流程)/u.test(
      text,
    )
  )
}

function isRemarkContent(line: string): boolean {
  const plain = polishLine(line).toLowerCase()
  return (
    /^(备注|注|注意|说明|风险|警示|重要提示|注意事项|避免|防止|严禁|禁止|参照.*checklist|如不满足|请务必)/u.test(
      plain,
    ) ||
    /(备注|注意事项|避免|防止|严禁|禁止|风险提示|重要提示)/u.test(plain) &&
      plain.length < 120
  )
}

function buildHierarchicalContent(content: string): string | null {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return null

  const meaningful = lines.filter(
    (line) => !isNoiseLine(line) && line.length > 1,
  )
  const titleLine =
    meaningful.find(
      (line) =>
        /操作流程|实施方案|作业指引|作业指导书|操作规范|作业流程|工作指引|工单|方案/u.test(
          line,
        ) &&
        line.length < 70 &&
        !/^\d/u.test(line),
    ) ?? ''
  const title = titleLine
    ? titleLine.replace(/^\*{1,2}|\*{1,2}$/gu, '').replace(/^#+\s*/u, '').trim()
    : ''

  const stepLines: string[] = []
  const remarkLines: string[] = []
  let sectionCount = 0
  for (let index = 0; index < meaningful.length; index += 1) {
    const line = meaningful[index]
    const plain = line.replace(/^\*{1,2}|\*{1,2}$/gu, '').replace(/#+\s*/u, '').trim()
    const next = meaningful[index + 1] ?? ''
    const isBullet = /^[-•*·]\s+/u.test(line)
    const numeric = plain.match(/^(\d+(?:\.\d+)*)\s*[.、．]\s*(.+)$/u)
    const looksBoldHeading = /^\*\*.+\*\*$/u.test(line) && plain.length < 60
    const nextLooksSubHeading =
      numeric && /^\d+\.\d+(\s+|\s*[.、．]\s*)\S/u.test(next)
    const nextIsBullet = /^[-•*·]\s+/u.test(next)

    if (numeric && (looksBoldHeading || nextIsBullet || nextLooksSubHeading)) {
      stepLines.push(`**${plain}**`)
      sectionCount += 1
      continue
    }
    if (isBullet) {
      if (isRemarkContent(line)) remarkLines.push(line)
      else stepLines.push(line)
      continue
    }
    if (looksBoldHeading && !numeric) {
      if (isRemarkContent(line)) remarkLines.push(`- ${plain}`)
      else stepLines.push(line)
      continue
    }
    if (sectionCount > 0 && isRemarkContent(line)) {
      remarkLines.push(`- ${plain}`)
      continue
    }
  }

  if (sectionCount < 1 || stepLines.length < 2) return null
  const output: string[] = []
  if (title) output.push(`**${title}**`, '')
  output.push('### 操作步骤', '', ...stepLines)
  if (remarkLines.length > 0) {
    output.push('', '### 备注', '', ...remarkLines)
  }
  return output.join('\n')
}

function localStructuredContent(fileName: string, content: string): string {
  const hierarchical = buildHierarchicalContent(content)
  if (hierarchical) return hierarchical

  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const category = detectMainCategory(fileName, content)
  const buckets = new Map<string, string[]>()
  const headings: string[] = []
  const polished: string[] = []
  const seen = new Set<string>()
  const operationSteps: string[] = []
  let inOperationSection = false
  for (const rawLine of lines) {
    const stepHeading = isStepSectionHeading(rawLine)
    if (stepHeading) {
      inOperationSection = true
      continue
    }
    const heading = extractHeading(rawLine)
    const stepCandidate = parseStepCandidate(rawLine)
    if (inOperationSection && heading && !stepCandidate) {
      inOperationSection = false
    }
    if (inOperationSection && !stepCandidate) {
      const clean = polishLine(rawLine)
      if (
        clean &&
        clean.length > 2 &&
        /检查|确认|打开|关闭|登录|填写|点击|连接|配置|上传|提交|登记|联系|处置|复核|验收|开始|完成|启动|停止|断电|通电|联系|上报/u.test(
          clean,
        ) &&
        operationSteps.length < 40
      ) {
        operationSteps.push(clean)
      }
      continue
    }
    if (stepCandidate) {
      if (operationSteps.length < 40) {
        operationSteps.push(polishLine(stepCandidate))
      }
      continue
    }
    if (heading) {
      headings.push(heading)
      continue
    }
    for (const unit of splitLogicalUnits(rawLine)) {
      const clean = polishLine(unit)
      if (!clean || clean.length < 2 || seen.has(clean)) continue
      if (isNoiseLine(clean)) continue
      const categoryName = classifyLine(clean)
      const score = relevanceScore(clean, categoryName, category)
      if (score < 2) continue
      seen.add(clean)
      polished.push(clean)
      const list = buckets.get(categoryName) ?? []
      if (list.length < 12) list.push(clean)
      buckets.set(categoryName, list)
    }
  }
  const stepBlock =
    operationSteps.length > 0
      ? `### 操作步骤\n\n${operationSteps
          .slice(0, 30)
          .map((step, index) => `${index + 1}. ${step}`)
          .join('\n')}`
      : ''
  const remarkItems = polished.filter((item) => isRemarkContent(item)).slice(0, 30)
  const remarkBlock =
    remarkItems.length > 0
      ? `### 备注\n\n${remarkItems.map((item) => `- ${item}`).join('\n')}`
      : ''
  const contentParts = [stepBlock, remarkBlock].filter(Boolean)
  if (contentParts.length === 0) return ''
  const title = fileName.replace(/\.[^.]+$/, '')
  return [`**${title}**`, '', contentParts.join('\n\n')].join('\n')
}

export async function generateStructuredAttachmentContent(
  fileName: string,
  content: string,
): Promise<{ text: string; source: 'ai' | 'local' | 'none' }> {
  const clean = content.trim()
  if (!clean) return { text: '', source: 'none' }
  const settings = loadAiSettings()
  if (settings.enabled && settings.apiKey.trim()) {
    try {
      const structured = await structureWithAi(fileName, clean, settings)
      if (structured) return { text: structured, source: 'ai' }
    } catch {
      // Fall back to local extraction when the AI endpoint is unavailable.
    }
  }
  return { text: localStructuredContent(fileName, clean), source: 'local' }
}
