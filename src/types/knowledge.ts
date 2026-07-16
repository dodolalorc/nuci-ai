export interface Highlight {
  id: string
  text: string
  note?: string
  createdAt: number
}

export interface KnowledgeItem {
  id: string
  schemaVersion: 1

  title: string
  url: string
  siteName?: string

  sourceType: "page" | "selection" | "bookmark"
  content: string
  excerpt?: string

  summary?: string
  tags: string[]

  category: string
  subCategory?: string

  keyPoints?: string[]
  outline?: string[]
  learningNotes?: string
  highlights?: Highlight[]

  aiStatus: "pending" | "success" | "failed"
  favorite?: boolean
  archived?: boolean

  createdAt: number
  updatedAt: number
}

export const KNOWLEDGE_CATEGORIES = [
  "前端",
  "后端",
  "AI",
  "产品",
  "设计",
  "效率工具",
  "开源项目",
  "论文资料",
  "教程文档",
  "其他"
] as const

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number]

export interface KnowledgeQuery {
  keyword?: string
  category?: string
  tags?: string[]
  sourceType?: KnowledgeItem["sourceType"]
  createdAfter?: number
  createdBefore?: number
  favorite?: boolean
  archived?: boolean
  includeArchived?: boolean
  orderBy?: "createdAt" | "updatedAt"
  orderDir?: "asc" | "desc"
  limit?: number
  offset?: number
}

export interface QuickSavePayload {
  title: string
  url: string
  content: string
  excerpt?: string
  siteName?: string
  sourceType?: KnowledgeItem["sourceType"]
}

export type KnowledgeUpdatePatch = Pick<
  KnowledgeItem,
  | "title"
  | "content"
  | "excerpt"
  | "siteName"
  | "summary"
  | "tags"
  | "category"
  | "subCategory"
  | "keyPoints"
  | "outline"
  | "learningNotes"
  | "highlights"
  | "aiStatus"
  | "favorite"
  | "archived"
>

export interface AiQuickMeta {
  summary: string
  tags: string[]
  category: string
  subCategory?: string
}

export interface AiDeepNote extends AiQuickMeta {
  keyPoints: string[]
  outline: string[]
  learningNotes: string
  difficulty: "beginner" | "intermediate" | "advanced"
}
