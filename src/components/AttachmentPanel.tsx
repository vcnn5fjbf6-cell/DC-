import DOMPurify from 'dompurify'
import {
  Download,
  File,
  FileSpreadsheet,
  FileText,
  Film,
  Image,
  Music,
  Paperclip,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { AttachmentMeta } from '../types'
import {
  deleteAttachmentFile,
  getAttachmentBlob,
  listAttachmentMetas,
  saveAttachmentFile,
} from '../lib/fileStore'
import {
  generateAttachmentContent,
  mediaKind,
  prepareMediaAudio,
} from '../lib/mediaAi'
import { relativeTime, uid } from '../lib/notes'

const MAX_FILE_SIZE = 512 * 1024 * 1024
const ACCEPT = [
  '.pdf',
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
  '.csv',
  '.txt',
  '.md',
  '.wps',
  '.et',
  '.dps',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.mp3',
  '.wav',
  '.m4a',
  '.aac',
  '.flac',
  '.ogg',
  '.opus',
  '.mp4',
  '.mov',
  '.webm',
  '.mkv',
].join(',')

type FileKind = 'video' | 'image' | 'audio' | 'sheet' | 'doc' | 'file'
type DocumentPreview =
  | { type: 'html'; html: string }
  | { type: 'text'; text: string }

const PREVIEWABLE_DOCUMENTS = new Set([
  'pdf',
  'docx',
  'xlsx',
  'xls',
  'csv',
  'txt',
  'md',
  'json',
  'et',
])

function fileExtension(name: string): string {
  return name.includes('.') ? name.split('.').pop()?.toLowerCase() ?? '' : ''
}

function fileKind(meta: AttachmentMeta): FileKind {
  const extension = fileExtension(meta.name)
  if (
    meta.mime.startsWith('video/') ||
    ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'].includes(extension)
  ) {
    return 'video'
  }
  if (
    meta.mime.startsWith('audio/') ||
    ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'mpga'].includes(extension)
  ) {
    return 'audio'
  }
  if (
    meta.mime.startsWith('image/') ||
    ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(extension)
  ) {
    return 'image'
  }
  if (
    meta.mime.includes('spreadsheet') ||
    ['xls', 'xlsx', 'csv', 'et'].includes(extension)
  ) {
    return 'sheet'
  }
  if (
    meta.mime.includes('pdf') ||
    meta.mime.includes('document') ||
    meta.mime.includes('text') ||
    meta.mime.includes('markdown') ||
    ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'txt', 'md', 'wps', 'dps'].includes(
      extension,
    )
  ) {
    return 'doc'
  }
  return 'file'
}

function isPreviewable(meta: AttachmentMeta): boolean {
  const kind = fileKind(meta)
  if (kind === 'video' || kind === 'image' || kind === 'audio') return true
  return PREVIEWABLE_DOCUMENTS.has(fileExtension(meta.name))
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function buildDocumentPreview(
  blob: Blob,
  meta: AttachmentMeta,
): Promise<DocumentPreview | null> {
  const extension = fileExtension(meta.name)
  if (extension === 'docx') {
    const mammoth = await import('mammoth')
    const result = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() })
    return { type: 'html', html: DOMPurify.sanitize(result.value) }
  }
  if (['xlsx', 'xls', 'csv', 'et'].includes(extension)) {
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(new Uint8Array(await blob.arrayBuffer()), {
      type: 'array',
    })
    const sections = workbook.SheetNames.map((sheetName) => {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
        header: 1,
        defval: '',
      })
      const tableRows = rows
        .slice(0, 300)
        .map(
          (row) =>
            `<tr>${(Array.isArray(row) ? row.slice(0, 40) : [])
              .map((cell) => `<td>${escapeHtml(String(cell ?? ''))}</td>`)
              .join('')}</tr>`,
        )
        .join('')
      return `<section class="attachment-sheet-preview"><h4>${escapeHtml(
        sheetName,
      )}</h4><div class="attachment-sheet-scroll"><table>${tableRows}</table></div></section>`
    })
    return { type: 'html', html: DOMPurify.sanitize(sections.join('')) }
  }
  if (['txt', 'md', 'json'].includes(extension)) {
    return { type: 'text', text: (await blob.text()).slice(0, 80000) }
  }
  return null
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  if (size < 1024 * 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`
  }
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`
}

export function AttachmentPanel({
  noteId,
  onContentGenerated,
  uploadRef,
}: {
  noteId: string
  onContentGenerated?: (text: string) => void
  uploadRef?: MutableRefObject<{ open: () => void } | null>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [metas, setMetas] = useState<AttachmentMeta[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [documentPreview, setDocumentPreview] = useState<DocumentPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (uploadRef) {
      uploadRef.current = {
        open: () => inputRef.current?.click(),
      }
    }
  })

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setMetas([])
    setSelectedId(null)
    listAttachmentMetas(noteId)
      .then((items) => {
        if (cancelled) return
        setMetas(
          [...items].sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          ),
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [noteId])

  useEffect(() => {
    if (!selectedId) {
      setPreviewUrl(null)
      setDocumentPreview(null)
      setPreviewLoading(false)
      return
    }
    const meta = metas.find((item) => item.id === selectedId)
    if (!meta) {
      setSelectedId(null)
      return
    }
    let objectUrl: string | null = null
    let cancelled = false
    setDocumentPreview(null)
    setPreviewLoading(true)
    getAttachmentBlob(selectedId)
      .then(async (blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setPreviewUrl(objectUrl)
        const preview = await buildDocumentPreview(blob, meta)
        if (!cancelled) setDocumentPreview(preview)
      })
      .catch(() => {
        if (!cancelled) setSelectedId(null)
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [selectedId, metas])

  const selected = metas.find((meta) => meta.id === selectedId) ?? null
  const selectedKind = selected ? fileKind(selected) : null
  const selectedExtension = selected ? fileExtension(selected.name) : ''
  const canPreview = selected ? isPreviewable(selected) : false

  const download = async (meta: AttachmentMeta) => {
    try {
      const blob = await getAttachmentBlob(meta.id)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = meta.name
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      window.alert('文件读取失败，请重新上传。')
    }
  }

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    const files = Array.from(fileList)
    const tooLarge = files.find((file) => file.size > MAX_FILE_SIZE)
    if (tooLarge) {
      window.alert(`${tooLarge.name} 超过 512MB，无法保存。`)
      return
    }
    setUploading(true)
    setExtracting(false)
    setStatus('')
    // 在用户上传手势内同步启动需要实时解码的视频音频捕获。
    const prepared = files.map((file) => prepareMediaAudio(file))
    const created = files.map<AttachmentMeta>((file) => ({
      id: uid('file'),
      noteId,
      name: file.name,
      mime: file.type || 'application/octet-stream',
      size: file.size,
      createdAt: new Date().toISOString(),
    }))
    try {
      for (let index = 0; index < files.length; index += 1) {
        await saveAttachmentFile(created[index], files[index])
      }
      setMetas((current) =>
        [...created, ...current].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      )
      setExtracting(true)
      const generated: string[] = []
      const skipped: string[] = []
      for (let index = 0; index < files.length; index += 1) {
        const text = await generateAttachmentContent(files[index], prepared[index])
        if (text) {
          generated.push(text)
        } else {
          const kind = mediaKind(files[index])
          if (kind === 'video' || kind === 'audio' || kind === 'image') {
            skipped.push(files[index].name)
          }
        }
      }
      if (generated.length > 0) {
        onContentGenerated?.(generated.join('\n\n'))
      }
      if (skipped.length > 0) {
        setStatus(
          generated.length > 0
            ? `已识别 ${generated.length} 个附件；另有 ${skipped.length} 个媒体未识别，请在“数据与设置”中配置 AI。`
            : '媒体文件未能识别，请先在“数据与设置”中启用并配置 AI。',
        )
      } else if (generated.length > 0) {
        setStatus(`已智能识别 ${generated.length} 个附件内容。`)
      }
    } catch {
      window.alert('上传失败，请检查浏览器存储权限后重试。')
    } finally {
      setUploading(false)
      setExtracting(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const removeFile = async (meta: AttachmentMeta) => {
    if (!window.confirm(`确定删除附件“${meta.name}”吗？`)) return
    try {
      await deleteAttachmentFile(meta.id)
      setMetas((current) => current.filter((item) => item.id !== meta.id))
      if (selectedId === meta.id) setSelectedId(null)
    } catch {
      window.alert('删除失败，请重试。')
    }
  }

  const renderKindIcon = (meta: AttachmentMeta) => {
    const kind = fileKind(meta)
    const className = `attachment-kind is-${kind}`
    if (kind === 'video') return <Film size={18} className={className} />
    if (kind === 'image') return <Image size={18} className={className} />
    if (kind === 'audio') return <Music size={18} className={className} />
    if (kind === 'sheet') return <FileSpreadsheet size={18} className={className} />
    if (kind === 'doc') return <FileText size={18} className={className} />
    return <File size={18} className={className} />
  }

  return (
    <section className="meta-block attachment-block">
      <div className="attachment-head">
        <h3>
          <Paperclip size={14} />
          附件
          <span>{metas.length}</span>
        </h3>
        <button
          type="button"
          className="attachment-upload-btn"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || extracting}
          title="上传文档、表格、图片、音频或视频"
        >
          <Upload size={14} />
          {extracting ? '智能读取中' : uploading ? '上传中' : '上传'}
        </button>
      </div>
      {status && <p className="attachment-status">{status}</p>}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        hidden
        onChange={(event) => handleUpload(event.target.files)}
      />

      {selected && canPreview && previewUrl && (
        <div className="attachment-preview">
          {selectedKind === 'video' && (
            <video controls playsInline preload="metadata" src={previewUrl} />
          )}
          {selectedKind === 'image' && (
            <img src={previewUrl} alt={selected.name} />
          )}
          {selectedKind === 'audio' && (
            <audio controls src={previewUrl} />
          )}
          {selectedExtension === 'pdf' && (
            <iframe src={previewUrl} title={selected.name} />
          )}
          {documentPreview?.type === 'html' && (
            <div
              className="attachment-document-preview"
              dangerouslySetInnerHTML={{ __html: documentPreview.html }}
            />
          )}
          {documentPreview?.type === 'text' && (
            <pre className="attachment-document-preview is-text">
              {documentPreview.text}
            </pre>
          )}
          {previewLoading && (
            <div className="attachment-preview-loading">正在生成预览…</div>
          )}
          {!previewLoading &&
            !documentPreview &&
            !['video', 'image', 'audio'].includes(selectedKind ?? '') &&
            selectedExtension !== 'pdf' && (
              <div className="attachment-preview-fallback">
                该文档格式暂不支持内嵌预览，请下载后查看。
              </div>
            )}
          <button
            type="button"
            className="attachment-preview-close"
            onClick={() => setSelectedId(null)}
            title="关闭预览"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {loading ? (
        <p className="attachment-empty">加载中</p>
      ) : metas.length === 0 ? (
        <p className="attachment-empty">暂无附件</p>
      ) : (
        <div className="attachment-list">
          {metas.map((meta) => {
            const previewable = isPreviewable(meta)
            return (
              <div
                key={meta.id}
                className={`attachment-row ${selectedId === meta.id ? 'is-selected' : ''}`}
              >
                <button
                  type="button"
                  className="attachment-open"
                  onClick={() => {
                    if (previewable) setSelectedId(meta.id)
                    else download(meta)
                  }}
                  title={meta.name}
                >
                  {renderKindIcon(meta)}
                  <span>
                    <strong>{meta.name}</strong>
                    <small>
                      {formatSize(meta.size)} · {relativeTime(meta.createdAt)}
                    </small>
                  </span>
                </button>
                <button
                  type="button"
                  className="attachment-icon-btn"
                  onClick={() => download(meta)}
                  title="下载"
                >
                  <Download size={15} />
                </button>
                <button
                  type="button"
                  className="attachment-icon-btn is-danger"
                  onClick={() => removeFile(meta)}
                  title="删除附件"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
