import {
  applyBookmarkDecision,
  applyBulkBookmarkDecisions,
  buildExportSnapshot,
  buildFolderIndex,
  listBookmarks
} from "~/src/sdk/bookmarks"
import { recommendFolders } from "~/src/sdk/folder-recommender"
import {
  extractAiRecommendations,
  hasProviderConfig,
  selectRelevantSegments,
  summarizePageContent
} from "~/src/sdk/provider"
import {
  addCapturedSnippet,
  addSnippetCollectionItem,
  clearCaptureDraft,
  createSnippetFolder,
  deleteSnippetCollectionItem,
  deleteSnippetFolder,
  getCaptureDraft,
  getExperimentEvents,
  getKnowledgeRecords,
  getRecommendationFeedback,
  getSettings,
  getSnippetCollections,
  importSnapshotData,
  moveSnippetCollectionItem,
  pushRecommendationFeedback,
  recordExperimentEvent,
  removeCapturedSnippet,
  saveSettings,
  updateCapturedSnippet,
  updateSnippetCollectionItem,
  updateSnippetFolder
} from "~/src/sdk/storage"
import type {
  ApplyBookmarkPayload,
  BookmarkMoveDecision,
  BulkBookmarkApplyPayload,
  BulkBookmarkApplyResult,
  CapturedSnippet,
  CollectionFolderMutationResult,
  CollectionItemMutationResult,
  CreateCollectionFolderPayload,
  CreateCollectionItemPayload,
  DeleteCollectionFolderPayload,
  DeleteCollectionItemPayload,
  ExperimentEvent,
  ExportSnapshot,
  ExtensionPageOpenPayload,
  HistoryRecommendationItem,
  HistoryRecommendationRequest,
  ImportSnapshotResult,
  MoveCollectionItemPayload,
  PageCaptureDraft,
  PageDigestRequest,
  RecommendationInput,
  RecommendationResult,
  RecordExperimentEventPayload,
  SegmentSelectionResult,
  SmartFavoritesSettings,
  UpdateActiveProviderPayload,
  UpdateCollectionFolderPayload,
  UpdateCollectionItemPayload
} from "~/src/sdk/types"
import {
  createCollectionFolder,
  createCollectionItem,
  deleteCollectionFolder,
  deleteCollectionItem,
  moveCollectionItem,
  updateCollectionFolder,
  updateCollectionItem
} from "~/src/services/collectionService"
import {
  generateQuickMeta,
  pickKnowledgeUpdate,
  quickSaveKnowledge,
  retryKnowledgeAi,
  saveConfirmedBookmarkKnowledge,
  saveKnowledgeSelection,
  saveKnowledgeWithMeta
} from "~/src/services/knowledgeService"
import { knowledgeStorage } from "~/src/services/knowledgeStorage"
import {
  analyzeAllCapturedSnippets,
  analyzeCapturedSnippet,
  updateCapturedSnippetTags
} from "~/src/services/snippetService"
import type { KnowledgeQuery, QuickSavePayload } from "~/src/types/knowledge"

chrome.bookmarks.onCreated.addListener((_, node) => {
  if (!node.url?.startsWith("http")) {
    return
  }

  void notifyBookmarkCreated(node.url)
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void handleMessage(message)
    .then((payload) => sendResponse({ ok: true, payload }))
    .catch((error) => {
      const fallback =
        error instanceof Error ? error.message : "Unknown background error"
      sendResponse({ ok: false, error: fallback })
    })

  return true
})

async function handleMessage(message: { type: string; payload?: unknown }) {
  switch (message.type) {
    case "bookmarks-collector/get-settings":
      return getSettings()
    case "bookmarks-collector/save-settings":
      await saveSettings(message.payload as SmartFavoritesSettings)
      return { success: true }
    case "bookmarks-collector/update-active-provider":
      return handleUpdateActiveProvider(
        message.payload as UpdateActiveProviderPayload
      )
    case "bookmarks-collector/recommend":
      return handleRecommendation(message.payload as RecommendationInput)
    case "bookmarks-collector/summarize-page-content":
      return handleSummarizePageContent(message.payload as PageDigestRequest)
    case "bookmarks-collector/select-relevant-segments":
      return handleSelectRelevantSegments(message.payload as PageDigestRequest)
    case "bookmarks-collector/apply-bookmark":
      return handleApplyBookmark(message.payload as ApplyBookmarkPayload)
    case "bookmarks-collector/export-snapshot":
      return handleExport()
    case "bookmarks-collector/import-snapshot":
      return handleImportSnapshot(message.payload as ExportSnapshot)
    case "bookmarks-collector/get-capture-draft":
      return getCaptureDraft(message.payload as string)
    case "bookmarks-collector/add-captured-snippet":
      return handleAddCapturedSnippet(
        message.payload as {
          url: string
          snippet: CapturedSnippet
        }
      )
    case "bookmarks-collector/remove-captured-snippet":
      return handleRemoveCapturedSnippet(
        message.payload as {
          url: string
          snippetId: string
        }
      )
    case "bookmarks-collector/analyze-captured-snippet":
      return analyzeCapturedSnippet(
        message.payload as {
          url: string
          snippetId: string
        }
      )
    case "bookmarks-collector/update-captured-snippet-tags":
      return updateCapturedSnippetTags(
        message.payload as {
          url: string
          snippetId: string
          tags: string[]
        }
      )
    case "bookmarks-collector/analyze-all-captured-snippets":
      return analyzeAllCapturedSnippets(
        message.payload as {
          url: string
          force?: boolean
        }
      )
    case "bookmarks-collector/clear-capture-draft":
      await clearCaptureDraft(message.payload as string)
      return { success: true }
    case "bookmarks-collector/list-history-bookmarks":
      return handleListHistoryBookmarks(
        message.payload as HistoryRecommendationRequest | undefined
      )
    case "bookmarks-collector/apply-bulk-bookmarks":
      return handleApplyBulkBookmarks(
        message.payload as BulkBookmarkApplyPayload
      )
    case "bookmarks-collector/open-extension-page":
      return handleOpenExtensionPage(
        message.payload as ExtensionPageOpenPayload
      )
    case "bookmarks-collector/get-snippet-collections":
      return getSnippetCollections()
    case "bookmarks-collector/get-knowledge-records":
      return getKnowledgeRecords()
    case "bookmarks-collector/get-experiment-events":
      return getExperimentEvents()
    case "bookmarks-collector/record-experiment-event":
      return handleRecordExperimentEvent(
        message.payload as RecordExperimentEventPayload
      )
    case "bookmarks-collector/create-snippet-folder":
      return createCollectionFolder(
        message.payload as CreateCollectionFolderPayload
      )
    case "bookmarks-collector/update-snippet-folder":
      return updateCollectionFolder(
        message.payload as UpdateCollectionFolderPayload
      )
    case "bookmarks-collector/delete-snippet-folder":
      return deleteCollectionFolder(
        message.payload as DeleteCollectionFolderPayload
      )
    case "bookmarks-collector/update-snippet-item":
      return updateCollectionItem(
        message.payload as UpdateCollectionItemPayload
      )
    case "bookmarks-collector/create-snippet-item":
      return createCollectionItem(
        message.payload as CreateCollectionItemPayload
      )
    case "bookmarks-collector/move-snippet-item":
      return moveCollectionItem(message.payload as MoveCollectionItemPayload)
    case "bookmarks-collector/delete-snippet-item":
      return deleteCollectionItem(
        message.payload as DeleteCollectionItemPayload
      )

    // ── Knowledge Base (new) ──────────────────────────────
    case "knowledge/quick-save":
      return quickSaveKnowledge(message.payload as Partial<QuickSavePayload>)
    case "knowledge/generate-quick-meta":
      return generateQuickMeta(message.payload as Partial<QuickSavePayload>)
    case "knowledge/save-with-meta":
      return saveKnowledgeWithMeta(
        message.payload as Partial<QuickSavePayload> & {
          summary?: string
          tags?: string[]
          category?: string
        }
      )
    case "knowledge/save-selection":
      return saveKnowledgeSelection(message.payload as { selectedText: string })
    case "knowledge/list":
      return knowledgeStorage.list(message.payload as KnowledgeQuery)
    case "knowledge/update":
      return knowledgeStorage.update(
        (message.payload as { id: string }).id,
        pickKnowledgeUpdate(message.payload)
      )
    case "knowledge/delete":
      return knowledgeStorage.delete((message.payload as { id: string }).id)
    case "knowledge/retry-ai":
      return retryKnowledgeAi((message.payload as { id: string }).id)
    case "knowledge/get-today-count":
      return knowledgeStorage.getTodayCount()
    case "knowledge/get-recent":
      return knowledgeStorage.list({
        orderBy: "createdAt",
        orderDir: "desc",
        limit: (message.payload as { limit?: number })?.limit ?? 3
      })
    case "knowledge/open-knowledge-base":
      await handleOpenExtensionPage({ path: "tabs/manage.html#knowledge-base" })
      return { success: true }

    default:
      throw new Error(`Unsupported message type: ${message.type}`)
  }
}

async function handleRecommendation(
  input: RecommendationInput
): Promise<RecommendationResult> {
  const [settings, folderIndex, feedbackEntries] = await Promise.all([
    getSettings(),
    buildFolderIndex(),
    getRecommendationFeedback()
  ])

  const baseRecommendation = recommendFolders(
    input,
    folderIndex,
    settings,
    feedbackEntries
  )
  const activeProvider =
    settings.providers.find(
      (provider) => provider.id === settings.activeProviderId
    ) ?? settings.providers[0]

  if (!activeProvider || !hasProviderConfig(activeProvider)) {
    return baseRecommendation
  }

  try {
    const aiRecommendation = await extractAiRecommendations(
      input,
      folderIndex,
      settings,
      baseRecommendation
    )

    if (aiRecommendation.suggestions.length > 0) {
      return aiRecommendation
    }
  } catch (_error) {
    return {
      ...baseRecommendation,
      source: "heuristic"
    }
  }

  return baseRecommendation
}

async function handleUpdateActiveProvider(
  payload: UpdateActiveProviderPayload
) {
  const settings = await getSettings()
  const activeProvider =
    settings.providers.find((provider) => provider.id === payload.providerId) ??
    settings.providers[0]

  if (!activeProvider) {
    return settings
  }

  const nextSettings: SmartFavoritesSettings = {
    ...settings,
    activeProviderId: activeProvider.id,
    provider: {
      baseUrl: activeProvider.baseUrl,
      apiKey: activeProvider.apiKey,
      model: activeProvider.model
    }
  }

  await saveSettings(nextSettings)
  return nextSettings
}

async function handleSummarizePageContent(payload: PageDigestRequest) {
  const settings = await getSettings()
  return summarizePageContent(payload, settings)
}

async function handleSelectRelevantSegments(
  payload: PageDigestRequest
): Promise<SegmentSelectionResult> {
  const settings = await getSettings()
  return selectRelevantSegments(
    payload.segments ?? [],
    settings,
    payload.providerId
  )
}

async function handleApplyBookmark(payload: ApplyBookmarkPayload) {
  const result = await applyBookmarkDecision(payload)
  const settings = await getSettings()

  await pushRecommendationFeedback(payload.input, result.folderPath)

  if (settings.behavior.storeKnowledge) {
    await saveConfirmedBookmarkKnowledge(
      payload.page,
      payload.input,
      result.folderPath
    )
  }

  return result
}

async function handleExport(): Promise<ExportSnapshot> {
  const [settings, folderIndex] = await Promise.all([
    getSettings(),
    buildFolderIndex()
  ])

  return buildExportSnapshot(settings, folderIndex)
}

async function handleImportSnapshot(
  snapshot: ExportSnapshot
): Promise<ImportSnapshotResult> {
  return importSnapshotData(snapshot)
}

async function handleAddCapturedSnippet(payload: {
  url: string
  snippet: CapturedSnippet
}): Promise<PageCaptureDraft> {
  return addCapturedSnippet(payload.url, payload.snippet)
}

async function handleRemoveCapturedSnippet(payload: {
  url: string
  snippetId: string
}): Promise<PageCaptureDraft> {
  return removeCapturedSnippet(payload.url, payload.snippetId)
}

async function handleListHistoryBookmarks(
  request?: HistoryRecommendationRequest
): Promise<HistoryRecommendationItem[]> {
  const [bookmarks, folderIndex, settings, feedbackEntries] = await Promise.all(
    [
      listBookmarks(request?.limit ?? 40),
      buildFolderIndex(),
      getSettings(),
      getRecommendationFeedback()
    ]
  )

  const selectedBookmarks = request?.bookmarkIds?.length
    ? bookmarks.filter((item) => request.bookmarkIds?.includes(item.id))
    : bookmarks

  return selectedBookmarks.map((bookmark) => ({
    bookmark,
    recommendation: recommendFolders(
      {
        page: {
          title: bookmark.title,
          url: bookmark.url,
          domain: new URL(bookmark.url).hostname,
          summary: bookmark.parentPath
        },
        tags: [],
        notes: bookmark.parentPath
      },
      folderIndex,
      settings,
      feedbackEntries
    )
  }))
}

async function handleApplyBulkBookmarks(
  payload: BulkBookmarkApplyPayload
): Promise<BulkBookmarkApplyResult> {
  const decisions: BookmarkMoveDecision[] = payload.decisions
  return applyBulkBookmarkDecisions(decisions)
}

async function handleOpenExtensionPage(payload: ExtensionPageOpenPayload) {
  const normalizedPath = payload.path?.trim()

  if (!normalizedPath) {
    throw new Error("页面路径不能为空")
  }

  if (normalizedPath === "internal://model") {
    await chrome.tabs.create({ url: chrome.runtime.getURL("tabs/manage.html") })
    return { success: true }
  }

  if (normalizedPath === "internal://bookmarks") {
    await chrome.tabs.create({
      url: chrome.runtime.getURL("tabs/manage.html#history")
    })
    return { success: true }
  }

  // Backward compatibility: old callers may still pass options.html#...
  // This project now uses tabs/manage.html as the only management page.
  if (normalizedPath.startsWith("options.html")) {
    const mappedPath = normalizedPath.replace(
      "options.html",
      "tabs/manage.html"
    )
    await chrome.tabs.create({ url: chrome.runtime.getURL(mappedPath) })
    return { success: true }
  }

  const url = chrome.runtime.getURL(normalizedPath)
  await chrome.tabs.create({ url })
  return { success: true }
}

async function handleRecordExperimentEvent(
  payload: RecordExperimentEventPayload
): Promise<ExperimentEvent[]> {
  return recordExperimentEvent(payload)
}
async function notifyBookmarkCreated(url: string) {
  const matchedTabs = await chrome.tabs.query({
    url
  })

  await Promise.all(
    matchedTabs
      .filter((tab) => typeof tab.id === "number")
      .map((tab) =>
        chrome.tabs
          .sendMessage(tab.id as number, {
            type: "bookmarks-collector/bookmark-created"
          })
          .catch(() => undefined)
      )
  )
}
