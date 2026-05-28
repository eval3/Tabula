/**
 * Favicon 缓存模块
 * 双层缓存：内存缓存（页面生命周期）+ chrome.storage.local（持久化）
 * 缓存有效期 7 天，过期后自动重新获取。
 *
 * dataUrl 存空字符串 '' 表示「已确认无有效 favicon」，
 * 用于避免对同一域名反复发起网络请求。
 */

const STORAGE_PREFIX = 'favicon:'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 天

interface CacheEntry {
  /** favicon 的 dataURL；空字符串代表该域名已确认无有效 favicon */
  dataUrl: string
  ts: number
}

// 一级缓存：内存，避免重复读取 storage
const memCache = new Map<string, string>()

/**
 * 从缓存获取 favicon。
 * 返回值：
 *   - 非空 string  → 有效 dataURL，可直接用于 <img src>
 *   - ''（空字符串）→ 已确认该域名无有效 favicon，应显示 fallback
 *   - null          → 无缓存，需发起网络请求
 */
export async function getCachedFavicon(hostname: string): Promise<string | null> {
  if (!hostname) return null

  if (memCache.has(hostname)) return memCache.get(hostname)!

  const key = STORAGE_PREFIX + hostname
  try {
    const result = await chrome.storage.local.get(key)
    const entry = result[key] as CacheEntry | undefined
    if (entry && Date.now() - entry.ts < CACHE_TTL_MS) {
      memCache.set(hostname, entry.dataUrl)
      return entry.dataUrl
    }
  } catch {
    // storage 读取失败时忽略
  }

  return null
}

/** 将 favicon 结果写入双层缓存（空字符串表示已确认无效） */
async function saveFaviconToCache(hostname: string, dataUrl: string): Promise<void> {
  memCache.set(hostname, dataUrl)
  const key = STORAGE_PREFIX + hostname
  const entry: CacheEntry = { dataUrl, ts: Date.now() }
  try {
    await chrome.storage.local.set({ [key]: entry })
  } catch {
    // storage 写入失败时忽略
  }
}

/**
 * 用 canvas 检测 dataURL 图片是否有实际内容。
 * Google favicon 服务对未知域名会返回全透明或单调灰色的默认占位图，
 * 通过以下两个条件识别并过滤：
 *   1. 全透明（alpha 均 < 30）
 *   2. 主色调接近灰色（R≈G≈B）且颜色极度单调（方差 < 800）
 */
async function isValidFaviconDataUrl(dataUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const SIZE = 12
        const canvas = document.createElement('canvas')
        canvas.width = SIZE
        canvas.height = SIZE
        const ctx = canvas.getContext('2d')
        if (!ctx) { resolve(true); return }
        ctx.drawImage(img, 0, 0, SIZE, SIZE)
        const { data } = ctx.getImageData(0, 0, SIZE, SIZE)

        let opaqueCount = 0
        let sumR = 0, sumG = 0, sumB = 0
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 30) continue
          opaqueCount++
          sumR += data[i]; sumG += data[i + 1]; sumB += data[i + 2]
        }

        // 全透明 → 默认占位图
        if (opaqueCount === 0) { resolve(false); return }

        const meanR = sumR / opaqueCount
        const meanG = sumG / opaqueCount
        const meanB = sumB / opaqueCount

        // 计算颜色方差（反映色彩多样性）
        let variance = 0
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 30) continue
          const dr = data[i] - meanR
          const dg = data[i + 1] - meanG
          const db = data[i + 2] - meanB
          variance += dr * dr + dg * dg + db * db
        }
        variance /= opaqueCount

        // 主色调接近灰色（R≈G≈B 且各通道偏差 < 25）
        const isGrayTone = Math.abs(meanR - meanG) < 25 && Math.abs(meanG - meanB) < 25
        // 颜色极度单调（方差 < 800 约等于标准差 < 28）
        const isMonotone = variance < 800

        // 灰色单调图 → 认为是默认占位图，无效
        if (isGrayTone && isMonotone) { resolve(false); return }

        resolve(true)
      } catch {
        resolve(true) // 检测异常时保守认为有效
      }
    }
    img.onerror = () => resolve(false)
    img.src = dataUrl
  })
}

/**
 * 通过网络获取 favicon，检测有效性后缓存。
 * 返回有效 dataURL，或 null（无有效 favicon）。
 */
export async function fetchAndCacheFavicon(hostname: string): Promise<string | null> {
  if (!hostname) return null

  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`
  try {
    const resp = await fetch(faviconUrl)
    if (!resp.ok) {
      // HTTP 错误：缓存无效标记（避免反复请求），返回 null
      await saveFaviconToCache(hostname, '')
      return null
    }

    const blob = await resp.blob()
    const dataUrl = await blobToDataUrl(blob)

    // 检测是否是 Google 默认占位图（全透明 / 灰色单调图）
    const valid = await isValidFaviconDataUrl(dataUrl)
    if (!valid) {
      // 缓存无效标记，下次直接显示 fallback，不再重复请求
      await saveFaviconToCache(hostname, '')
      return null
    }

    await saveFaviconToCache(hostname, dataUrl)
    return dataUrl
  } catch {
    // 网络错误：不缓存，下次可能成功
    return null
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
