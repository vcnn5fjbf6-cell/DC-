import {
  CloudOff,
  Database,
  Download,
  FilePlus2,
  FileJson,
  HardDrive,
  RotateCcw,
  ShieldCheck,
  Upload,
} from 'lucide-react'
import { useRef } from 'react'
import type { Note } from '../types'
import { domains } from '../data/domains'
import { AiSettingsPanel } from './AiSettingsPanel'

export function SettingsPage({
  notes,
  onExport,
  onImport,
  onReset,
  onCreate,
}: {
  notes: Note[]
  onExport: () => void
  onImport: (notes: Note[]) => void
  onReset: () => void
  onCreate: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const bytes = useRef(new TextEncoder().encode(JSON.stringify(notes)).length)
  const size = bytes.current > 1024 * 1024
    ? `${(bytes.current / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes.current / 1024))} KB`

  const handleImport = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        if (!Array.isArray(parsed)) throw new Error('invalid shape')
        onImport(parsed as Note[])
      } catch {
        window.alert('文件格式不正确，请选择由全知库导出的 JSON。')
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="page settings-page">
      <header className="page-heading">
        <div>
          <h1>数据与设置</h1>
          <p className="heading-sub">
            知识全部保存在本地，可随时导出为可迁移的 JSON
          </p>
        </div>
        <button className="btn btn-primary" onClick={onCreate}>
          <FilePlus2 size={17} />
          新建条目
        </button>
      </header>

      <section className="settings-grid">
        <div className="settings-summary">
          <span className="settings-icon teal">
            <HardDrive size={20} />
          </span>
          <div>
            <strong>{notes.length}</strong>
            <p>知识条目</p>
          </div>
          <span className="settings-icon amber">
            <Database size={20} />
          </span>
          <div>
            <strong>{size}</strong>
            <p>本地数据</p>
          </div>
        </div>

        <AiSettingsPanel />

        <section className="settings-block">
          <h2>
            <FileJson size={18} />
            数据迁移
          </h2>
          <p>导出会生成包含全部条目的 JSON 文件；导入将替换当前本地数据。</p>
          <div className="settings-actions">
            <button className="btn" onClick={onExport}>
              <Download size={16} />
              导出 JSON
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              <Upload size={16} />
              导入 JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) handleImport(file)
                event.target.value = ''
              }}
            />
          </div>
        </section>

        <section className="settings-block">
          <h2>
            <RotateCcw size={18} />
            恢复演示数据
          </h2>
          <p>清空当前内容并恢复内置的跨领域示例知识库。</p>
          <button
            className="btn btn-danger-ghost"
            onClick={() => {
              if (window.confirm('确定用演示数据替换当前知识库吗？')) onReset()
            }}
          >
            重置为演示数据
          </button>
        </section>

        <section className="settings-block">
          <h2>
            <ShieldCheck size={18} />
            存储方式
          </h2>
          <div className="storage-note">
            <CloudOff size={19} />
            <div>
              <strong>本地优先</strong>
              <p>
                当前版本数据存放在浏览器 localStorage，不依赖账号或外部服务。后续接入服务端后可无缝启用同步与多设备协作。
              </p>
            </div>
          </div>
        </section>

        <section className="settings-block domain-list-block">
          <h2>
            <Database size={18} />
            领域索引
          </h2>
          <div className="domain-index-list">
            {domains.map((domain) => {
              const count = notes.filter((note) => note.domain === domain.id).length
              return (
                <span key={domain.id}>
                  <i style={{ background: domain.color }} />
                  {domain.name}
                  <b>{count}</b>
                </span>
              )
            })}
          </div>
        </section>
      </section>
    </div>
  )
}
