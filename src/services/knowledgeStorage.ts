import { STORAGE_KEYS } from "~/src/sdk/constants"
import type { KnowledgeRecord } from "~/src/sdk/types"
import type {
  KnowledgeItem,
  KnowledgeQuery,
  KnowledgeUpdatePatch
} from "~/src/types/knowledge"

async function getLocal<T>(key: string, fallback: T): Promise<T> {
  const result = await chrome.storage.local.get(key)
  return (result[key] as T | undefined) ?? fallback
}

function toLegacyItem(record: KnowledgeRecord, index: number): KnowledgeItem {
  const createdAt = Date.parse(record.createdAt) || Date.now() - index
  return {
    id: `legacy-${createdAt}-${index}`,
    schemaVersion: 1,
    title: record.title || "未命名网页",
    url: record.url,
    siteName: safeHostname(record.url),
    sourceType: "bookmark",
    content: record.selectedText || record.notes || "",
    excerpt: record.notes,
    tags: record.tags ?? [],
    category: record.folderPath || "其他",
    aiStatus: "pending",
    createdAt,
    updatedAt: createdAt
  }
}

function safeHostname(url: string): string | undefined {
  try {
    return new URL(url).hostname
  } catch {
    return undefined
  }
}

async function getAllItems(): Promise<KnowledgeItem[]> {
  const items = await getLocal<KnowledgeItem[]>(STORAGE_KEYS.knowledgeItems, [])
  const legacy = await getLocal<KnowledgeRecord[]>(STORAGE_KEYS.knowledge, [])
  const urls = new Set(items.map((item) => item.url).filter(Boolean))
  const migrated = legacy
    .filter((record) => record.url && !urls.has(record.url))
    .map(toLegacyItem)

  if (migrated.length === 0) return items

  const merged = [...items, ...migrated]
  await saveAllItems(merged)
  return merged
}

async function saveAllItems(items: KnowledgeItem[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.knowledgeItems]: items })
}

function generateId(): string {
  return `ki-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export const knowledgeStorage = {
  async create(
    payload: Omit<KnowledgeItem, "id" | "createdAt" | "updatedAt">
  ): Promise<KnowledgeItem> {
    const now = Date.now()
    const item: KnowledgeItem = {
      ...payload,
      id: generateId(),
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now
    }
    const items = await getAllItems()
    items.unshift(item)
    await saveAllItems(items)
    return item
  },

  async upsertByUrl(
    payload: Omit<
      KnowledgeItem,
      "id" | "schemaVersion" | "createdAt" | "updatedAt"
    >
  ): Promise<KnowledgeItem> {
    const items = await getAllItems()
    const index = items.findIndex(
      (item) =>
        item.url === payload.url && item.sourceType === payload.sourceType
    )
    if (index === -1) return this.create(payload)

    const current = items[index]
    const preserveExistingAiResult =
      payload.aiStatus === "pending" && current.aiStatus === "success"
    const updated: KnowledgeItem = {
      ...current,
      ...payload,
      id: current.id,
      schemaVersion: 1,
      favorite: current.favorite,
      archived: current.archived,
      summary: preserveExistingAiResult ? current.summary : payload.summary,
      tags: preserveExistingAiResult ? current.tags : payload.tags,
      category: preserveExistingAiResult ? current.category : payload.category,
      subCategory: preserveExistingAiResult
        ? current.subCategory
        : payload.subCategory,
      aiStatus: preserveExistingAiResult ? current.aiStatus : payload.aiStatus,
      createdAt: current.createdAt,
      updatedAt: Date.now()
    }
    items[index] = updated
    await saveAllItems(items)
    return updated
  },

  async update(
    id: string,
    patch: Partial<KnowledgeUpdatePatch>
  ): Promise<KnowledgeItem | null> {
    const items = await getAllItems()
    const index = items.findIndex((item) => item.id === id)
    if (index === -1) return null

    const updated = { ...items[index], ...patch, id, updatedAt: Date.now() }
    items[index] = updated
    await saveAllItems(items)
    return updated
  },

  async delete(id: string): Promise<boolean> {
    const items = await getAllItems()
    const filtered = items.filter((item) => item.id !== id)
    if (filtered.length === items.length) return false
    await saveAllItems(filtered)
    return true
  },

  async getById(id: string): Promise<KnowledgeItem | null> {
    const items = await getAllItems()
    return items.find((item) => item.id === id) ?? null
  },

  async list(query: KnowledgeQuery = {}): Promise<KnowledgeItem[]> {
    let items = await getAllItems()

    if (query.keyword) {
      const kw = query.keyword.toLowerCase()
      items = items.filter(
        (item) =>
          item.title.toLowerCase().includes(kw) ||
          item.summary?.toLowerCase().includes(kw) ||
          item.url.toLowerCase().includes(kw) ||
          item.tags.some((tag) => tag.toLowerCase().includes(kw)) ||
          item.category.toLowerCase().includes(kw)
      )
    }

    if (query.category) {
      items = items.filter((item) => item.category === query.category)
    }

    if (query.tags?.length) {
      items = items.filter((item) =>
        query.tags!.every((tag) => item.tags.includes(tag))
      )
    }

    if (query.sourceType) {
      items = items.filter((item) => item.sourceType === query.sourceType)
    }

    if (query.favorite !== undefined) {
      items = items.filter((item) => Boolean(item.favorite) === query.favorite)
    }

    if (query.archived !== undefined) {
      items = items.filter((item) => Boolean(item.archived) === query.archived)
    } else if (!query.includeArchived) {
      items = items.filter((item) => !item.archived)
    }

    const orderBy = query.orderBy ?? "createdAt"
    const orderDir = query.orderDir ?? "desc"
    items.sort((a, b) => {
      const diff = a[orderBy] - b[orderBy]
      return orderDir === "desc" ? -diff : diff
    })

    if (query.offset) {
      items = items.slice(query.offset)
    }

    if (query.limit) {
      items = items.slice(0, query.limit)
    }

    return items
  },

  async search(keyword: string): Promise<KnowledgeItem[]> {
    return this.list({ keyword })
  },

  async getTodayCount(): Promise<number> {
    const items = await getAllItems()
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    return items.filter((item) => item.createdAt >= todayStart.getTime()).length
  }
}
