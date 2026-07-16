import type {
  ApplyBookmarkPayload,
  BookmarkItem,
  BookmarkMoveDecision,
  BookmarkMutationResult,
  BulkBookmarkApplyResult,
  CapturedSnippet,
  CapturePageResponse,
  CollectionFolderMutationResult,
  CollectionItemMutationResult,
  CreateCollectionFolderPayload,
  CreateCollectionItemPayload,
  DeleteCollectionFolderPayload,
  DeleteCollectionItemPayload,
  ExperimentEvent,
  ExportSnapshot,
  HistoryRecommendationItem,
  ImportSnapshotResult,
  KnowledgeRecord,
  MoveCollectionItemPayload,
  PageCaptureDraft,
  PageDigestRequest,
  PageDigestResult,
  RecommendationInput,
  RecommendationResult,
  RecordExperimentEventPayload,
  SegmentSelectionResult,
  SmartFavoritesSettings,
  SnippetCollectionState,
  UpdateActiveProviderPayload,
  UpdateCapturedSnippetTagsPayload,
  UpdateCollectionFolderPayload,
  UpdateCollectionItemPayload
} from "~/src/sdk/types"
import type { KnowledgeItem } from "~/src/types/knowledge"

async function sendRuntimeMessage<T>(
  type: string,
  payload?: unknown
): Promise<T> {
  const response = await chrome.runtime.sendMessage({
    type,
    payload
  })

  if (!response?.ok) {
    throw new Error(response?.error || "Runtime message failed")
  }

  return response.payload as T
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  })

  return tab
}

export class SmartFavoritesSDK {
  async getSettings() {
    return sendRuntimeMessage<SmartFavoritesSettings>(
      "bookmarks-collector/get-settings"
    )
  }

  async saveSettings(settings: SmartFavoritesSettings) {
    return sendRuntimeMessage<{ success: boolean }>(
      "bookmarks-collector/save-settings",
      settings
    )
  }

  async summarizePageContent(payload: PageDigestRequest) {
    return sendRuntimeMessage<PageDigestResult>(
      "bookmarks-collector/summarize-page-content",
      payload
    )
  }

  async selectRelevantSegments(payload: PageDigestRequest) {
    return sendRuntimeMessage<SegmentSelectionResult>(
      "bookmarks-collector/select-relevant-segments",
      payload
    )
  }

  async captureActivePage(): Promise<CapturePageResponse> {
    const tab = await getActiveTab()

    if (!tab?.id || !tab.url) {
      throw new Error("当前没有可读取的网页标签页。")
    }

    if (
      tab.url.startsWith("chrome://") ||
      tab.url.startsWith("edge://") ||
      tab.url.startsWith("about:")
    ) {
      return {
        page: {
          title: tab.title || "系统页面",
          url: tab.url,
          domain: "system-page",
          summary: ""
        },
        selectionText: "",
        snippets: [],
        extractedAt: new Date().toISOString()
      }
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "bookmarks-collector/capture-page"
    })

    if (!response?.page) {
      throw new Error("无法从当前页面抓取内容，请刷新页面后重试。")
    }

    return response as CapturePageResponse
  }

  async recommendFolders(input: RecommendationInput) {
    return sendRuntimeMessage<RecommendationResult>(
      "bookmarks-collector/recommend",
      input
    )
  }

  async applyBookmarkRecommendation(payload: ApplyBookmarkPayload) {
    return sendRuntimeMessage<BookmarkMutationResult>(
      "bookmarks-collector/apply-bookmark",
      payload
    )
  }

  async exportSnapshot() {
    return sendRuntimeMessage<ExportSnapshot>(
      "bookmarks-collector/export-snapshot"
    )
  }

  async importSnapshot(snapshot: ExportSnapshot) {
    return sendRuntimeMessage<ImportSnapshotResult>(
      "bookmarks-collector/import-snapshot",
      snapshot
    )
  }

  async listHistoryBookmarks(limit = 40) {
    return sendRuntimeMessage<HistoryRecommendationItem[]>(
      "bookmarks-collector/list-history-bookmarks",
      { limit }
    )
  }

  async applyBulkBookmarkRecommendations(decisions: BookmarkMoveDecision[]) {
    return sendRuntimeMessage<BulkBookmarkApplyResult>(
      "bookmarks-collector/apply-bulk-bookmarks",
      { decisions }
    )
  }

  async openExtensionPage(path: string) {
    return sendRuntimeMessage<{ success: boolean }>(
      "bookmarks-collector/open-extension-page",
      { path }
    )
  }

  async updateActiveProvider(payload: UpdateActiveProviderPayload) {
    return sendRuntimeMessage<SmartFavoritesSettings>(
      "bookmarks-collector/update-active-provider",
      payload
    )
  }

  async getSnippetCollections() {
    return sendRuntimeMessage<SnippetCollectionState>(
      "bookmarks-collector/get-snippet-collections"
    )
  }

  async getKnowledgeRecords() {
    return sendRuntimeMessage<KnowledgeRecord[]>(
      "bookmarks-collector/get-knowledge-records"
    )
  }

  async listKnowledgeItems() {
    return sendRuntimeMessage<KnowledgeItem[]>("knowledge/list", {
      orderBy: "createdAt",
      orderDir: "desc",
      includeArchived: true
    })
  }

  async getExperimentEvents() {
    return sendRuntimeMessage<ExperimentEvent[]>(
      "bookmarks-collector/get-experiment-events"
    )
  }

  async recordExperimentEvent(payload: RecordExperimentEventPayload) {
    return sendRuntimeMessage<ExperimentEvent[]>(
      "bookmarks-collector/record-experiment-event",
      payload
    )
  }

  async updateCapturedSnippetTags(payload: UpdateCapturedSnippetTagsPayload) {
    return sendRuntimeMessage<PageCaptureDraft>(
      "bookmarks-collector/update-captured-snippet-tags",
      payload
    )
  }

  async createSnippetFolder(payload: CreateCollectionFolderPayload) {
    return sendRuntimeMessage<CollectionFolderMutationResult>(
      "bookmarks-collector/create-snippet-folder",
      payload
    )
  }

  async updateSnippetFolder(payload: UpdateCollectionFolderPayload) {
    return sendRuntimeMessage<CollectionFolderMutationResult>(
      "bookmarks-collector/update-snippet-folder",
      payload
    )
  }

  async deleteSnippetFolder(payload: DeleteCollectionFolderPayload) {
    return sendRuntimeMessage<CollectionFolderMutationResult>(
      "bookmarks-collector/delete-snippet-folder",
      payload
    )
  }

  async updateSnippetCollectionItem(payload: UpdateCollectionItemPayload) {
    return sendRuntimeMessage<CollectionItemMutationResult>(
      "bookmarks-collector/update-snippet-item",
      payload
    )
  }

  async createSnippetCollectionItem(payload: CreateCollectionItemPayload) {
    return sendRuntimeMessage<CollectionItemMutationResult>(
      "bookmarks-collector/create-snippet-item",
      payload
    )
  }

  async moveSnippetCollectionItem(payload: MoveCollectionItemPayload) {
    return sendRuntimeMessage<CollectionItemMutationResult>(
      "bookmarks-collector/move-snippet-item",
      payload
    )
  }

  async deleteSnippetCollectionItem(payload: DeleteCollectionItemPayload) {
    return sendRuntimeMessage<CollectionItemMutationResult>(
      "bookmarks-collector/delete-snippet-item",
      payload
    )
  }
}
