import { generateText } from "@xsai/generate-text"

import type { SmartFavoritesSettings } from "~/src/sdk/types"
import type {
  AiDeepNote,
  AiQuickMeta,
  KnowledgeItem
} from "~/src/types/knowledge"
import { KNOWLEDGE_CATEGORIES } from "~/src/types/knowledge"

const QUICK_SAVE_SYSTEM_PROMPT = `你是一个网页知识整理助手。请根据网页标题和正文内容，生成适合个人知识库保存的信息。必须返回 JSON，不要返回 Markdown。`

const QUICK_SAVE_USER_PROMPT = (title: string, content: string) => `
标题：${title}

正文内容（截取前3000字）：
${content.slice(0, 3000)}

请返回如下 JSON 格式（摘要100-200字，标签3-5个，分类从列表中选一个）：
{
  "summary": "",
  "tags": [],
  "category": "${KNOWLEDGE_CATEGORIES.join(" | ")}",
  "subCategory": ""
}
`

const DEEP_NOTE_SYSTEM_PROMPT = `你是一个个人知识库整理助手。请将网页内容整理成结构化学习笔记。必须返回 JSON，不要返回 Markdown。`

const DEEP_NOTE_USER_PROMPT = (title: string, content: string) => `
标题：${title}

正文内容（截取前5000字）：
${content.slice(0, 5000)}

请返回如下 JSON 格式：
{
  "summary": "",
  "keyPoints": [],
  "outline": [],
  "learningNotes": "",
  "tags": [],
  "category": "${KNOWLEDGE_CATEGORIES.join(" | ")}",
  "subCategory": "",
  "difficulty": "beginner | intermediate | advanced"
}
`

export function parseAiJsonResponse(content: string): unknown {
  const normalized = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim()
  const start = normalized.indexOf("{")
  const end = normalized.lastIndexOf("}")

  if (start === -1) {
    throw new Error("AI 响应中没有合法 JSON")
  }

  if (end < start) {
    throw new Error("AI 响应 JSON 解析失败")
  }

  try {
    return JSON.parse(normalized.slice(start, end + 1))
  } catch {
    throw new Error("AI 响应 JSON 解析失败")
  }
}

function resolveActiveProvider(settings: SmartFavoritesSettings) {
  const providers = settings.providers?.length ? settings.providers : []
  return (
    providers.find((p) => p.id === settings.activeProviderId) ??
    providers[0] ??
    settings.provider
  )
}

export const aiService = {
  async generateQuickMeta(
    title: string,
    content: string,
    settings: SmartFavoritesSettings
  ): Promise<AiQuickMeta> {
    const provider = resolveActiveProvider(settings)

    if (!provider?.apiKey || !provider?.baseUrl || !provider?.model) {
      throw new Error("未配置 AI 模型，请前往设置页配置 API Key。")
    }

    const result = await generateText({
      apiKey: provider.apiKey,
      baseURL: provider.baseUrl,
      model: provider.model,
      temperature: 0.3,
      messages: [
        { role: "system", content: QUICK_SAVE_SYSTEM_PROMPT },
        { role: "user", content: QUICK_SAVE_USER_PROMPT(title, content) }
      ]
    })

    const parsed = parseAiJsonResponse(result.text) as Partial<AiQuickMeta>

    return {
      summary: parsed.summary ?? "",
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : [],
      category: parsed.category ?? "其他",
      subCategory: parsed.subCategory
    }
  },

  async generateDeepNote(
    title: string,
    content: string,
    settings: SmartFavoritesSettings
  ): Promise<AiDeepNote> {
    const provider = resolveActiveProvider(settings)

    if (!provider?.apiKey || !provider?.baseUrl || !provider?.model) {
      throw new Error("未配置 AI 模型，请前往设置页配置 API Key。")
    }

    const result = await generateText({
      apiKey: provider.apiKey,
      baseURL: provider.baseUrl,
      model: provider.model,
      temperature: 0.3,
      messages: [
        { role: "system", content: DEEP_NOTE_SYSTEM_PROMPT },
        { role: "user", content: DEEP_NOTE_USER_PROMPT(title, content) }
      ]
    })

    const parsed = parseAiJsonResponse(result.text) as Partial<AiDeepNote>

    return {
      summary: parsed.summary ?? "",
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : [],
      category: parsed.category ?? "其他",
      subCategory: parsed.subCategory,
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
      outline: Array.isArray(parsed.outline) ? parsed.outline : [],
      learningNotes: parsed.learningNotes ?? "",
      difficulty: parsed.difficulty ?? "intermediate"
    }
  },

  async regenerateSummary(
    item: KnowledgeItem,
    settings: SmartFavoritesSettings
  ): Promise<string> {
    const meta = await this.generateQuickMeta(
      item.title,
      item.content,
      settings
    )
    return meta.summary
  },

  async generateTags(
    item: KnowledgeItem,
    settings: SmartFavoritesSettings
  ): Promise<string[]> {
    const meta = await this.generateQuickMeta(
      item.title,
      item.content,
      settings
    )
    return meta.tags
  }
}
