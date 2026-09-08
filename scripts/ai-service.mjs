import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const PORT = 5188
const CODEX_BIN = '/usr/local/bin/codex'

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

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 2 * 1024 * 1024) {
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

function runCodex(prompt) {
  return new Promise((resolve, reject) => {
    const outputFile = join(tmpdir(), `allknow-ai-${randomUUID()}.md`)
    const child = spawn(
      CODEX_BIN,
      [
        'exec',
        '--ephemeral',
        '--skip-git-repo-check',
        '--sandbox',
        'read-only',
        '--color',
        'never',
        '-o',
        outputFile,
      ],
      {
        stdio: ['pipe', 'ignore', 'pipe'],
      },
    )

    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error('AI service timeout'))
    }, 180000)

    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })

    child.on('close', async (code) => {
      clearTimeout(timer)
      try {
        if (code !== 0) {
          reject(new Error(`Codex exited with ${code}: ${stderr.slice(0, 500)}`))
          return
        }
        const content = await readFile(outputFile, 'utf8')
        await rm(outputFile, { force: true })
        resolve(
          content
            .replace(/^```(?:markdown|md)?\s*|```\s*$/g, '')
            .trim(),
        )
      } catch (error) {
        reject(error)
      }
    })

    child.stdin.write(prompt)
    child.stdin.end()
  })
}

const server = createServer(async (req, res) => {
  setCors(res)
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  if (req.method !== 'POST' || req.url !== '/extract') {
    sendJson(res, 404, { error: 'not found' })
    return
  }
  try {
    const body = JSON.parse(await readBody(req))
    const fileName = String(body.fileName ?? '附件')
    const content = String(body.content ?? '').slice(0, 18000)
    if (!content.trim()) {
      sendJson(res, 400, { error: 'empty content' })
      return
    }
    const prompt = [
      '你是企业知识库结构化整理助手。只输出文档标题、操作步骤和备注，其余内容一律不输出。',
      '',
      '输出格式严格如下：',
      '**文档标题**',
      '',
      '### 操作步骤',
      '**1. 一级标题**',
      '- 操作内容',
      '**1.1 二级标题**',
      '- 操作内容',
      '',
      '### 备注',
      '- 备注、注意、避免事项',
      '',
      '删除页眉页脚、水印、页码、模板说明、联系方式、元信息、要求、完成标准和无关内容。',
      '没有操作步骤或备注的分节不要输出。',
      `附件名称：${fileName}`,
      '',
      '附件内容：',
      content,
    ].join('\n')
    const result = await runCodex(prompt)
    if (!result) {
      sendJson(res, 502, { error: 'AI returned no content' })
      return
    }
    sendJson(res, 200, { text: result, source: 'codex' })
  } catch (error) {
    console.error(error)
    sendJson(res, 500, { error: String(error?.message ?? error) })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`AllKnow AI service listening on http://127.0.0.1:${PORT}`)
})
