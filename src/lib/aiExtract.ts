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
  if (/风险|注意|禁止|必须|不得|隐患|安全|警告/.test(text)) return '风险与注意事项'
  if (/故障|告警|异常|报修|处置|应急|恢复/.test(text)) return '故障与应急处置'
  if (/巡检|检查|验收|核对|确认|复查|清单/.test(text)) return '检查与巡检'
  if (/流程|步骤|操作|安装|配置|部署|上架|实施|执行|移交/.test(text)) return '流程与步骤'
  if (/温度|湿度|电压|电流|功率|频率|型号|容量|参数|UPS|空调|配电/.test(text)) return '设备与参数'
  if (/负责人|责任|值班|联系人|审批|权限|岗位/.test(text)) return '角色与职责'
  if (/台账|记录|日志|变更|资产|编号|库存|备件/.test(text)) return '记录与台账'
  if (/文档|资料|文件|模板|制度|规范|手册/.test(text)) return '文件与资料'
  return '其他内容'
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
            '你是企业知识库结构化整理助手。请先识别附件的主分类，再把内容细化为可直接放入知识条目的 Markdown 正文。必须使用以下结构：\n### 文档分类\n- 主分类：\n- 细分分类：\n- 适用场景：\n- 来源附件：\n\n### 内容概要\n\n### 分类要点\n#### 流程与步骤\n#### 要求与标准\n#### 设备与参数\n#### 巡检与记录\n#### 风险与注意事项\n#### 故障与应急处置\n#### 角色与职责\n（没有对应内容的分类不要输出）\n\n### 补充信息\n保留所有关键数据、步骤、参数和清单，不使用一级标题，不输出开场白。',
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
  return data.choices?.[0]?.message?.content?.trim() ?? ''
}

function localStructuredContent(fileName: string, content: string): string {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const compact = lines.join(' ').replace(/\s+/g, ' ')
  const category = detectMainCategory(fileName, content)
  const buckets = new Map<string, string[]>()
  const headings: string[] = []
  for (const line of lines) {
    if (/^#{1,6}\s/.test(line)) {
      headings.push(line.replace(/^#{1,6}\s*/, '').replace(/[*_]/g, ''))
      continue
    }
    const categoryName = classifyLine(line)
    const list = buckets.get(categoryName) ?? []
    if (list.length < 14) list.push(line.replace(/^[-*]\s*/, ''))
    buckets.set(categoryName, list)
  }
  const categoryOrder = [
    '流程与步骤',
    '要求与标准',
    '设备与参数',
    '检查与巡检',
    '故障与应急处置',
    '风险与注意事项',
    '角色与职责',
    '记录与台账',
    '文件与资料',
    '其他内容',
  ]
  const classified = categoryOrder
    .filter((name) => (buckets.get(name) ?? []).length > 0)
    .map((name) => `#### ${name}\n${(buckets.get(name) ?? []).map((item) => `- ${item}`).join('\n')}`)
    .join('\n\n')
  const headingBlock =
    headings.length > 0
      ? `### 章节识别\n\n${headings
          .slice(0, 20)
          .map((item) => `- ${item}`)
          .join('\n')}`
      : ''
  return [
    '### 文档分类',
    '',
    `- 主分类：${category}`,
    `- 来源附件：${fileName}`,
    `- 内容规模：${content.length} 字`,
    '',
    '### 内容概要',
    '',
    `${compact.slice(0, 700)}${compact.length > 700 ? '…' : ''}`,
    '',
    headingBlock,
    headingBlock ? '' : null,
    '### 细化分类',
    '',
    classified,
  ]
    .filter((line): line is string => line !== null)
    .join('\n')
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
