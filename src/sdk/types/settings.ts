import type { KnowledgeItem } from "~/src/types/knowledge"

import type { ExperimentEvent } from "./analytics"
import type { BookmarkFolder, SnippetCollectionState } from "./bookmarks"
import type { PageCaptureDraft } from "./page"

export interface AiProviderSettings {
  baseUrl: string
  apiKey: string
  model: string
}

export interface AiModelProfile extends AiProviderSettings {
  id: string
  label: string
}

export interface PromptSettings {
  system: string
  template: string
}

export interface BehaviorSettings {
  allowCreateFolder: boolean
  preferExistingFolder: boolean
  storeKnowledge: boolean
}

export interface SmartFavoritesSettings {
  provider: AiProviderSettings
  providers: AiModelProfile[]
  activeProviderId: string
  prompts: PromptSettings
  behavior: BehaviorSettings
}

export interface KnowledgeRecord {
  createdAt: string
  title: string
  url: string
  folderPath: string
  tags: string[]
  selectedText?: string
  notes?: string
  source: string
}

export interface ExportSnapshot {
  schemaVersion?: 2
  exportedAt: string
  settings: SmartFavoritesSettings
  /** Legacy bookmark knowledge data, retained for imports created before v2. */
  knowledge: KnowledgeRecord[]
  knowledgeItems?: KnowledgeItem[]
  analytics: ExperimentEvent[]
  folders: BookmarkFolder[]
  drafts: PageCaptureDraft[]
  collections: SnippetCollectionState
}

export interface ImportSnapshotResult {
  settingsImported: boolean
  knowledgeCount: number
  draftCount: number
  collectionFolderCount: number
  collectionItemCount: number
  analyticsCount?: number
}
