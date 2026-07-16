import { getSettings } from "~/src/sdk/storage"
import { aiService } from "~/src/services/aiService"
import { knowledgeStorage } from "~/src/services/knowledgeStorage"
import type {
  KnowledgeUpdatePatch,
  QuickSavePayload
} from "~/src/types/knowledge"

type AiMeta = {
  summary: string
  tags: string[]
  category: string
  subCategory?: string
}

function emptyMeta(): AiMeta {
  return { summary: "", tags: [], category: "其他" }
}

export function normalizeKnowledgePage(
  payload: Partial<QuickSavePayload>
): QuickSavePayload {
  const title = payload.title?.trim()
  const url = payload.url?.trim()
  const content = payload.content?.trim()

  if (!title || !url || !content) {
    throw new Error("页面内容不完整，请刷新页面后重试。")
  }

  try {
    const parsed = new URL(url)
    if (!/^https?:$/.test(parsed.protocol)) throw new Error()
  } catch {
    throw new Error("当前页面链接不可保存。")
  }

  return {
    title: title.slice(0, 500),
    url,
    content: content.slice(0, 32_000),
    excerpt: payload.excerpt?.trim().slice(0, 1_000),
    siteName: payload.siteName?.trim().slice(0, 200),
    sourceType: payload.sourceType ?? "page"
  }
}

export function pickKnowledgeUpdate(
  payload: unknown
): Partial<KnowledgeUpdatePatch> {
  const input = payload as Record<string, unknown>
  const allowed = [
    "title",
    "content",
    "excerpt",
    "siteName",
    "summary",
    "tags",
    "category",
    "subCategory",
    "keyPoints",
    "outline",
    "learningNotes",
    "highlights",
    "aiStatus",
    "favorite",
    "archived"
  ] as const

  return Object.fromEntries(
    allowed.filter((key) => key in input).map((key) => [key, input[key]])
  ) as Partial<KnowledgeUpdatePatch>
}

async function generateMeta(page: QuickSavePayload): Promise<AiMeta> {
  try {
    return await aiService.generateQuickMeta(
      page.title,
      page.content,
      await getSettings()
    )
  } catch {
    return emptyMeta()
  }
}

export async function quickSaveKnowledge(payload: Partial<QuickSavePayload>) {
  const page = normalizeKnowledgePage(payload)
  const meta = await generateMeta(page)

  return knowledgeStorage.upsertByUrl({
    ...page,
    sourceType: page.sourceType ?? "page",
    summary: meta.summary || undefined,
    tags: meta.tags,
    category: meta.category,
    subCategory: meta.subCategory,
    aiStatus: meta.summary ? "success" : "pending"
  })
}

export async function generateQuickMeta(payload: Partial<QuickSavePayload>) {
  const page = normalizeKnowledgePage(payload)
  const settings = await getSettings()
  return aiService.generateQuickMeta(page.title, page.content, settings)
}

export async function saveKnowledgeWithMeta(
  payload: Partial<QuickSavePayload> & {
    summary?: string
    tags?: string[]
    category?: string
  }
) {
  const page = normalizeKnowledgePage(payload)
  return knowledgeStorage.upsertByUrl({
    ...page,
    title: payload.title?.trim() || page.title,
    sourceType: page.sourceType ?? "page",
    summary: payload.summary?.trim(),
    tags: payload.tags ?? [],
    category: payload.category?.trim() || "其他",
    aiStatus: "success"
  })
}

export async function saveKnowledgeSelection(
  payload: { selectedText: string } & Partial<QuickSavePayload>
) {
  const page = normalizeKnowledgePage({
    ...payload,
    content: payload.selectedText,
    sourceType: "selection"
  })
  const meta = await generateMeta(page)

  return knowledgeStorage.upsertByUrl({
    ...page,
    sourceType: "selection",
    summary: meta.summary || undefined,
    tags: meta.tags,
    category: meta.category,
    subCategory: meta.subCategory,
    aiStatus: meta.summary ? "success" : "pending"
  })
}

export async function retryKnowledgeAi(id: string) {
  const item = await knowledgeStorage.getById(id)
  if (!item) throw new Error("知识条目不存在")

  const settings = await getSettings()
  const meta = await aiService.generateQuickMeta(
    item.title,
    item.content,
    settings
  )
  return knowledgeStorage.update(id, {
    summary: meta.summary,
    tags: meta.tags,
    category: meta.category,
    subCategory: meta.subCategory,
    aiStatus: "success"
  })
}
