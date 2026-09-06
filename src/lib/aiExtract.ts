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

async function summarizeWithAi(
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
            '你是企业知识库编辑助手。请把附件内容整理为可直接放入知识条目的 Markdown 正文，保留关键信息、步骤、数据和清单，不要输出额外解释。',
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

function localDescription(fileName: string, content: string): string {
  const compact = content.replace(/\s+/g, ' ').trim()
  return `来源附件：${fileName}\n\n${compact}`
}

export async function generateAttachmentDescription(
  fileName: string,
  content: string,
): Promise<{ text: string; source: 'ai' | 'local' | 'none' }> {
  const clean = content.trim()
  if (!clean) return { text: '', source: 'none' }
  const settings = loadAiSettings()
  if (settings.enabled && settings.apiKey.trim()) {
    try {
      const summary = await summarizeWithAi(fileName, clean, settings)
      if (summary) return { text: summary, source: 'ai' }
    } catch {
      // Fall back to local extraction when the AI endpoint is unavailable.
    }
  }
  return { text: localDescription(fileName, clean), source: 'local' }
}
