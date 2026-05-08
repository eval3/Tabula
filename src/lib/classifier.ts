import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { PROVIDERS, type ProviderId } from './providers'
import type { OrganizePrefs } from './organize'

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
        ...(config.providerId === 'deepseek' && { thinking: { type: 'disabled' } }),
      } as Parameters<typeof client.chat.completions.create>[0], { signal: controller.signal })
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

function buildPrefsHints(prefs?: OrganizePrefs): string {
  if (!prefs) return ''
  const hints: string[] = []

  const classifyByHints: Record<string, string> = {
    topic:    '按内容主题分类（如：科技与AI、购物、娱乐、教育、新闻等）。',
    scenario: '按使用场景分类（如：工作效率、学习研究、日常生活、娱乐休闲等）。',
    type:     '按内容类型分类（如：视频、文章、在线工具、开发文档、社区论坛等）。',
    platform: '按来源平台分类（如：GitHub、YouTube、知乎、Twitter、Reddit等）。',
  }
  if (prefs.classifyBy && classifyByHints[prefs.classifyBy]) {
    hints.push(classifyByHints[prefs.classifyBy])
  }

  if (prefs.granularity === 'coarse') hints.push('分类要粗略，将相关内容合并到宽泛大类，目标5-8个文件夹。')
  if (prefs.granularity === 'fine')   hints.push('分类要精细，可细分为专题子文件夹，目标15-30个文件夹。')
  if (prefs.namingLang === 'zh') hints.push('文件夹名称必须使用中文。')
  if (prefs.namingLang === 'en') hints.push('Folder names must be in English.')
  if (!prefs.allowNewFolders)    hints.push('只能使用现有文件夹，禁止创建新文件夹。')
  if (prefs.customInstructions.trim()) hints.push(prefs.customInstructions.trim())
  return hints.length > 0 ? '\n' + hints.join('\n') : ''
}

export async function classifyBookmarks(
  config: CallConfig,
  bookmarks: BookmarkItem[],
  existingFolders: string[],
  prefs?: OrganizePrefs
): Promise<ClassifyResult[]> {
  const prefsHints = buildPrefsHints(prefs)
  const prompt = `将书签分类到文件夹。${prefsHints}

现有文件夹：
${existingFolders.length > 0 ? existingFolders.join('\n') : '（无）'}

书签（标题 | URL）：
${bookmarks.map((b, i) => {
  let shortUrl = b.url
  try { const u = new URL(b.url); shortUrl = u.hostname + u.pathname.replace(/\/$/, '') } catch {}
  return `${i + 1}. ${b.title} | ${shortUrl}`
}).join('\n')}

返回JSON数组 [{"folderName":"路径"}]，顺序与书签一致，路径最多两级，只返回JSON。`

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
