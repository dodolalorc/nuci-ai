import type {
  BookmarkItem,
  BookmarkMutationResult,
  SnippetCollectionState
} from "./bookmarks"
import type { PageContext } from "./page"

export type RecommendationSource = "heuristic" | "ai"

export interface RecommendationInput {
  page: PageContext
  selectedText?: string
  tags: string[]
  notes?: string
}

export interface FolderSuggestion {
  key: string
  type: "existing" | "create"
  folderId?: string
  title: string
  path: string
  score: number
  reason: string
}

export interface RecommendationResult {
  source: RecommendationSource
  suggestions: FolderSuggestion[]
}

export interface RecommendationFeedbackEntry {
  folderPath: string
  domain?: string
  tokens: string[]
  createdAt: string
}

export interface ApplyBookmarkPayload {
  page: PageContext
  input: RecommendationInput
  recommendation: FolderSuggestion
}

export interface HistoryRecommendationItem {
  bookmark: BookmarkItem
  recommendation: RecommendationResult
}

export interface HistoryRecommendationRequest {
  bookmarkIds?: string[]
  limit?: number
}

export interface BookmarkMoveDecision {
  bookmarkId: string
  recommendation: FolderSuggestion
}

export interface BulkBookmarkApplyPayload {
  decisions: BookmarkMoveDecision[]
}

export interface BulkBookmarkApplyResult {
  moved: number
  results: BookmarkMutationResult[]
  undoOperationId?: string
}

export interface BookmarkUndoEntry {
  bookmarkId: string
  parentId: string
  index?: number
}

export interface BookmarkUndoOperation {
  id: string
  createdAt: string
  entries: BookmarkUndoEntry[]
}

export interface BookmarkUndoResult {
  restored: number
  skipped: number
}

export interface CreateCollectionFolderPayload {
  name: string
  description?: string
}

export interface UpdateCollectionFolderPayload {
  folderId: string
  name: string
  description?: string
}

export interface DeleteCollectionFolderPayload {
  folderId: string
}

export interface UpdateCollectionItemPayload {
  itemId: string
  title: string
  text: string
}

export interface CreateCollectionItemPayload {
  folderId: string
  title: string
  text: string
  sourceUrl?: string
}

export interface MoveCollectionItemPayload {
  itemId: string
  folderId: string
}

export interface DeleteCollectionItemPayload {
  itemId: string
}

export interface CollectionFolderMutationResult {
  collections: SnippetCollectionState
  folderId: string
}

export interface CollectionItemMutationResult {
  collections: SnippetCollectionState
  itemId: string
}

export interface UpdateActiveProviderPayload {
  providerId: string
}
