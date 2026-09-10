import {
  extractFileText,
  generateStructuredAttachmentContent,
  loadAiSettings,
} from './aiExtract'

const LOCAL_SERVICE = 'http://127.0.0.1:5188'
const ASR_ENDPOINT_DEFAULT = 'https://api.openai.com/v1/audio/transcriptions'
const VISION_ENDPOINT_DEFAULT = 'https://api.openai.com/v1/chat/completions'
const MAX_DIRECT_ASR_BYTES = 25 * 1024 * 1024

const AUDIO_EXTENSIONS = new Set([
  'mp3',
  'wav',
  'm4a',
  'aac',
  'flac',
  'ogg',
  'oga',
  'opus',
  'mpga',
  'mpeg',
])

const VIDEO_EXTENSIONS = new Set([
  'mp4',
  'mov',
  'webm',
  'mkv',
  'avi',
  'm4v',
  'ts',
  '3gp',
])

const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
])

const WHISPER_DIRECT_VIDEO = new Set(['mp4', 'm4v', 'webm'])

export type MediaKind = 'audio' | 'video' | 'image' | 'other'

export interface AudioPayload {
  blob: Blob
  filename: string
}

function extensionOf(name: string): string {
  return name.includes('.') ? name.split('.').pop()?.toLowerCase() ?? '' : ''
}

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}

export function mediaKind(file: File): MediaKind {
  const extension = extensionOf(file.name)
  if (file.type.startsWith('audio/') || AUDIO_EXTENSIONS.has(extension)) {
    return 'audio'
  }
  if (file.type.startsWith('video/') || VIDEO_EXTENSIONS.has(extension)) {
    return 'video'
  }
  if (file.type.startsWith('image/') || IMAGE_EXTENSIONS.has(extension)) {
    return 'image'
  }
  return 'other'
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function pickRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ]
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate
  }
  return ''
}

function extractVideoAudio(file: File): Promise<AudioPayload | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.src = url
    video.muted = false
    video.playsInline = true
    video.preload = 'auto'

    const chunks: Blob[] = []
    let recorder: MediaRecorder | null = null
    let audioContext: AudioContext | null = null
    let settled = false

    const settle = (payload: AudioPayload | null) => {
      if (settled) return
      settled = true
      try {
        if (recorder && recorder.state !== 'inactive') recorder.stop()
      } catch {
        // ignore
      }
      try {
        video.pause()
      } catch {
        // ignore
      }
      try {
        void audioContext?.close()
      } catch {
        // ignore
      }
      URL.revokeObjectURL(url)
      resolve(payload)
    }

    const start = () => {
      const AudioContextCtor =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      if (!AudioContextCtor) {
        settle(null)
        return
      }
      try {
        audioContext = new AudioContextCtor()
        const source = audioContext.createMediaElementSource(video)
        const destination = audioContext.createMediaStreamDestination()
        // 不连接到 audioContext.destination，避免转写过程中外放视频声音。
        source.connect(destination)

        const mimeType = pickRecorderMimeType()
        recorder = mimeType
          ? new MediaRecorder(destination.stream, { mimeType })
          : new MediaRecorder(destination.stream)
        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) chunks.push(event.data)
        }
        recorder.onstop = () => {
          if (chunks.length === 0) {
            settle(null)
            return
          }
          const type = recorder?.mimeType || mimeType || 'audio/webm'
          const extension = type.includes('mp4')
            ? 'm4a'
            : type.includes('ogg')
              ? 'ogg'
              : 'webm'
          settle({
            blob: new Blob(chunks, { type }),
            filename: `${baseName(file.name)}-音频.${extension}`,
          })
        }
        recorder.onerror = () => settle(null)
        recorder.start(250)

        void video.play().catch(() => settle(null))
        if (audioContext.state === 'suspended') {
          void audioContext.resume().catch(() => settle(null))
        }
      } catch {
        settle(null)
      }
    }

    video.onerror = () => settle(null)
    video.onended = () => {
      if (recorder && recorder.state !== 'inactive') recorder.stop()
      else settle(null)
    }

    // 在用户上传手势内同步创建音频上下文并启动播放。
    start()
  })
}

async function mediaToAudioBlob(file: File): Promise<AudioPayload | null> {
  const kind = mediaKind(file)
  if (kind === 'audio') {
    return { blob: file, filename: file.name }
  }
  if (kind === 'video') {
    const extension = extensionOf(file.name)
    if (
      WHISPER_DIRECT_VIDEO.has(extension) &&
      file.size <= MAX_DIRECT_ASR_BYTES
    ) {
      return { blob: file, filename: file.name }
    }
    return extractVideoAudio(file)
  }
  return null
}

/**
 * 对需要浏览器实时解码音频的视频，提前启动音频捕获。
 * 必须在用户上传手势内同步调用，否则浏览器自动播放策略会阻止播放。
 */
export function prepareMediaAudio(
  file: File,
): Promise<AudioPayload | null> | null {
  const kind = mediaKind(file)
  if (kind !== 'video') return null
  const extension = extensionOf(file.name)
  if (WHISPER_DIRECT_VIDEO.has(extension) && file.size <= MAX_DIRECT_ASR_BYTES) {
    return null
  }
  return extractVideoAudio(file)
}

async function transcribeViaLocal(
  base64: string,
  filename: string,
  mime: string,
  endpoint: string,
  apiKey: string,
  model: string,
): Promise<string> {
  try {
    const response = await fetch(`${LOCAL_SERVICE}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: base64, filename, mime, endpoint, apiKey, model }),
    })
    if (!response.ok) return ''
    const data = (await response.json()) as { text?: string }
    return data.text?.trim() ?? ''
  } catch {
    return ''
  }
}

async function transcribeViaDirect(
  blob: Blob,
  filename: string,
  endpoint: string,
  apiKey: string,
  model: string,
): Promise<string> {
  try {
    const form = new FormData()
    form.append('file', blob, filename)
    form.append('model', model)
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    })
    if (!response.ok) return ''
    const data = (await response.json()) as { text?: string }
    return data.text?.trim() ?? ''
  } catch {
    return ''
  }
}

export async function recognizeMediaContent(
  file: File,
  preparedAudio?: Promise<AudioPayload | null> | null,
): Promise<string> {
  const settings = loadAiSettings()
  const apiKey = (settings.asrApiKey || settings.apiKey || '').trim()
  if (!settings.asrEnabled || !apiKey) return ''
  const endpoint = (settings.asrEndpoint || ASR_ENDPOINT_DEFAULT).trim()
  const model = (settings.asrModel || 'whisper-1').trim()
  const audio = preparedAudio ? await preparedAudio : await mediaToAudioBlob(file)
  if (!audio) return ''
  const base64 = await blobToBase64(audio.blob)
  const localText = await transcribeViaLocal(
    base64,
    audio.filename,
    audio.blob.type,
    endpoint,
    apiKey,
    model,
  )
  if (localText) return localText
  return transcribeViaDirect(audio.blob, audio.filename, endpoint, apiKey, model)
}

const IMAGE_OCR_PROMPT =
  '请识别这张图片中的全部文字内容。逐字转录图片中的文字，保留原有编号、标题与段落结构；如果图片中没有文字，请只输出“（图片中无可识别文字）”。'

async function visionViaLocal(
  dataUrl: string,
  endpoint: string,
  apiKey: string,
  model: string,
): Promise<string> {
  try {
    const response = await fetch(`${LOCAL_SERVICE}/vision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl, endpoint, apiKey, model }),
    })
    if (!response.ok) return ''
    const data = (await response.json()) as { text?: string }
    return data.text?.trim() ?? ''
  } catch {
    return ''
  }
}

async function visionViaDirect(
  dataUrl: string,
  endpoint: string,
  apiKey: string,
  model: string,
): Promise<string> {
  try {
    const response = await fetch(endpoint, {
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
              { type: 'text', text: IMAGE_OCR_PROMPT },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
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

export async function recognizeImageContent(file: File): Promise<string> {
  const settings = loadAiSettings()
  const apiKey = (settings.apiKey || '').trim()
  if (!settings.enabled || !apiKey) return ''
  const endpoint = (settings.endpoint || VISION_ENDPOINT_DEFAULT).trim()
  const model = (settings.model || 'gpt-4o-mini').trim()
  const dataUrl = await fileToDataUrl(file)
  const localText = await visionViaLocal(dataUrl, endpoint, apiKey, model)
  if (localText) return localText
  return visionViaDirect(dataUrl, endpoint, apiKey, model)
}

export async function generateAttachmentContent(
  file: File,
  preparedAudio?: Promise<AudioPayload | null> | null,
): Promise<string> {
  const kind = mediaKind(file)
  if (kind === 'audio' || kind === 'video') {
    const transcript = await recognizeMediaContent(file, preparedAudio)
    if (!transcript.trim()) return ''
    const result = await generateStructuredAttachmentContent(
      `${baseName(file.name)}.txt`,
      transcript,
    )
    return result.text
  }
  if (kind === 'image') {
    const text = await recognizeImageContent(file)
    if (!text.trim()) return ''
    const result = await generateStructuredAttachmentContent(
      `${baseName(file.name)}.txt`,
      text,
    )
    return result.text
  }
  const content = await extractFileText(file)
  if (!content.trim()) return ''
  const result = await generateStructuredAttachmentContent(file.name, content)
  return result.text
}
