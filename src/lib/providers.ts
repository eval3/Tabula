export type ProviderId = 'claude' | 'deepseek' | 'glm' | 'gemini' | 'qwen' | 'kimi' | 'minimax'
export type ProviderType = 'anthropic' | 'openai-compatible' | 'gemini'

export interface ProviderConfig {
  id: ProviderId
  name: string
  type: ProviderType
  baseURL?: string
  models: { id: string; label: string }[]
  keyPlaceholder: string
  keyLink: string
}

export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    type: 'openai-compatible',
    baseURL: 'https://api.deepseek.com',
    models: [
      { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
      { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
      { id: 'deepseek-chat', label: 'DeepSeek V3' },
      { id: 'deepseek-reasoner', label: 'DeepSeek R1' },
    ],
    keyPlaceholder: 'sk-...',
    keyLink: 'https://platform.deepseek.com',
  },
  claude: {
    id: 'claude',
    name: 'Claude',
    type: 'anthropic',
    models: [
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
      { id: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
    ],
    keyPlaceholder: 'sk-ant-...',
    keyLink: 'https://console.anthropic.com',
  },
  glm: {
    id: 'glm',
    name: 'GLM',
    type: 'openai-compatible',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      { id: 'glm-4-flash', label: 'GLM-4 Flash' },
      { id: 'glm-4-plus', label: 'GLM-4 Plus' },
      { id: 'glm-4', label: 'GLM-4' },
    ],
    keyPlaceholder: '粘贴 API Key...',
    keyLink: 'https://open.bigmodel.cn',
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    type: 'gemini',
    models: [
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
      { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    ],
    keyPlaceholder: 'AIza...',
    keyLink: 'https://aistudio.google.com/app/apikey',
  },
  qwen: {
    id: 'qwen',
    name: 'Qwen',
    type: 'openai-compatible',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      { id: 'qwen-turbo', label: 'Qwen Turbo' },
      { id: 'qwen-plus', label: 'Qwen Plus' },
      { id: 'qwen-max', label: 'Qwen Max' },
    ],
    keyPlaceholder: 'sk-...',
    keyLink: 'https://dashscope.console.aliyun.com',
  },
  kimi: {
    id: 'kimi',
    name: 'Kimi',
    type: 'openai-compatible',
    baseURL: 'https://api.moonshot.cn/v1',
    models: [
      { id: 'moonshot-v1-8k', label: 'Moonshot 8k' },
      { id: 'moonshot-v1-32k', label: 'Moonshot 32k' },
      { id: 'moonshot-v1-128k', label: 'Moonshot 128k' },
    ],
    keyPlaceholder: 'sk-...',
    keyLink: 'https://platform.moonshot.cn',
  },
  minimax: {
    id: 'minimax',
    name: 'MiniMax',
    type: 'openai-compatible',
    baseURL: 'https://api.minimax.chat/v1',
    models: [
      { id: 'MiniMax-Text-01', label: 'MiniMax Text 01' },
      { id: 'abab6.5s-chat', label: 'ABAB 6.5s' },
    ],
    keyPlaceholder: '粘贴 API Key...',
    keyLink: 'https://platform.minimaxi.com',
  },
}

export const PROVIDER_LIST = Object.values(PROVIDERS)
export const DEFAULT_PROVIDER: ProviderId = 'deepseek'
