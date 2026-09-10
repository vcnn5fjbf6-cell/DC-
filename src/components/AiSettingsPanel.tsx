import {
  Bot,
  CheckCircle2,
  KeyRound,
  Mic,
  RefreshCw,
  Save,
  Settings2,
  WandSparkles,
  XCircle,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  loadAiSettings,
  saveAiSettings,
  type AiSettings,
} from '../lib/aiExtract'

const LOCAL_SERVICE = 'http://127.0.0.1:5188'

export function AiSettingsPanel() {
  const [settings, setSettings] = useState<AiSettings>(loadAiSettings)
  const [saved, setSaved] = useState(false)
  const [localState, setLocalState] = useState<'checking' | 'ok' | 'down'>(
    'checking',
  )
  const [localModel, setLocalModel] = useState('')

  const checkLocalService = async () => {
    setLocalState('checking')
    try {
      const response = await fetch(`${LOCAL_SERVICE}/ping`)
      const data = (await response.json()) as { ok?: boolean; model?: string }
      setLocalState(data.ok ? 'ok' : 'down')
      setLocalModel(data.model ?? '')
    } catch {
      setLocalState('down')
    }
  }

  useEffect(() => {
    void checkLocalService()
  }, [])

  const save = () => {
    saveAiSettings(settings)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1600)
  }

  return (
    <section className="settings-block ai-settings-block">
      <div className="ai-settings-title">
        <span className="ai-title-icon">
          <Bot size={19} />
        </span>
        <div>
          <h2>AI 智能读取</h2>
          <p>本机 AI 自动整理文档、附件识别与知识问答，无需额外 API Key。</p>
        </div>
        <WandSparkles className="ai-title-spark" size={20} />
      </div>

      <div
        className={`ai-local-status is-${localState}`}
        title={
          localState === 'ok'
            ? `本机 AI 服务已连接（${localModel}）`
            : '本机 AI 服务未启动，请运行 scripts/ai-service.mjs'
        }
      >
        {localState === 'ok' ? (
          <CheckCircle2 size={15} />
        ) : (
          <XCircle size={15} />
        )}
        <span>
          {localState === 'checking'
            ? '正在检测本机 AI 服务…'
            : localState === 'ok'
              ? `本机 AI 已连接 · ${localModel}`
              : '本机 AI 服务未启动'}
        </span>
      </div>

      <div className="ai-auto-card">
        <div className="ai-auto-card-head">
          <span className="ai-auto-card-icon">
            <WandSparkles size={16} />
          </span>
          <div>
            <strong>本机 AI 已自动接入</strong>
            <small>
              自动读取 Codex 的模型、接口与鉴权配置，文本类文档无需填写 API Key。
            </small>
          </div>
          <button
            type="button"
            className="ai-recheck-btn"
            onClick={() => void checkLocalService()}
            disabled={localState === 'checking'}
          >
            <RefreshCw
              size={13}
              className={localState === 'checking' ? 'is-spinning' : ''}
            />
            重新检测
          </button>
        </div>
        <div className="ai-capability-list">
          <span><CheckCircle2 size={13} /> 文档 / 表格提取</span>
          <span><CheckCircle2 size={13} /> 重点步骤与补充内容</span>
          <span><CheckCircle2 size={13} /> 长文润色整理</span>
          <span><CheckCircle2 size={13} /> 知识库问答</span>
        </div>
      </div>

      <div className="ai-cloud-note">
        <strong>备用云端 AI（可选）</strong>
        <span>仅本机 AI 不可用，或需要图片识别时才需要配置。</span>
      </div>

      <div className="ai-enable-row">
        <label>
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                enabled: event.target.checked,
              }))
            }
          />
          <span>启用云端备用 AI</span>
        </label>
      </div>

      <div className="ai-fields">
        <label>
          <span>
            <Settings2 size={14} />
            API 接口
          </span>
          <input
            value={settings.endpoint}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                endpoint: event.target.value,
              }))
            }
            placeholder="https://api.openai.com/v1/chat/completions"
          />
        </label>
        <label>
          <span>
            <KeyRound size={14} />
            API Key
          </span>
          <input
            type="password"
            value={settings.apiKey}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                apiKey: event.target.value,
              }))
            }
            placeholder="sk-..."
          />
        </label>
        <label>
          <span>
            <Bot size={14} />
            模型
          </span>
          <input
            value={settings.model}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                model: event.target.value,
              }))
            }
            placeholder="gpt-4o-mini"
          />
        </label>
      </div>

      <div className="ai-enable-row ai-enable-row-mt">
        <label>
          <input
            type="checkbox"
            checked={settings.asrEnabled}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                asrEnabled: event.target.checked,
              }))
            }
          />
          <span>启用语音转写（音频与视频识别）</span>
        </label>
      </div>
      <p className="ai-config-hint">
        音频、视频和图片识别需要支持语音或视觉能力的云端接口；TXT、Markdown、Word、Excel 和 PDF 文档可直接使用本机 AI。
      </p>

      <div className="ai-fields">
        <label>
          <span>
            <Mic size={14} />
            转写接口
          </span>
          <input
            value={settings.asrEndpoint}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                asrEndpoint: event.target.value,
              }))
            }
            placeholder="https://api.openai.com/v1/audio/transcriptions"
          />
        </label>
        <label>
          <span>
            <KeyRound size={14} />
            转写 Key
          </span>
          <input
            type="password"
            value={settings.asrApiKey}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                asrApiKey: event.target.value,
              }))
            }
            placeholder="留空则复用上方 API Key"
          />
        </label>
        <label>
          <span>
            <Mic size={14} />
            转写模型
          </span>
          <input
            value={settings.asrModel}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                asrModel: event.target.value,
              }))
            }
            placeholder="whisper-1"
          />
        </label>
      </div>

      <button type="button" className="btn btn-primary" onClick={save}>
        <Save size={16} />
        {saved ? '已保存' : '保存 AI 设置'}
      </button>
    </section>
  )
}
