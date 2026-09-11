import {
  Bot,
  CornerDownLeft,
  Eraser,
  Send,
  Sparkles,
  User,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Note } from '../types'
import { sortByUpdated } from '../lib/notes'
import { renderMarkdown } from '../lib/markdown'
import { loadAiSettings } from '../lib/aiExtract'

const LOCAL_SERVICE = 'http://127.0.0.1:5188'

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  sources?: Note[]
}

const WELCOME: ChatMessage = {
  role: 'assistant',
  text: '你好，我是**全知库 AI 助手**。你可以直接问我知识库里的流程、规范或资料，例如“设备上架有哪些步骤”“机房巡检要注意什么”。我会先检索内部资料再回答。',
}

const SUGGESTIONS = [
  '设备上架有哪些步骤？',
  '机房巡检要注意哪些事项？',
  '帮我总结当前知识库的内容',
  '交付验收包含哪些工作？',
]

function queryTerms(question: string): string[] {
  const terms = new Set<string>()
  for (const block of question.match(/[\u4e00-\u9fff]+/g) ?? []) {
    for (let index = 0; index < block.length - 1; index += 1) {
      terms.add(block.slice(index, index + 2))
    }
  }
  for (const word of question.match(/[A-Za-z0-9]+/g) ?? []) {
    if (word.length >= 2) terms.add(word.toLowerCase())
  }
  return [...terms]
}

function retrieveContext(question: string, notes: Note[]): Note[] {
  const terms = queryTerms(question)
  const ranked: Array<{ note: Note; score: number }> = []
  for (const note of notes) {
    const title = note.title.toLocaleLowerCase()
    const body = note.body.toLocaleLowerCase()
    const tags = note.tags.join(' ').toLocaleLowerCase()
    const haystack = `${title} ${tags} ${body}`
    let score = 0
    for (const term of terms) {
      let count = 0
      let from = 0
      while (true) {
        const hit = haystack.indexOf(term, from)
        if (hit < 0) break
        count += 1
        from = hit + term.length
      }
      if (count === 0) continue
      score += title.includes(term) ? count * 6 : count
      if (tags.includes(term)) score += 3
    }
    if (score > 0) ranked.push({ note, score })
  }
  ranked.sort((a, b) => b.score - a.score)
  if (ranked.length > 0) {
    return ranked.slice(0, 5).map((item) => item.note)
  }
  return sortByUpdated(notes).slice(0, 3)
}

function buildContext(sources: Note[]): string {
  return sources
    .map(
      (note) =>
        `【${note.title}】\n${note.description ? `${note.description}\n` : ''}${note.body
          .replace(/^\s*#\s+[^\n]+\n+/u, '')
          .slice(0, 2200)}`,
    )
    .join('\n\n')
    .slice(0, 18000)
}

async function askLocal(question: string, context: string): Promise<string> {
  try {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 150000)
    const response = await fetch(`${LOCAL_SERVICE}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, context }),
      signal: controller.signal,
    })
    window.clearTimeout(timer)
    if (!response.ok) return ''
    const data = (await response.json()) as { text?: string }
    return data.text?.trim() ?? ''
  } catch {
    return ''
  }
}

async function askCloud(question: string, context: string): Promise<string> {
  const settings = loadAiSettings()
  const apiKey = (settings.apiKey || '').trim()
  if (!settings.enabled || !apiKey) return ''
  try {
    const endpoint = (settings.endpoint || 'https://api.openai.com/v1/chat/completions').trim()
    const model = (settings.model || 'gpt-4o-mini').trim()
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        messages: [
          {
            role: 'system',
            content:
              '你是「全知库」内部知识库的 AI 智能助手。请只依据提供的知识资料回答用户问题，不要编造；资料不足时明确说明。使用简洁中文 Markdown，引用资料时用【资料标题】标注。',
          },
          {
            role: 'user',
            content: `## 用户问题\n${question}\n\n## 知识库参考资料\n${context || '（未提供参考资料）'}`,
          },
        ],
      }),
    })
    if (!response.ok) return ''
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    return data.choices?.[0]?.message?.content?.trim() ?? ''
  } catch {
    return ''
  }
}

export function AiAssistant({
  notes,
  onOpen,
  embedded = false,
}: {
  notes: Note[]
  onOpen: (id: string) => void
  embedded?: boolean
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const sortedNotes = useMemo(() => sortByUpdated(notes), [notes])

  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  const ask = async (questionRaw: string) => {
    const question = questionRaw.trim()
    if (!question || busy) return
    setInput('')
    setMessages((current) => [...current, { role: 'user', text: question }])
    setBusy(true)
    const sources = retrieveContext(question, sortedNotes)
    const context = buildContext(sources)
    try {
      let answer = await askLocal(question, context)
      if (!answer) answer = await askCloud(question, context)
      if (!answer) {
        answer =
          'AI 暂时没有返回结果。请确认本机 AI 服务已启动，或在「数据与设置 → AI 智能读取」中配置备用云端接口后重试。'
      }
      setMessages((current) => [
        ...current,
        { role: 'assistant', text: answer, sources },
      ])
    } finally {
      setBusy(false)
    }
  }

  const clearChat = () => {
    setMessages([WELCOME])
    setInput('')
  }

  const renderAnswer = (text: string) =>
    renderMarkdown(text, () => undefined)

  const clearButton = (
    <button
      type="button"
      className="btn"
      onClick={clearChat}
      disabled={busy}
      title="清空对话"
    >
      <Eraser size={16} />
      清空对话
    </button>
  )

  return (
    <div className={embedded ? 'home-ai-panel' : 'page ai-page'}>
      {embedded ? (
        <header className="home-ai-panel-head">
          <div className="home-ai-panel-title">
            <span className="home-ai-panel-icon">
              <Bot size={18} />
            </span>
            <div>
              <p>AI 智能助手</p>
              <h2>问知识库</h2>
              <small>基于内部知识自动检索与回答，支持追问流程、规范与运维经验。</small>
            </div>
          </div>
          {clearButton}
        </header>
      ) : (
        <header className="page-heading ai-heading">
          <div>
            <p className="eyebrow">AI 智能助手</p>
            <h1>问知识库</h1>
            <p className="heading-sub">
              基于内部知识自动检索与回答，支持追问流程、规范与运维经验。
            </p>
          </div>
          {clearButton}
        </header>
      )}

      <section className={`ai-chat ${embedded ? 'ai-chat-embedded' : ''}`}>
        <div ref={bodyRef} className="ai-chat-body" aria-live="polite">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`ai-msg ai-msg-${message.role}`}
            >
              <span className="ai-msg-avatar">
                {message.role === 'assistant' ? (
                  <Bot size={17} />
                ) : (
                  <User size={16} />
                )}
              </span>
              <div className="ai-msg-content">
                {message.role === 'assistant' ? (
                  <div
                    className="ai-msg-markdown"
                    dangerouslySetInnerHTML={{ __html: renderAnswer(message.text) }}
                  />
                ) : (
                  <p>{message.text}</p>
                )}
                {message.sources && message.sources.length > 0 && (
                  <div className="ai-sources">
                    <span>参考来源</span>
                    {message.sources.map((note) => (
                      <button
                        key={note.id}
                        type="button"
                        onClick={() => onOpen(note.id)}
                        title={`打开「${note.title}」`}
                      >
                        {note.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="ai-msg ai-msg-assistant">
              <span className="ai-msg-avatar">
                <Bot size={17} />
              </span>
              <div className="ai-msg-content ai-thinking">
                <Sparkles size={15} />
                正在检索知识库并思考…
              </div>
            </div>
          )}
        </div>

        {messages.length <= 1 && (
          <div className="ai-suggestions">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={busy}
                onClick={() => ask(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        <form
          className="ai-input-row"
          onSubmit={(event) => {
            event.preventDefault()
            void ask(input)
          }}
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="输入问题，例如：设备上架有哪些步骤？"
            aria-label="向 AI 提问"
            disabled={busy}
          />
          <button type="submit" className="btn btn-primary" disabled={busy || !input.trim()}>
            <Send size={16} />
            发送
          </button>
        </form>
        <p className="ai-footnote">
          {notes.length > 0
            ? `回答基于当前 ${notes.length} 条知识内容自动检索，点击「参考来源」可打开对应条目。`
            : '当前知识库还没有内容，新建条目后即可向我提问。'}
          <CornerDownLeft size={13} />
        </p>
      </section>
    </div>
  )
}
