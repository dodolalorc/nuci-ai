import { generateText } from "@xsai/generate-text"

import type {
  AiModelProfile,
  FolderIndex,
  FolderSuggestion,
  PageContext,
  PageDigestRequest,
  PageDigestResult,
  PageDigestSegment,
  RecommendationInput,
  RecommendationResult,
  SegmentSelectionResult,
  SmartFavoritesSettings
} from "~/src/sdk/types"
import { withAiRetry } from "~/src/services/aiService"

type SnippetAnalysisResult = {
  summary: string
  tags: string[]
}

const estimateTokens = (text: string) => Math.max(1, Math.ceil(text.length / 4))

function resolveProvider(
  settings: SmartFavoritesSettings,
  providerId?: string
): AiModelProfile {
  const candidates = settings.providers?.length
    ? settings.providers
    : [
        {
          id: settings.activeProviderId || "default-provider",
          label: settings.provider.model || "默认模型",
          ...settings.provider
        }
      ]

  return (
    candidates.find((provider) => provider.id === providerId) ??
    candidates.find((provider) => provider.id === settings.activeProviderId) ??
    candidates[0]
  )
}

function hasProviderConfig(
  provider: Pick<AiModelProfile, "apiKey" | "baseUrl" | "model">
) {
  return Boolean(provider.apiKey && provider.baseUrl && provider.model)
}

function getMissingProviderConfigFields(
  provider: Pick<AiModelProfile, "apiKey" | "baseUrl" | "model">
) {
  const missing: string[] = []

  if (!provider.apiKey?.trim()) {
    missing.push("API Key")
  }

  if (!provider.model?.trim()) {
    missing.push("模型")
  }

  if (!provider.baseUrl?.trim()) {
    missing.push("Base URL")
  }

  return missing
}

function getProviderConfigNotice(
  provider: Pick<AiModelProfile, "apiKey" | "baseUrl" | "model">,
  destination = "插件管理页 > 模型配置"
) {
  const missing = getMissingProviderConfigFields(provider)

  if (missing.length === 0) {
    return ""
  }

  return `尚未配置${missing.join("、")}，请前往${destination}进行配置。`
}

function renderTemplate(
  template: string,
  input: RecommendationInput,
  folderIndex: FolderIndex
) {
  const folders = folderIndex.folders
    .slice(0, 120)
    .map(
      (folder) =>
        `- ${folder.path} | id=${folder.id} | bookmarks=${folder.bookmarkCount}`
    )
    .join("\n")

  return template
    .replaceAll("{{title}}", input.page.title || "")
    .replaceAll("{{url}}", input.page.url || "")
    .replaceAll("{{domain}}", input.page.domain || "")
    .replaceAll("{{description}}", input.page.description || "")
    .replaceAll("{{summary}}", input.page.summary || "")
    .replaceAll("{{selectedText}}", input.selectedText || "")
    .replaceAll("{{tags}}", input.tags.join(", "))
    .replaceAll("{{notes}}", input.notes || "")
    .replaceAll("{{folders}}", folders)
}

const suggestionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["suggestions"],
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type"],
        properties: {
          type: {
            type: "string",
            enum: ["existing", "create"]
          },
          folderId: {
            type: "string"
          },
          title: {
            type: "string"
          },
          reason: {
            type: "string"
          }
        }
      }
    }
  }
} as const

function parseJsonResponse(content: string) {
  const match = content.match(/\{[\s\S]*\}/)
  if (!match) {
    throw new Error("AI 响应中没有合法 JSON。")
  }

  return JSON.parse(match[0]) as {
    suggestions?: Array<{
      type?: "existing" | "create"
      folderId?: string
      title?: string
      reason?: string
    }>
  }
}

const heuristicSnippetAnalysis = (text: string): SnippetAnalysisResult => {
  const normalized = text.replace(/\s+/g, " ").trim()
  const tags = normalizeSnippetKeywords("", [], normalized)

  return {
    summary: tags.join("，") || normalized.slice(0, 36),
    tags
  }
}

const snippetKeywordStopWords = new Set([
  "this",
  "that",
  "with",
  "from",
  "have",
  "will",
  "about",
  "your",
  "their",
  "would",
  "could",
  "should",
  "https",
  "http",
  "www",
  "com",
  "the",
  "and",
  "for",
  "into",
  "onto",
  "using",
  "used",
  "make",
  "made",
  "进行",
  "通过",
  "用于",
  "可以",
  "需要",
  "应该",
  "这个",
  "那个",
  "这些",
  "那些",
  "我们",
  "你们",
  "他们",
  "本文",
  "页面",
  "内容",
  "段落",
  "分析",
  "总结",
  "关键词",
  "说明",
  "相关",
  "主要"
])

const keywordSplitPattern = /[，,、；;。.!?\n\r\t\s]+/

function isLikelyNounKeyword(token: string): boolean {
  if (token.length < 2 || token.length > 24) {
    return false
  }

  if (/^\d+$/.test(token)) {
    return false
  }

  const normalized = token.toLowerCase()
  if (snippetKeywordStopWords.has(normalized)) {
    return false
  }

  if (
    /^(is|are|was|were|be|been|being|do|does|did|can|may|must|should)$/i.test(
      token
    )
  ) {
    return false
  }

  return /[\p{L}\p{N}]/u.test(token)
}

function extractKeywordsFromText(text: string): string[] {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(isLikelyNounKeyword)

  const scores = new Map<string, number>()
  normalized.forEach((token) => {
    scores.set(token, (scores.get(token) ?? 0) + 1)
  })

  const wordKeywords = Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([token]) => token)

  const cjkPhrases = (text.match(/[\p{Script=Han}]{2,8}/gu) ?? [])
    .map((item) => item.trim())
    .filter(isLikelyNounKeyword)

  return Array.from(new Set([...cjkPhrases, ...wordKeywords]))
}

function normalizeSnippetKeywords(
  summary?: string,
  tags?: string[],
  sourceText = ""
): string[] {
  const fromSummary = (summary || "")
    .split(keywordSplitPattern)
    .map((item) => item.trim())
    .filter(isLikelyNounKeyword)

  const fromTags = (tags ?? [])
    .flatMap((item) => item.split(keywordSplitPattern))
    .map((item) => item.trim())
    .filter(isLikelyNounKeyword)

  const fallbackKeywords = extractKeywordsFromText(sourceText)

  const merged = Array.from(
    new Set([...fromTags, ...fromSummary, ...fallbackKeywords])
  )

  const resolved = merged.slice(0, 8)
  return resolved.length >= 4 ? resolved : fallbackKeywords.slice(0, 8)
}

export const analyzeSnippetContent = async (
  text: string,
  settings: SmartFavoritesSettings
): Promise<SnippetAnalysisResult> => {
  const provider = resolveProvider(settings)

  if (!hasProviderConfig(provider)) {
    return heuristicSnippetAnalysis(text)
  }

  try {
    const result = await withAiRetry(() =>
      generateText({
        apiKey: provider.apiKey,
        baseURL: provider.baseUrl,
        model: provider.model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "你是网页片段关键词提炼助手。请输出 JSON：{summary: string, tags: string[]}。summary 只允许 3-6 个关键词，用中文逗号分隔；tags 输出 3-6 个关键词。严禁输出完整句子和解释。"
          },
          {
            role: "user",
            content: `请提炼这段文本的关键词：\n${text.slice(0, 2200)}`
          }
        ]
      })
    )

    const parsed = parseJsonResponse(result.text || "") as {
      summary?: string
      tags?: string[]
    }

    const keywords = normalizeSnippetKeywords(parsed.summary, parsed.tags, text)

    if (keywords.length > 0) {
      return {
        summary: keywords.join("，"),
        tags: keywords.slice(0, 6)
      }
    }
  } catch {
    return heuristicSnippetAnalysis(text)
  }

  return heuristicSnippetAnalysis(text)
}

export async function extractAiRecommendations(
  input: RecommendationInput,
  folderIndex: FolderIndex,
  settings: SmartFavoritesSettings,
  fallback: RecommendationResult
): Promise<RecommendationResult> {
  const provider = resolveProvider(settings)

  const result = await withAiRetry(() =>
    generateText({
      apiKey: provider.apiKey,
      baseURL: provider.baseUrl,
      model: provider.model,
      temperature: 0.2,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "bookmark_folder_suggestions",
          strict: true,
          schema: suggestionSchema
        }
      },
      messages: [
        {
          role: "system",
          content: settings.prompts.system
        },
        {
          role: "user",
          content: renderTemplate(settings.prompts.template, input, folderIndex)
        }
      ]
    })
  )
  const parsed = parseJsonResponse(result.text || "")

  const suggestions: FolderSuggestion[] = []

  for (const [index, item] of (parsed.suggestions ?? []).entries()) {
    const existingFolder = folderIndex.folders.find(
      (folder) => folder.id === item.folderId
    )

    if (item.type === "existing" && existingFolder) {
      suggestions.push({
        key: `existing:${existingFolder.id}:${index}`,
        type: "existing",
        folderId: existingFolder.id,
        title: existingFolder.title,
        path: existingFolder.path,
        score: 100 - index,
        reason: item.reason || "AI 推荐复用现有结构。"
      })
      continue
    }

    if (item.type === "create" && item.title) {
      suggestions.push({
        key: `create:${item.title}:${index}`,
        type: "create",
        title: item.title,
        path: `新建 / ${item.title}`,
        score: 60 - index,
        reason: item.reason || "AI 认为当前结构不够匹配，建议新建。"
      })
    }
  }

  return {
    source: suggestions.length > 0 ? "ai" : fallback.source,
    suggestions: suggestions.length > 0 ? suggestions : fallback.suggestions
  }
}

function buildDigestPrompt(
  page: PageContext,
  content: string,
  prompt?: string
) {
  return [
    "请把这个网页压缩为关键词结果，便于后续模型快速消费。",
    "输出要求：",
    "1. 仅输出关键词，不要完整句子，不要解释，不要分段总结。",
    "2. 总数控制在 6-12 个关键词。",
    "3. 关键词覆盖：主题、核心观点、关键实体、方法或结论。",
    "4. 使用中文逗号分隔，输出单行纯文本。",
    "5. 缺失信息可省略，严禁用“未识别”补位。",
    prompt?.trim() ? `6. 额外用户要求：${prompt.trim()}` : ""
  ]
    .filter(Boolean)
    .join("\n")
    .concat(
      `\n\n页面元信息：\n标题：${page.title || "未识别"}\n作者：${page.author || "未识别"}\n日期：${page.publishedAt || "未识别"}\n网址：${page.url || "未识别"}\n站点：${page.siteName || page.domain || "未识别"}\n描述：${page.description || "未识别"}\n\n页面内容：\n${content.slice(0, 24000)}`
    )
}

function buildSegmentDigestContent(segments: PageDigestSegment[]) {
  return segments
    .filter((segment) => segment.selected)
    .sort((left, right) => left.order - right.order)
    .map((segment, index) => `[段落 ${index + 1}]\n${segment.text}`)
    .join("\n\n")
}

function buildHeuristicDigest(payload: PageDigestRequest): string {
  const page = payload.page
  const sourceContent =
    payload.mode === "segments" && payload.segments?.length
      ? buildSegmentDigestContent(payload.segments)
      : payload.content
  const normalizedContent = sourceContent
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 12000)

  const keywordParts = [
    page.title,
    page.author,
    page.siteName,
    page.domain,
    page.description,
    page.summary,
    normalizedContent
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")

  const stopWords = new Set([
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "you",
    "your",
    "are",
    "was",
    "were",
    "have",
    "has",
    "http",
    "https",
    "www",
    "com",
    "cn",
    "html",
    "文章",
    "页面",
    "内容",
    "当前",
    "可以",
    "以及",
    "一个",
    "我们"
  ])

  const freq = new Map<string, number>()
  keywordParts
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !stopWords.has(token))
    .forEach((token) => {
      freq.set(token, (freq.get(token) ?? 0) + 1)
    })

  const seedKeywords = [
    page.title,
    page.author,
    page.siteName || page.domain,
    page.description
  ]
    .filter((item): item is string => Boolean(item?.trim()))
    .map((item) => item.trim())

  const freqKeywords = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([token]) => token)

  const keywords = Array.from(
    new Set([...seedKeywords, ...freqKeywords])
  ).slice(0, 10)

  if (payload.prompt?.trim()) {
    keywords.push(payload.prompt.trim())
  }

  return keywords.slice(0, 12).join("，")
}

export async function summarizePageContent(
  payload: PageDigestRequest,
  settings: SmartFavoritesSettings
): Promise<PageDigestResult> {
  const provider = resolveProvider(settings, payload.providerId)
  const digestContent =
    payload.mode === "segments" && payload.segments?.length
      ? buildSegmentDigestContent(payload.segments)
      : payload.content
  const fallback = buildHeuristicDigest(payload)

  if (!hasProviderConfig(provider)) {
    return {
      modelLabel: provider.label || "未配置模型",
      providerId: provider.id,
      content: fallback,
      tokenEstimate: estimateTokens(fallback)
    }
  }

  try {
    const result = await withAiRetry(() =>
      generateText({
        apiKey: provider.apiKey,
        baseURL: provider.baseUrl,
        model: provider.model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "你是网页关键词提炼助手。仅输出关键词，不输出句子、解释、标题或编号。"
          },
          {
            role: "user",
            content: buildDigestPrompt(
              payload.page,
              digestContent,
              payload.prompt
            )
          }
        ]
      })
    )

    const content = result.text?.trim() || fallback
    return {
      modelLabel: provider.label || provider.model,
      providerId: provider.id,
      content,
      tokenEstimate: estimateTokens(content)
    }
  } catch {
    return {
      modelLabel: provider.label || provider.model,
      providerId: provider.id,
      content: fallback,
      tokenEstimate: estimateTokens(fallback)
    }
  }
}

const segmentSelectionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["selectedSegmentIds", "reasons"],
  properties: {
    selectedSegmentIds: {
      type: "array",
      items: {
        type: "string"
      }
    },
    reasons: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["segmentId", "reason"],
        properties: {
          segmentId: {
            type: "string"
          },
          reason: {
            type: "string"
          }
        }
      }
    }
  }
} as const

function heuristicSelectSegments(
  segments: PageDigestSegment[]
): SegmentSelectionResult {
  const selectedSegmentIds = segments
    .filter((segment) => {
      const text = segment.text.toLowerCase()
      return ![
        "advertisement",
        "sponsor",
        "推广",
        "广告",
        "相关阅读",
        "推荐阅读",
        "更多精彩",
        "扫码",
        "点击购买",
        "限时优惠"
      ].some((noise) => text.includes(noise))
    })
    .map((segment) => segment.id)

  return {
    modelLabel: "Heuristic",
    providerId: "",
    selectedSegmentIds,
    reasons: segments.map((segment) => ({
      segmentId: segment.id,
      reason: selectedSegmentIds.includes(segment.id)
        ? "保留为正文相关段落。"
        : "疑似广告、导流或与正文弱相关内容。"
    }))
  }
}

export async function selectRelevantSegments(
  segments: PageDigestSegment[],
  settings: SmartFavoritesSettings,
  providerId?: string
): Promise<SegmentSelectionResult> {
  const provider = resolveProvider(settings, providerId)

  if (!hasProviderConfig(provider)) {
    return heuristicSelectSegments(segments)
  }

  try {
    const result = await withAiRetry(() =>
      generateText({
        apiKey: provider.apiKey,
        baseURL: provider.baseUrl,
        model: provider.model,
        temperature: 0.2,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "segment_selection",
            strict: true,
            schema: segmentSelectionSchema
          }
        },
        messages: [
          {
            role: "system",
            content:
              "你是网页正文清洗助手。请从段落列表中保留与文章主线强相关的正文，剔除广告、导流、版权尾注、无关推荐、重复说明等内容。输出 JSON。"
          },
          {
            role: "user",
            content: segments
              .map(
                (segment, index) =>
                  `[${segment.id}] 段落 ${index + 1}\n${segment.text.slice(0, 1800)}`
              )
              .join("\n\n")
          }
        ]
      })
    )

    const parsed = parseJsonResponse(result.text || "") as {
      selectedSegmentIds?: string[]
      reasons?: Array<{
        segmentId?: string
        reason?: string
      }>
    }

    const selectedSegmentIds = (parsed.selectedSegmentIds ?? []).filter(
      (segmentId) => segments.some((segment) => segment.id === segmentId)
    )

    if (selectedSegmentIds.length === 0) {
      return heuristicSelectSegments(segments)
    }

    return {
      modelLabel: provider.label || provider.model,
      providerId: provider.id,
      selectedSegmentIds,
      reasons: (parsed.reasons ?? [])
        .filter((item): item is { segmentId: string; reason: string } =>
          Boolean(item.segmentId && item.reason)
        )
        .map((item) => ({
          segmentId: item.segmentId,
          reason: item.reason
        }))
    }
  } catch {
    return heuristicSelectSegments(segments)
  }
}

export {
  estimateTokens,
  resolveProvider,
  hasProviderConfig,
  getMissingProviderConfigFields,
  getProviderConfigNotice
}
