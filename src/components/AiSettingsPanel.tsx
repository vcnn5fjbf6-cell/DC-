import { Bot, KeyRound, Save, Settings2, WandSparkles } from 'lucide-react'
import { useState } from 'react'
import {
  loadAiSettings,
  saveAiSettings,
  type AiSettings,
} from '../lib/aiExtract'

export function AiSettingsPanel() {
  const [settings, setSettings] = useState<AiSettings>(loadAiSettings)
  const [saved, setSaved] = useState(false)

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
          <p>已启用本机 Codex 真实模型，无需 API Key 即可自动生成内容。</p>
        </div>
        <WandSparkles className="ai-title-spark" size={20} />
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
          <span>启用备用云端 AI</span>
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

      <button type="button" className="btn btn-primary" onClick={save}>
        <Save size={16} />
        {saved ? '已保存' : '保存 AI 设置'}
      </button>
    </section>
  )
}
