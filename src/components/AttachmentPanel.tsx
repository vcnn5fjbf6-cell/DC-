import {
  Download,
  File,
  FileSpreadsheet,
  FileText,
  Film,
  Image,
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
  extractFileText,
  generateStructuredAttachmentContent,
} from '../lib/aiExtract'
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
  '.mp4',
  '.mov',
  '.webm',
  '.mkv',
].join(',')

type FileKind = 'video' | 'image' | 'sheet' | 'doc' | 'file'

function fileExtension(name: string): string {
  return name.includes('.') ? name.split('.').pop()?.toLowerCase() ?? '' : ''
}

function fileKind(meta: AttachmentMeta): FileKind {
  const extension = fileExtension(meta.name)
  if (meta.mime.startsWith('video/') || ['mp4', 'mov', 'webm', 'mkv'].includes(extension)) {
    return 'video'
  }
  if (meta.mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extension)) {
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
  const [uploading, setUploading] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [loading, setLoading] = useState(true)

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
      return
    }
    let objectUrl: string | null = null
    let cancelled = false
    getAttachmentBlob(selectedId)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setPreviewUrl(objectUrl)
      })
      .catch(() => setSelectedId(null))
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [selectedId])

  const selected = metas.find((meta) => meta.id === selectedId) ?? null
  const canPreview =
    selected &&
    (selected.mime.startsWith('video/') ||
      selected.mime.startsWith('image/') ||
      selected.mime.includes('pdf'))

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
      for (let index = 0; index < files.length; index += 1) {
        const content = await extractFileText(files[index])
        if (!content.trim()) continue
        const result = await generateStructuredAttachmentContent(
          files[index].name,
          content,
        )
        if (result.text) generated.push(result.text)
      }
      if (generated.length > 0) {
        onContentGenerated?.(generated.join('\n\n'))
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
          title="上传文档、表格、图片或视频"
        >
          <Upload size={14} />
          {extracting ? '智能读取中' : uploading ? '上传中' : '上传'}
        </button>
      </div>
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
          {selected.mime.startsWith('video/') && (
            <video controls preload="metadata" src={previewUrl} />
          )}
          {selected.mime.startsWith('image/') && (
            <img src={previewUrl} alt={selected.name} />
          )}
          {selected.mime.includes('pdf') && (
            <iframe src={previewUrl} title={selected.name} />
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
            const kind = fileKind(meta)
            const previewable = kind === 'video' || kind === 'image' || meta.mime.includes('pdf')
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
