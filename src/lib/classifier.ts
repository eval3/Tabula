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

// 单条收藏时从当前页面抓取的辅助信息，用于提升分类准确度
export interface PageContext {
  siteName?: string
  ogType?: string
  description?: string
  keywords?: string
  heading?: string
  excerpt?: string
}

function buildPageInfo(ctx?: PageContext): string {
  if (!ctx) return ''
  const lines = [
    ctx.siteName && `站点：${ctx.siteName}`,
    ctx.ogType && `类型：${ctx.ogType}`,
    ctx.description && `描述：${ctx.description}`,
    ctx.keywords && `关键词：${ctx.keywords}`,
    ctx.heading && `页面标题：${ctx.heading}`,
    ctx.excerpt && `正文摘要：${ctx.excerpt}`,
  ].filter(Boolean)
  return lines.length > 0 ? `\n\n页面信息（用于理解书签内容）：\n${lines.join('\n')}` : ''
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
  const tag = `[Tabula] ${provider.name} / ${config.model}`
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
      const res = (await client.chat.completions.create({
        model: config.model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        ...(config.providerId === 'deepseek' && { thinking: { type: 'disabled' } }),
      }, { signal: controller.signal })) as any
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

export interface SingleBookmarkResult {
  title: string
  path: string
}

export async function classifySingleBookmark(
  config: CallConfig,
  title: string,
  url: string,
  existingFolders: string[],
  pageContext?: PageContext
): Promise<SingleBookmarkResult> {
  let shortUrl = url
  try { const u = new URL(url); shortUrl = u.hostname + u.pathname.replace(/\/$/, '') } catch {}

  const prompt = `你要为一个书签选择最合适的收藏文件夹路径，并为它起一个精简的名称。

书签原标题：${title}
书签地址：${shortUrl}${buildPageInfo(pageContext)}

现有文件夹（可选用）：
${existingFolders.length > 0 ? existingFolders.join('\n') : '（无）'}

判断步骤（在心里完成，不要写出来）：
- 先根据上面的页面信息判断这个书签的主题领域是什么。
- 再看现有文件夹里有没有主题明确匹配的：有就用它；没有就在顶层新建一个能准确概括该主题的文件夹。

要求：
- path：文件夹路径。含义不明或命名随意的文件夹（如"123"、"新建文件夹"、"未命名"）一律视为无关，不要放入，也不要在其下创建子文件夹；文件夹名要贴合书签主题，用你自己的判断来命名，不要照搬本说明里出现的任何词语；路径最多两级，用"/"分隔。
- title：在原标题基础上精简，去掉网站名后缀、登录/状态词、营销语和多余符号，保留能一眼识别该页面的简洁名称，不超过 20 个字。
- 最终只输出一个 JSON 对象，不要解释、不要写出判断过程：{"title":"精简标题","path":"文件夹路径"}`

  const text = await callLLM(config, prompt, 2048, SINGLE_TIMEOUT_MS)
  if (!text) throw new Error('AI 返回了空响应，请检查模型名称或 API Key 是否正确')

  const match = text.match(/\{[\s\S]*\}/)
  try {
    const parsed = JSON.parse(match ? match[0] : text) as { title?: string; path?: string }
    const path = (parsed.path ?? '').trim()
    if (!path) throw new Error('missing path')
    return { title: (parsed.title ?? '').trim(), path }
  } catch {
    // 模型未按 JSON 输出时兜底：整段当作路径，标题沿用原标题
    console.warn('[Tabula] 单条分类 JSON 解析失败，按纯路径兜底:', text.slice(0, 120))
    return { title: title.trim(), path: text.trim() }
  }
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

直接返回JSON数组，无其他文本：[{"folderName":"路径1"},{"folderName":"路径2"}]
顺序与书签一致，路径最多两级，禁止添加任何解释或额外文本。`

  const text = await callLLM(config, prompt, 4096, BATCH_TIMEOUT_MS)

  // 提取 JSON 内容（处理前缀文本、markdown 代码块等）
  const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/)
  const jsonStr = jsonMatch ? jsonMatch[0] : text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()

  let raw: Array<{ folderName: string }>
  try {
    raw = JSON.parse(jsonStr)
  } catch (err) {
    console.error('[Tabula] JSON 解析失败，原始响应:', text.slice(0, 200))
    // 响应被截断时，提取已完整解析的部分
    const lastBracket = jsonStr.lastIndexOf('},')
    const partial = lastBracket > 0 ? jsonStr.slice(0, lastBracket + 1) + ']' : '[]'
    try {
      raw = JSON.parse(partial)
      console.warn(`[Tabula] JSON 截断，仅解析到 ${raw.length}/${bookmarks.length} 条`)
    } catch {
      console.error('[Tabula] 无法恢复 JSON，返回空数组')
      raw = []
    }
  }

  return raw.map((item, index) => ({
    bookmarkId: bookmarks[index]?.id ?? '',
    folderName: item.folderName,
  }))
}
