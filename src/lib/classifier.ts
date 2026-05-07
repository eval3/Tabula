import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { PROVIDERS, type ProviderId } from './providers'

export interface BookmarkItem {
  id: string
  title: string
  url: string
}

export interface ClassifyResult {
  bookmarkId: string
  folderName: string
}

interface CallConfig {
  providerId: ProviderId
  apiKey: string
  model: string
}

const SINGLE_TIMEOUT_MS = 360_000
const BATCH_TIMEOUT_MS = 600_000

async function callLLM(config: CallConfig, prompt: string, maxTokens = 64, timeoutMs: number): Promise<string> {
  const provider = PROVIDERS[config.providerId]
  const tag = `[SmartBookmark] ${provider.name} / ${config.model}`
  const t0 = Date.now()

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  console.group(tag)
  console.log('prompt:', prompt)

  try {
    let result = ''

    if (provider.type === 'anthropic') {
      const client = new Anthropic({ apiKey: config.apiKey, dangerouslyAllowBrowser: true })
      const msg = await client.messages.create({
        model: config.model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }, { signal: controller.signal })
      const content = msg.content[0]
      if (content.type !== 'text') throw new Error('Unexpected response type')
      result = content.text.trim()
      console.log('usage:', msg.usage)
    } else if (provider.type === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`Gemini API error: ${res.status} ${await res.text()}`)
      const data = await res.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
        usageMetadata?: unknown
      }
      result = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
      console.log('usage:', data.usageMetadata)
    } else {
      // openai-compatible
      const client = new OpenAI({
        apiKey: config.apiKey,
        baseURL: provider.baseURL,
        dangerouslyAllowBrowser: true,
      })
      const res = await client.chat.completions.create({
        model: config.model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }, { signal: controller.signal })
      const choice = res.choices[0]?.message
      // DeepSeek R1 等模型有时内容在 reasoning_content 而非 content
      result = (choice?.content ?? (choice as unknown as Record<string, string>)?.reasoning_content ?? '').trim()
      console.log('usage:', res.usage)
    }

    console.log(`response (${Date.now() - t0}ms):`, result)
    return result
  } catch (err) {
    if (controller.signal.aborted) {
      console.error(`timeout after ${timeoutMs / 1000}s`)
      throw new Error(`请求超时（${timeoutMs / 1000}s）`)
    }
    console.error(`failed (${Date.now() - t0}ms):`, err)
    throw err
  } finally {
    clearTimeout(timeoutId)
    console.groupEnd()
  }
}

export async function classifySingleBookmark(
  config: CallConfig,
  title: string,
  url: string,
  existingFolders: string[]
): Promise<string> {
  let shortUrl = url
  try { const u = new URL(url); shortUrl = u.hostname + u.pathname.replace(/\/$/, '') } catch {}

  const prompt = `将书签分类到文件夹，直接输出路径，不要分析过程。

现有文件夹：
${existingFolders.length > 0 ? existingFolders.join('\n') : '（无）'}

书签：${title} | ${shortUrl}

输出一个文件夹路径，最多两级（用"/"分隔），可新建文件夹，只返回路径。`

  const result = await callLLM(config, prompt, 2048, SINGLE_TIMEOUT_MS)
  if (!result) throw new Error('AI 返回了空响应，请检查模型名称或 API Key 是否正确')
  return result
}

export async function classifyBookmarks(
  config: CallConfig,
  bookmarks: BookmarkItem[],
  existingFolders: string[]
): Promise<ClassifyResult[]> {
  const prompt = `将书签分类到文件夹。直接输出JSON，不要分析过程。

现有文件夹：
${existingFolders.length > 0 ? existingFolders.join('\n') : '（无）'}

书签（标题 | URL）：
${bookmarks.map((b, i) => {
  let shortUrl = b.url
  try { const u = new URL(b.url); shortUrl = u.hostname + u.pathname.replace(/\/$/, '') } catch {}
  return `${i + 1}. ${b.title} | ${shortUrl}`
}).join('\n')}

返回JSON数组 [{"folderName":"路径"}]，顺序与书签一致，路径最多两级，可新建文件夹，只返回JSON。`

  const text = await callLLM(config, prompt, 4096, BATCH_TIMEOUT_MS)
  const jsonStr = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()

  let raw: Array<{ folderName: string }>
  try {
    raw = JSON.parse(jsonStr)
  } catch {
    // 响应被截断时，提取已完整解析的部分
    const lastBracket = jsonStr.lastIndexOf('},')
    const partial = lastBracket > 0 ? jsonStr.slice(0, lastBracket + 1) + ']' : '[]'
    raw = JSON.parse(partial)
    console.warn(`[SmartBookmark] JSON 截断，仅解析到 ${raw.length}/${bookmarks.length} 条`)
  }

  return raw.map((item, index) => ({
    bookmarkId: bookmarks[index]?.id ?? '',
    folderName: item.folderName,
  }))
}
