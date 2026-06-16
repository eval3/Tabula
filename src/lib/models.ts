import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { PROVIDERS, type ProviderId } from './providers'

export interface ModelOption {
  id: string
  label: string
}

// 列表接口会返回大量非文本对话的模型（向量、绘图、视频、语音等），过滤掉
const NON_CHAT = /embedding|rerank|cogview|cogvideo|cogagent|\btts\b|\basr\b|whisper|moderation|audio|voice|image|dall-?e|stable-?diffusion|flux|video|rerank/i

function toOptions(ids: string[]): ModelOption[] {
  const seen = new Set<string>()
  const out: ModelOption[] = []
  for (const id of ids) {
    if (!id || seen.has(id) || NON_CHAT.test(id)) continue
    seen.add(id)
    out.push({ id, label: id })
  }
  return out
}

/**
 * 调用各提供商的「列出模型」接口拉取当前可用的模型。
 * 需要用户已配置的 API Key；失败时由调用方回退到 providers.ts 中的内置列表。
 */
export async function fetchProviderModels(providerId: ProviderId, apiKey: string): Promise<ModelOption[]> {
  const provider = PROVIDERS[providerId]

  if (provider.type === 'anthropic') {
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
    const res = await client.models.list({ limit: 100 })
    return res.data.map(m => ({ id: m.id, label: m.display_name ?? m.id }))
  }

  if (provider.type === 'gemini') {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${apiKey}`
    )
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
    const data = (await res.json()) as {
      models?: Array<{ name: string; supportedGenerationMethods?: string[] }>
    }
    const ids = (data.models ?? [])
      .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
      .map(m => m.name.replace(/^models\//, ''))
    return toOptions(ids)
  }

  // openai-compatible（DeepSeek / GLM / Qwen / Kimi / MiniMax）统一走 GET /models
  const client = new OpenAI({ apiKey, baseURL: provider.baseURL, dangerouslyAllowBrowser: true })
  const res = await client.models.list()
  return toOptions(res.data.map(m => m.id))
}
