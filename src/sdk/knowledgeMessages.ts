import type {
  KnowledgeItem,
  KnowledgeQuery,
  KnowledgeUpdatePatch,
  QuickSavePayload
} from "~/src/types/knowledge"

export const KNOWLEDGE_MESSAGE = {
  quickSave: "knowledge/quick-save",
  generateQuickMeta: "knowledge/generate-quick-meta",
  saveWithMeta: "knowledge/save-with-meta",
  saveSelection: "knowledge/save-selection",
  list: "knowledge/list",
  update: "knowledge/update",
  remove: "knowledge/delete",
  retryAi: "knowledge/retry-ai",
  getTodayCount: "knowledge/get-today-count",
  getRecent: "knowledge/get-recent",
  openKnowledgeBase: "knowledge/open-knowledge-base"
} as const

type QuickMeta = {
  summary: string
  tags: string[]
  category: string
  subCategory?: string
}

export interface KnowledgeMessageMap {
  [KNOWLEDGE_MESSAGE.quickSave]: {
    request: QuickSavePayload
    response: KnowledgeItem
  }
  [KNOWLEDGE_MESSAGE.generateQuickMeta]: {
    request: QuickSavePayload
    response: QuickMeta
  }
  [KNOWLEDGE_MESSAGE.saveWithMeta]: {
    request: QuickSavePayload & Partial<QuickMeta>
    response: KnowledgeItem
  }
  [KNOWLEDGE_MESSAGE.saveSelection]: {
    request: QuickSavePayload & { selectedText: string }
    response: KnowledgeItem
  }
  [KNOWLEDGE_MESSAGE.list]: {
    request: KnowledgeQuery
    response: KnowledgeItem[]
  }
  [KNOWLEDGE_MESSAGE.update]: {
    request: { id: string } & Partial<KnowledgeUpdatePatch>
    response: KnowledgeItem | null
  }
  [KNOWLEDGE_MESSAGE.remove]: {
    request: { id: string }
    response: boolean
  }
  [KNOWLEDGE_MESSAGE.retryAi]: {
    request: { id: string }
    response: KnowledgeItem | null
  }
  [KNOWLEDGE_MESSAGE.getTodayCount]: {
    request: undefined
    response: number
  }
  [KNOWLEDGE_MESSAGE.getRecent]: {
    request: { limit?: number } | undefined
    response: KnowledgeItem[]
  }
  [KNOWLEDGE_MESSAGE.openKnowledgeBase]: {
    request: undefined
    response: { success: boolean }
  }
}

export type KnowledgeMessageType = keyof KnowledgeMessageMap

export async function sendKnowledgeMessage<T extends KnowledgeMessageType>(
  type: T,
  payload: KnowledgeMessageMap[T]["request"]
): Promise<KnowledgeMessageMap[T]["response"]> {
  const response = await chrome.runtime.sendMessage({ type, payload })
  if (!response?.ok) {
    throw new Error(response?.error || "知识库操作失败")
  }
  return response.payload as KnowledgeMessageMap[T]["response"]
}
