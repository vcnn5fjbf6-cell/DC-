import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const PORT = Number(process.env.PORT ?? 5188)
const LOCAL_SERVICE_TIMEOUT = 300000
const CODEX_BIN = process.env.CODEX_BIN ?? '/usr/local/bin/codex'
const DIRECT_FALLBACK_BASE_URL =
  process.env.ALLKNOW_AI_DIRECT_BASE_URL ?? 'https://api.deepseek.com'
const DIRECT_FALLBACK_MODEL =
  process.env.ALLKNOW_AI_DIRECT_MODEL ?? 'deepseek-chat'

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
}

function sendJson(res, status, payload) {
  setCors(res)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

function readBody(req, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > maxBytes) {
        reject(new Error('payload too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function firstNonEmpty(...values) {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim() ?? ''
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    return {}
  }
}

function isLocalProxyUrl(value) {
  return /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/iu.test(
    String(value ?? '').trim(),
  )
}

function isPlaceholderToken(value) {
  return !value || /^PROXY_MANAGED$/iu.test(value)
}

function resolveProvider(baseUrl, token, model, authToken) {
  const configuredUrl = firstNonEmpty(baseUrl)
  const configuredToken = firstNonEmpty(token)
  const configuredModel = firstNonEmpty(model)
  const useDirectFallback =
    isLocalProxyUrl(configuredUrl) &&
    isPlaceholderToken(configuredToken) &&
    Boolean(authToken)
  if (useDirectFallback) {
    return {
      baseUrl: DIRECT_FALLBACK_BASE_URL,
      token: authToken,
      model: DIRECT_FALLBACK_MODEL,
      useCodex: false,
      source: 'deepseek-direct',
    }
  }
  const effectiveToken = isPlaceholderToken(configuredToken)
    ? authToken
    : configuredToken
  return {
    baseUrl: configuredUrl,
    token: effectiveToken,
    model: configuredModel,
    useCodex: Boolean(configuredUrl && !isLocalProxyUrl(configuredUrl)),
    source: isLocalProxyUrl(configuredUrl) ? 'local-proxy' : 'codex-config',
  }
}

/* ---------- 读取本机 Codex 配置的自定义模型供应商 ---------- */
function loadProvider() {
  const env = {
    baseUrl: firstNonEmpty(process.env.ALLKNOW_AI_BASE_URL),
    token: firstNonEmpty(
      process.env.ALLKNOW_AI_TOKEN,
      process.env.DEEPSEEK_API_KEY,
      process.env.OPENAI_API_KEY,
    ),
    model: firstNonEmpty(process.env.ALLKNOW_AI_MODEL),
  }
  const auth = readJson(join(homedir(), '.codex', 'auth.json'))
  const authToken = firstNonEmpty(
    auth.OPENAI_API_KEY,
    auth.api_key,
    auth.tokens?.access_token,
  )
  if (env.baseUrl && env.token && env.model) {
    return resolveProvider(env.baseUrl, env.token, env.model, authToken)
  }
  try {
    const text = readFileSync(join(homedir(), '.codex', 'config.toml'), 'utf8')
    const cfg = {}
    let section = ''
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const sec = line.match(/^\[([^\]]+)\]$/)
      if (sec) {
        section = sec[1]
        continue
      }
      const kv = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/)
      if (!kv) continue
      let value = kv[2].trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      const key = section === 'model_providers.custom' ? `provider.${kv[1]}` : kv[1]
      cfg[key] = value
    }
    return resolveProvider(
      firstNonEmpty(env.baseUrl, cfg['provider.base_url']),
      firstNonEmpty(
        env.token,
        cfg['provider.experimental_bearer_token'],
        cfg['provider.api_key'],
      ),
      firstNonEmpty(env.model, cfg.model),
      authToken,
    )
  } catch {
    return resolveProvider(
      firstNonEmpty(env.baseUrl, DIRECT_FALLBACK_BASE_URL),
      firstNonEmpty(env.token, authToken),
      firstNonEmpty(env.model, DIRECT_FALLBACK_MODEL),
      authToken,
    )
  }
}

const provider = loadProvider()

function refreshProvider() {
  Object.assign(provider, loadProvider())
}

function providerReady() {
  return Boolean(provider.baseUrl && provider.token && provider.model)
}

function cleanModelOutput(value) {
  return String(value ?? '')
    .replace(/^\s*```(?:markdown|md|text)?\s*/iu, '')
    .replace(/\s*```\s*$/u, '')
    .trim()
}

function runCodex(prompt, outputSchema = null) {
  return new Promise((resolve, reject) => {
    const outputFile = join(tmpdir(), `allknow-ai-${randomUUID()}.md`)
    const schemaFile = outputSchema
      ? join(tmpdir(), `allknow-schema-${randomUUID()}.json`)
      : ''
    if (schemaFile) writeFileSync(schemaFile, JSON.stringify(outputSchema))
    const args = [
      'exec',
      '--ephemeral',
      '--skip-git-repo-check',
      '--sandbox',
      'read-only',
      '--color',
      'never',
      '-c',
      'model_reasoning_effort="low"',
      '-o',
      outputFile,
    ]
    if (schemaFile) args.push('--output-schema', schemaFile)
    const child = spawn(
      CODEX_BIN,
      args,
      {
        cwd: tmpdir(),
        stdio: ['pipe', 'ignore', 'pipe'],
      },
    )

    let stderr = ''
    let settled = false
    const finish = async (code, error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        if (error) {
          reject(error)
          return
        }
        if (code !== 0) {
          reject(new Error(`Codex exited with ${code}: ${stderr.slice(-500)}`))
          return
        }
        const content = cleanModelOutput(await readFile(outputFile, 'utf8'))
        if (!content) {
          reject(new Error('AI 未返回内容'))
          return
        }
        resolve(content)
      } catch (readError) {
        reject(readError)
      } finally {
        await Promise.all([
          rm(outputFile, { force: true }).catch(() => {}),
          schemaFile ? rm(schemaFile, { force: true }).catch(() => {}) : Promise.resolve(),
        ])
      }
    }

    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      finish(null, new Error('AI 处理超时，请稍后重试'))
    }, LOCAL_SERVICE_TIMEOUT)

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.stdin.on('error', (error) => finish(null, error))
    child.on('error', (error) => finish(null, error))
    child.on('close', (code) => finish(code, null))
    child.stdin.write(prompt)
    child.stdin.end()
  })
}

async function requestChatCompletions({
  system,
  user,
  maxTokens,
  temperature,
  responseFormat = null,
}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LOCAL_SERVICE_TIMEOUT)
  try {
    const endpoint = `${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.token}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: provider.model,
        temperature,
        max_tokens: maxTokens,
        ...(responseFormat ? { response_format: responseFormat } : {}),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data?.error?.message || `AI 请求失败：HTTP ${response.status}`)
    }
    return {
      content: data?.choices?.[0]?.message?.content?.trim() ?? '',
      reasoning: data?.choices?.[0]?.message?.reasoning_content ?? '',
      finishReason: data?.choices?.[0]?.finish_reason ?? '',
    }
  } finally {
    clearTimeout(timer)
  }
}

async function chatCompletions({
  system,
  user,
  maxTokens = 5000,
  temperature = 0.3,
  responseFormat = null,
}) {
  if (!providerReady()) {
    throw new Error('未检测到本机 AI 配置（~/.codex/config.toml）')
  }
  const budgets = [...new Set([
    maxTokens,
    Math.max(maxTokens * 2, 16000),
    32000,
  ])].sort((a, b) => a - b)
  let lastError = null
  for (const budget of budgets) {
    try {
      const result = await requestChatCompletions({
        system,
        user,
        maxTokens: budget,
        temperature,
        responseFormat,
      })
      if (result.content) return result.content
      lastError = new Error('AI 未返回内容')
      console.error('EMPTY_RESPONSE', {
        model: provider.model,
        maxTokens: budget,
        finishReason: result.finishReason,
        reasoningLength: String(result.reasoning).length,
      })
    } catch (error) {
      lastError = error
      console.error('CHAT_COMPLETIONS_FAILED', {
        model: provider.model,
        maxTokens: budget,
        error: String(error?.message ?? error),
      })
    }
  }
  throw lastError ?? new Error('AI 未返回内容')
}

const EXTRACT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', description: '原文档标题' },
    steps: {
      type: 'array',
      description: '严格按原文档从上到下顺序排列的操作步骤',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          number: { type: 'string', description: '原步骤编号，没有编号时留空' },
          name: { type: 'string', description: '简短步骤名称' },
          action: { type: 'string', description: '从原文提取的完整操作内容' },
          remark: {
            type: 'string',
            description: '对应备注、注意、风险或参照信息，没有时留空',
          },
        },
        required: ['number', 'name', 'action', 'remark'],
      },
    },
  },
  required: ['title', 'steps'],
}

const EXTRACT_SYSTEM =
  '你是企业知识库结构化整理助手。请从附件中逐条提取重点操作步骤和对应备注，并只输出符合给定 JSON Schema 的 JSON。\n\n规则：\n1. steps 数组必须严格按原文档从上到下、从左到右的阅读顺序排列，禁止按重要性、层级或内容相似度重排，禁止调换步骤顺序。\n2. 每个步骤分别填写 number、name、action、remark：number 保留原编号；name 是最短且明确的步骤名称；action 是该步骤完整、可执行的操作内容；remark 只放对应的备注、注意、风险、禁止或参照信息。没有内容的字段填空字符串。\n3. 细化提取：一个步骤中有多个关键操作时，按原文顺序完整写入 action，不要概括丢失；同一行或同一单元格中的备注必须归入对应步骤，不要单独形成备注列表。\n4. 表格中的“操作步骤/步骤名称/动作”是步骤名，“操作内容/实施内容/说明”是操作内容，“备注/注意事项/风险”是对应备注。\n5. 删除页眉页脚、水印、页码、文件编号、版本、编制人、审核人、联系方式、模板说明、完成标准、执行情况、是/否、图片信息等噪声；不要把执行状态误当成备注。\n6. 不编造原文没有的内容；不要输出 Markdown、解释、开场白、结束语或代码围栏。'

function splitExtractRemark(value) {
  const text = String(value ?? '').trim()
  if (!text) return { action: '', remark: '' }
  const match = text.match(/(?:^|[；;。]\s*)(备注|注|注意|风险提示|说明)[：:]\s*(.+)$/u)
  if (!match || match.index === undefined) return { action: text, remark: '' }
  return {
    action: text.slice(0, match.index).trim(),
    remark: text
      .slice(match.index)
      .replace(/^[；;。]\s*/u, '')
      .replace(/^(备注|注|注意|风险提示|说明)[：:]\s*/u, '')
      .trim(),
  }
}

function collectSourceStepOrder(content) {
  const order = new Map()
  const lines = String(content ?? '').split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const cells = line.includes('\t')
      ? line.split('\t').map((cell) => cell.trim()).filter(Boolean)
      : []
    let token = cells[0] ?? ''
    if (!/^\d+(?:\.\d+)*$/u.test(token)) {
      const match = line.match(/^\s*\|?\s*(\d+(?:\.\d+)*)\s*(?:\t|\||[.、．]|\s)/u)
      token = match?.[1] ?? ''
    }
    token = token.replace(/[.、．]+$/u, '')
    if (token && !order.has(token)) order.set(token, index)
  }
  return order
}

function normalizeExtractStep(step, index) {
  const rawAction = String(step?.action ?? '').trim()
  const split = splitExtractRemark(rawAction)
  const action = split.action
  let remark = String(step?.remark ?? '').trim()
  remark = remark.replace(/^(备注|注|注意|风险提示|说明)[：:]\s*/u, '').trim()
  if (!remark && split.remark) remark = split.remark
  const number = String(step?.number ?? '').trim().replace(/[.、．]+$/u, '')
  const rawName = String(step?.name ?? '').trim()
  const name = rawName
    .replace(/^\d+(?:\.\d+)*[.、．]?\s*/u, '')
    .replace(/^\*+|\*+$/gu, '')
    .trim()
  const compactName = name.replace(/[\s。；;、，,.]/gu, '')
  const compactAction = action.replace(/[\s。；;、，,.]/gu, '')
  const normalizedAction = compactAction && compactAction !== compactName ? action : ''
  return {
    number,
    name: name || action || `步骤${index + 1}`,
    action: normalizedAction,
    remark,
  }
}

function orderExtractSteps(steps, content) {
  const sourceOrder = collectSourceStepOrder(content)
  const occurrences = new Map()
  const entries = steps
    .map((step, index) => {
      const occurrence = occurrences.get(step.number) ?? 0
      occurrences.set(step.number, occurrence + 1)
      return {
        step,
        index,
        occurrence,
        sourceIndex: sourceOrder.get(step.number) ?? Number.MAX_SAFE_INTEGER,
        numericKey: /^\d+(?:\.\d+)*$/u.test(step.number)
          ? step.number.split('.').map(Number)
          : null,
      }
    })
  const allNumbered = entries.every((entry) => entry.numericKey !== null)
  entries.sort((a, b) => {
    if (allNumbered && a.numericKey && b.numericKey) {
      const length = Math.max(a.numericKey.length, b.numericKey.length)
      for (let index = 0; index < length; index += 1) {
        const aPart = a.numericKey[index] ?? -1
        const bPart = b.numericKey[index] ?? -1
        if (aPart !== bPart) return aPart - bPart
      }
    }
    return a.sourceIndex - b.sourceIndex || a.occurrence - b.occurrence || a.index - b.index
  })
  return entries.map(({ step }) => step)
}

function ensureSentence(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  return /[。！？.!?；;]$/u.test(text) ? text : `${text}。`
}

function formatExtractStep(step, index) {
  const number = step.number || String(index + 1)
  const prefix = number.includes('.') ? number : `${number}.`
  let line = `${prefix} **${step.name}**`
  if (step.action) line += `：${ensureSentence(step.action)}`
  if (step.remark) line += `${step.action ? ' ' : '。'}备注：${ensureSentence(step.remark)}`
  return line
}

function parseExtractPayload(value) {
  const text = cleanModelOutput(value)
  const candidates = [text]
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1))
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.steps)) return parsed
    } catch {
      // Keep trying the next possible JSON substring.
    }
  }
  return null
}

function formatExtractPayload(payload, content, fallbackTitle = '') {
  if (!payload || !Array.isArray(payload.steps)) return ''
  const steps = payload.steps
    .map(normalizeExtractStep)
    .filter((step) => step.name || step.action || step.remark)
  if (steps.length === 0) return ''
  const ordered = orderExtractSteps(steps, content)
  const parsedTitle =
    String(payload.title ?? '')
      .replace(/^[\s*#]+|[\s*#]+$/gu, '')
      .trim()
  const title =
    parsedTitle && !/^(?:文档|附件|未知文档)$/u.test(parsedTitle)
      ? parsedTitle
      : fallbackTitle.replace(/\.[^.]+$/u, '').trim() || parsedTitle || '文档'
  return [
    `**${title}**`,
    '',
    '### 操作步骤',
    '',
    ...ordered.map(formatExtractStep),
  ].join('\n')
}

const ASK_SYSTEM =
  '你是「全知库」内部知识库的 AI 智能助手。请只依据提供的知识资料回答用户问题，不要编造资料里没有的内容；如果资料不足以回答，请明确说明缺少哪些信息。使用简洁清晰的中文 Markdown 回答，适当使用列表；当回答内容来自某份资料时，在句尾用【资料标题】标注引用。'

async function handleExtract(req, res) {
  const body = JSON.parse(await readBody(req, 2 * 1024 * 1024))
  const fileName = String(body.fileName ?? '附件')
  const content = String(body.content ?? '').slice(0, 20000)
  if (!content.trim()) {
    sendJson(res, 400, { error: 'empty content' })
    return
  }
  const user = `附件名称：${fileName}\n\n附件内容：\n${content}`
  let result = ''
  let source = provider.useCodex ? 'codex' : 'deepseek-direct'
  if (provider.useCodex) {
    try {
      result = await runCodex(`${EXTRACT_SYSTEM}\n\n${user}`, EXTRACT_SCHEMA)
    } catch (error) {
      console.error('CODEX_EXTRACT_FALLBACK', String(error?.message ?? error))
      refreshProvider()
      result = ''
    }
  }
  if (!result) {
    refreshProvider()
    result = await chatCompletions({
      system: EXTRACT_SYSTEM,
      user,
      maxTokens: 6000,
      temperature: 0,
      responseFormat: { type: 'json_object' },
    })
    source = provider.source === 'deepseek-direct' ? 'deepseek-direct' : 'ai'
  }
  const payload = parseExtractPayload(result)
  const text = payload
    ? formatExtractPayload(payload, content, fileName)
    : cleanModelOutput(result)
  sendJson(res, 200, { text, source })
}

async function handleAsk(req, res) {
  refreshProvider()
  const body = JSON.parse(await readBody(req, 2 * 1024 * 1024))
  const question = String(body.question ?? '').trim().slice(0, 4000)
  const context = String(body.context ?? '').trim().slice(0, 24000)
  if (!question) {
    sendJson(res, 400, { error: 'empty question' })
    return
  }
  const user = context
    ? `## 用户问题\n${question}\n\n## 知识库参考资料\n${context}`
    : `## 用户问题\n${question}\n\n（未提供参考资料，请基于通用知识回答并提示用户补充资料。）`
  const result = await chatCompletions({
    system: ASK_SYSTEM,
    user,
    maxTokens: 12000,
    temperature: 0.35,
  })
  sendJson(res, 200, { text: result })
}

async function handleTranscribe(req, res) {
  const body = JSON.parse(await readBody(req, 70 * 1024 * 1024))
  const audio = String(body.audio ?? '')
  const filename = String(body.filename ?? '音频文件')
  const mime = String(body.mime ?? 'application/octet-stream')
  const endpoint = String(body.endpoint ?? 'https://api.openai.com/v1/audio/transcriptions')
  const apiKey = String(body.apiKey ?? '')
  const model = String(body.model ?? 'whisper-1')
  if (!audio) {
    sendJson(res, 400, { error: 'empty audio' })
    return
  }
  if (!apiKey) {
    sendJson(res, 401, { error: 'missing API key' })
    return
  }
  const buffer = Buffer.from(audio, 'base64')
  const form = new FormData()
  form.append('file', new Blob([buffer], { type: mime }), filename)
  form.append('model', model)
  const upstream = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })
  const data = await upstream.json().catch(() => ({}))
  if (!upstream.ok) {
    sendJson(res, upstream.status, {
      error: data.error?.message || data.error || 'transcription failed',
    })
    return
  }
  sendJson(res, 200, { text: data.text ?? '' })
}

async function handleVision(req, res) {
  const body = JSON.parse(await readBody(req, 30 * 1024 * 1024))
  const image = String(body.image ?? '')
  const endpoint = String(body.endpoint ?? 'https://api.openai.com/v1/chat/completions')
  const apiKey = String(body.apiKey ?? '')
  const model = String(body.model ?? 'gpt-4o-mini')
  if (!image) {
    sendJson(res, 400, { error: 'empty image' })
    return
  }
  if (!apiKey) {
    sendJson(res, 401, { error: 'missing API key' })
    return
  }
  const prompt =
    '请识别这张图片中的全部文字内容。逐字转录图片中的文字，保留原有编号、标题与段落结构；如果图片中没有文字，请只输出“（图片中无可识别文字）”。'
  const upstream = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: image } },
          ],
        },
      ],
    }),
  })
  const data = await upstream.json().catch(() => ({}))
  if (!upstream.ok) {
    sendJson(res, upstream.status, {
      error: data.error?.message || data.error || 'vision failed',
    })
    return
  }
  sendJson(res, 200, {
    text: data.choices?.[0]?.message?.content?.trim() ?? '',
  })
}

const server = createServer(async (req, res) => {
  setCors(res)
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  if (req.method === 'GET' && req.url === '/ping') {
    refreshProvider()
    sendJson(res, 200, {
      ok: providerReady(),
      model: provider.model || null,
      endpoint: provider.baseUrl || null,
      capabilities: providerReady() ? ['extract', 'ask'] : [],
    })
    return
  }
  if (req.method !== 'POST') {
    sendJson(res, 404, { error: 'not found' })
    return
  }
  try {
    if (req.url === '/extract') {
      await handleExtract(req, res)
      return
    }
    if (req.url === '/ask') {
      await handleAsk(req, res)
      return
    }
    if (req.url === '/transcribe') {
      await handleTranscribe(req, res)
      return
    }
    if (req.url === '/vision') {
      await handleVision(req, res)
      return
    }
    sendJson(res, 404, { error: 'not found' })
  } catch (error) {
    console.error(error)
    sendJson(res, 500, { error: String(error?.message ?? error) })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(
    `AllKnow AI service listening on http://127.0.0.1:${PORT} (provider: ${provider.model || '未配置'})`,
  )
})
