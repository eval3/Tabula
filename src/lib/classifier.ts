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

const CALL_TIMEOUT_MS = 60_000

async function callLLM(config: CallConfig, prompt: string, maxTokens = 64): Promise<string> {
  const provider = PROVIDERS[config.providerId]
  const tag = `[SmartBookmark] ${provider.name} / ${config.model}`
  const t0 = Date.now()

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS)

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
      console.error(`timeout after ${CALL_TIMEOUT_MS / 1000}s`)
      throw new Error(`请求超时（${CALL_TIMEOUT_MS / 1000}s）`)
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

  const prompt = `书签分类专家。将书签放入最合适的文件夹，只返回文件夹路径。

规则：
- 可使用现有路径，也可新建（如"前端开发/React"）
- 用"/"表示层级，最多两级
- 只返回路径，不要其他内容

现有文件夹：
${existingFolders.length > 0 ? existingFolders.join('\n') : '（无）'}

书签：${title} | ${shortUrl}`

  const result = await callLLM(config, prompt, 2048)
  if (!result) throw new Error('AI 返回了空响应，请检查模型名称或 API Key 是否正确')
  return result
}

export async function classifyBookmarks(
  config: CallConfig,
  bookmarks: BookmarkItem[],
  existingFolders: string[]
): Promise<ClassifyResult[]> {
  const prompt = `书签分类专家。将以下书签分配到最合适的文件夹路径。

规则：
- 可使用现有路径，也可新建（如"前端开发/React"）
- 用"/"表示层级，最多两级
- 返回JSON数组，每项只有 folderName 字段，顺序与书签列表一致，只返回JSON数组

现有文件夹：
${existingFolders.length > 0 ? existingFolders.join('\n') : '（无）'}

书签列表：
${bookmarks.map((b, i) => {
  let shortUrl = b.url
  try { const u = new URL(b.url); shortUrl = u.hostname + u.pathname.replace(/\/$/, '') } catch {}
  return `${i + 1}. ${b.title} | ${shortUrl}`
}).join('\n')}`

  const text = await callLLM(config, prompt, 4096)
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
