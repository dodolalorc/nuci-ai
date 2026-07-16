import {
  DEFAULT_PROVIDER_ID,
  DEFAULT_SETTINGS,
  STORAGE_KEYS
} from "~/src/sdk/constants"
import { tokenize, unique } from "~/src/sdk/text"
import type {
  AiModelProfile,
  CapturedSnippet,
  ExperimentEvent,
  ExportSnapshot,
  ImportSnapshotResult,
  KnowledgeRecord,
  PageCaptureDraft,
  RecommendationFeedbackEntry,
  RecommendationInput,
  RecordExperimentEventPayload,
  SmartFavoritesSettings,
  SnippetCollectionFolder,
  SnippetCollectionItem,
  SnippetCollectionState
} from "~/src/sdk/types"
import type { KnowledgeItem } from "~/src/types/knowledge"

const UNCATEGORIZED_FOLDER_ID = "uncategorized"
const UNCATEGORIZED_FOLDER_NAME = "未分类内容"

function createDefaultFolder(): SnippetCollectionFolder {
  const now = new Date().toISOString()
  return {
    id: UNCATEGORIZED_FOLDER_ID,
    name: UNCATEGORIZED_FOLDER_NAME,
    description: "用于保存还没有分类的内容。",
    isDefault: true,
    createdAt: now,
    updatedAt: now
  }
}

function normalizeCollections(
  state?: Partial<SnippetCollectionState>
): SnippetCollectionState {
  const defaultFolder = createDefaultFolder()
  const folders = [...(state?.folders ?? [])]
  const items = [...(state?.items ?? [])]
  const existingDefault = folders.find(
    (folder) => folder.id === UNCATEGORIZED_FOLDER_ID
  )

  const normalizedFolders = existingDefault
    ? folders.map((folder) =>
        folder.id === UNCATEGORIZED_FOLDER_ID
          ? {
              ...defaultFolder,
              ...folder,
              id: UNCATEGORIZED_FOLDER_ID,
              name: UNCATEGORIZED_FOLDER_NAME,
              isDefault: true
            }
          : folder
      )
    : [defaultFolder, ...folders]

  return {
    folders: normalizedFolders.sort((left, right) =>
      left.isDefault === right.isDefault
        ? right.updatedAt.localeCompare(left.updatedAt)
        : left.isDefault
          ? -1
          : 1
    ),
    items: items.map((item) => ({
      ...item,
      folderId: normalizedFolders.some((folder) => folder.id === item.folderId)
        ? item.folderId
        : UNCATEGORIZED_FOLDER_ID
    }))
  }
}

async function getCollectionStateRaw() {
  return getLocal<SnippetCollectionState>(STORAGE_KEYS.collections, {
    folders: [],
    items: []
  })
}

async function saveCollectionState(state: SnippetCollectionState) {
  const normalized = normalizeCollections(state)
  await chrome.storage.local.set({
    [STORAGE_KEYS.collections]: normalized
  })
  return normalized
}

function nextCollectionId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function getLocal<T>(key: string, fallback: T): Promise<T> {
  const result = await chrome.storage.local.get(key)
  return (result[key] as T | undefined) ?? fallback
}

function normalizeProviders(
  settings?: Partial<SmartFavoritesSettings>
): Pick<SmartFavoritesSettings, "provider" | "providers" | "activeProviderId"> {
  const legacyProvider = {
    ...DEFAULT_SETTINGS.provider,
    ...settings?.provider
  }

  const providersSource = settings?.providers?.length
    ? settings.providers
    : [
        {
          id: DEFAULT_PROVIDER_ID,
          label: legacyProvider.model?.trim() || "默认模型",
          ...legacyProvider
        }
      ]

  const providers = providersSource
    .map(
      (provider, index): AiModelProfile => ({
        id: provider.id?.trim() || `${DEFAULT_PROVIDER_ID}-${index + 1}`,
        label:
          provider.label?.trim() ||
          provider.model?.trim() ||
          `模型 ${index + 1}`,
        baseUrl: provider.baseUrl?.trim() || DEFAULT_SETTINGS.provider.baseUrl,
        apiKey: provider.apiKey ?? "",
        model: provider.model?.trim() ?? ""
      })
    )
    .filter(
      (provider, index, list) =>
        list.findIndex((item) => item.id === provider.id) === index
    )

  if (providers.length === 0) {
    providers.push({
      id: DEFAULT_PROVIDER_ID,
      label: "默认模型",
      ...DEFAULT_SETTINGS.provider
    })
  }

  const activeProvider =
    providers.find((provider) => provider.id === settings?.activeProviderId) ??
    providers[0]

  return {
    provider: {
      baseUrl: activeProvider.baseUrl,
      apiKey: activeProvider.apiKey,
      model: activeProvider.model
    },
    providers,
    activeProviderId: activeProvider.id
  }
}

export function redactProviderSecrets(
  settings: SmartFavoritesSettings
): SmartFavoritesSettings {
  return {
    ...settings,
    provider: { ...settings.provider, apiKey: "" },
    providers: settings.providers.map((provider) => ({
      ...provider,
      apiKey: ""
    }))
  }
}

function preserveExistingProviderSecrets(
  imported: SmartFavoritesSettings,
  current: SmartFavoritesSettings
): SmartFavoritesSettings {
  const currentKeys = new Map(
    current.providers.map((provider) => [provider.id, provider.apiKey])
  )
  const providers = imported.providers.map((provider) => ({
    ...provider,
    apiKey: currentKeys.get(provider.id) ?? ""
  }))
  const activeProvider =
    providers.find((provider) => provider.id === imported.activeProviderId) ??
    providers[0]

  return {
    ...imported,
    provider: {
      ...imported.provider,
      apiKey: activeProvider?.apiKey ?? ""
    },
    providers
  }
}

export async function getSettings(): Promise<SmartFavoritesSettings> {
  const settings = await getLocal(STORAGE_KEYS.settings, DEFAULT_SETTINGS)
  const providerState = normalizeProviders(settings)

  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    ...providerState,
    prompts: {
      ...DEFAULT_SETTINGS.prompts,
      ...settings.prompts
    },
    behavior: {
      ...DEFAULT_SETTINGS.behavior,
      ...settings.behavior
    }
  }
}

export async function saveSettings(settings: SmartFavoritesSettings) {
  const normalized = {
    ...settings,
    ...normalizeProviders(settings)
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.settings]: normalized
  })
}

export async function importSnapshotData(
  snapshot: ExportSnapshot
): Promise<ImportSnapshotResult> {
  const currentSettings = await getSettings()
  const safeImportedSettings = preserveExistingProviderSecrets(
    redactProviderSecrets(snapshot.settings),
    currentSettings
  )
  const normalizedSettings = {
    ...safeImportedSettings,
    ...normalizeProviders(safeImportedSettings)
  }
  const knowledge = Array.isArray(snapshot.knowledge)
    ? snapshot.knowledge.slice(0, 300)
    : []
  const knowledgeItems = Array.isArray(snapshot.knowledgeItems)
    ? snapshot.knowledgeItems.slice(0, 500)
    : []
  const drafts = Array.isArray(snapshot.drafts) ? snapshot.drafts : []
  const analytics = Array.isArray(snapshot.analytics)
    ? snapshot.analytics.slice(0, 1000)
    : []
  const draftMap = Object.fromEntries(
    drafts
      .filter((draft) => typeof draft?.url === "string" && draft.url.trim())
      .map((draft) => [
        draft.url,
        {
          url: draft.url,
          snippets: Array.isArray(draft.snippets) ? draft.snippets : [],
          updatedAt: draft.updatedAt || new Date().toISOString()
        }
      ])
  )
  const collections = normalizeCollections(snapshot.collections)

  await chrome.storage.local.set({
    [STORAGE_KEYS.settings]: normalizedSettings,
    [STORAGE_KEYS.knowledge]: knowledge,
    [STORAGE_KEYS.knowledgeItems]: knowledgeItems as KnowledgeItem[],
    [STORAGE_KEYS.analytics]: analytics,
    [STORAGE_KEYS.drafts]: draftMap,
    [STORAGE_KEYS.collections]: collections
  })

  return {
    settingsImported: true,
    knowledgeCount: knowledge.length,
    draftCount: Object.keys(draftMap).length,
    collectionFolderCount: collections.folders.length,
    collectionItemCount: collections.items.length,
    analyticsCount: analytics.length
  }
}

export async function getExperimentEvents(): Promise<ExperimentEvent[]> {
  return getLocal<ExperimentEvent[]>(STORAGE_KEYS.analytics, [])
}

export async function getSnippetCollections(): Promise<SnippetCollectionState> {
  const state = await getCollectionStateRaw()
  const normalized = normalizeCollections(state)

  if (
    normalized.folders.length !== (state.folders?.length ?? 0) ||
    normalized.items.some(
      (item, index) => item.folderId !== state.items?.[index]?.folderId
    )
  ) {
    await saveCollectionState(normalized)
  }

  return normalized
}

export async function createSnippetFolder(
  name: string,
  description?: string
): Promise<SnippetCollectionState> {
  const current = await getSnippetCollections()
  const now = new Date().toISOString()

  return saveCollectionState({
    folders: [
      ...current.folders,
      {
        id: nextCollectionId("folder"),
        name: name.trim(),
        description: description?.trim(),
        createdAt: now,
        updatedAt: now
      }
    ],
    items: current.items
  })
}

export async function updateSnippetFolder(
  folderId: string,
  updates: Pick<SnippetCollectionFolder, "name" | "description">
): Promise<SnippetCollectionState> {
  const current = await getSnippetCollections()

  return saveCollectionState({
    folders: current.folders.map((folder) =>
      folder.id === folderId && !folder.isDefault
        ? {
            ...folder,
            name: updates.name.trim(),
            description: updates.description?.trim(),
            updatedAt: new Date().toISOString()
          }
        : folder
    ),
    items: current.items
  })
}

export async function deleteSnippetFolder(
  folderId: string
): Promise<SnippetCollectionState> {
  const current = await getSnippetCollections()

  if (folderId === UNCATEGORIZED_FOLDER_ID) {
    return current
  }

  return saveCollectionState({
    folders: current.folders.filter((folder) => folder.id !== folderId),
    items: current.items.map((item) =>
      item.folderId === folderId
        ? {
            ...item,
            folderId: UNCATEGORIZED_FOLDER_ID,
            updatedAt: new Date().toISOString()
          }
        : item
    )
  })
}

export async function addSnippetCollectionItem(
  item: Omit<SnippetCollectionItem, "id" | "createdAt" | "updatedAt">
): Promise<SnippetCollectionState> {
  const current = await getSnippetCollections()
  const now = new Date().toISOString()

  return saveCollectionState({
    folders: current.folders,
    items: [
      {
        ...item,
        id: nextCollectionId("item"),
        createdAt: now,
        updatedAt: now
      },
      ...current.items
    ].slice(0, 500)
  })
}

export async function updateSnippetCollectionItem(
  itemId: string,
  updates: Pick<SnippetCollectionItem, "title" | "text">
): Promise<SnippetCollectionState> {
  const current = await getSnippetCollections()

  return saveCollectionState({
    folders: current.folders,
    items: current.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            title: updates.title.trim(),
            text: updates.text.trim(),
            updatedAt: new Date().toISOString()
          }
        : item
    )
  })
}

export async function moveSnippetCollectionItem(
  itemId: string,
  folderId: string
): Promise<SnippetCollectionState> {
  const current = await getSnippetCollections()
  const resolvedFolderId = current.folders.some(
    (folder) => folder.id === folderId
  )
    ? folderId
    : UNCATEGORIZED_FOLDER_ID

  return saveCollectionState({
    folders: current.folders.map((folder) =>
      folder.id === resolvedFolderId
        ? {
            ...folder,
            updatedAt: new Date().toISOString()
          }
        : folder
    ),
    items: current.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            folderId: resolvedFolderId,
            updatedAt: new Date().toISOString()
          }
        : item
    )
  })
}

export async function deleteSnippetCollectionItem(
  itemId: string
): Promise<SnippetCollectionState> {
  const current = await getSnippetCollections()

  return saveCollectionState({
    folders: current.folders,
    items: current.items.filter((item) => item.id !== itemId)
  })
}

export async function recordExperimentEvent(
  payload: RecordExperimentEventPayload
): Promise<ExperimentEvent[]> {
  const current = await getExperimentEvents()
  const event: ExperimentEvent = {
    id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    condition: payload.condition,
    source: payload.source,
    pageTitle: payload.pageTitle?.trim(),
    url: payload.url?.trim(),
    domain: payload.domain?.trim(),
    folderPath: payload.folderPath?.trim(),
    pageType: payload.pageType ?? "unknown",
    steps: Math.max(0, payload.steps),
    latencyMs: Math.max(0, payload.latencyMs),
    suggestionCount: Math.max(0, payload.suggestionCount ?? 0),
    selectedRank: payload.selectedRank,
    top1Accepted: Boolean(payload.top1Accepted),
    top3Covered: Boolean(payload.top3Covered),
    recommendedPaths: (payload.recommendedPaths ?? [])
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 5),
    explanationSatisfaction: payload.explanationSatisfaction,
    interventionSatisfaction: payload.interventionSatisfaction,
    notes: payload.notes?.trim()
  }

  const next = [event, ...current].slice(0, 1000)
  await chrome.storage.local.set({
    [STORAGE_KEYS.analytics]: next
  })

  return next
}

export async function getRecommendationFeedback(): Promise<
  RecommendationFeedbackEntry[]
> {
  return getLocal<RecommendationFeedbackEntry[]>(
    STORAGE_KEYS.recommendationFeedback,
    []
  )
}

export async function pushRecommendationFeedback(
  input: RecommendationInput,
  folderPath: string
) {
  const tokens = unique(
    tokenize(
      [
        input.page.title,
        input.page.domain,
        input.page.summary,
        input.selectedText,
        input.notes,
        input.tags.join(" ")
      ]
        .filter(Boolean)
        .join(" ")
    )
  ).slice(0, 16)

  const entry: RecommendationFeedbackEntry = {
    folderPath,
    domain: input.page.domain,
    tokens,
    createdAt: new Date().toISOString()
  }

  const current = await getRecommendationFeedback()
  const next = [entry, ...current].slice(0, 300)
  await chrome.storage.local.set({
    [STORAGE_KEYS.recommendationFeedback]: next
  })
}

async function getDraftMap() {
  return getLocal<Record<string, PageCaptureDraft>>(STORAGE_KEYS.drafts, {})
}

export async function getAllCaptureDrafts(): Promise<PageCaptureDraft[]> {
  const draftMap = await getDraftMap()
  return Object.values(draftMap)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 100)
}

export async function getCaptureDraft(url: string): Promise<PageCaptureDraft> {
  const draftMap = await getDraftMap()
  return (
    draftMap[url] ?? {
      url,
      snippets: [],
      updatedAt: new Date().toISOString()
    }
  )
}

export async function addCapturedSnippet(
  url: string,
  snippet: CapturedSnippet
) {
  const draftMap = await getDraftMap()
  const current = draftMap[url] ?? {
    url,
    snippets: [],
    updatedAt: new Date().toISOString()
  }

  draftMap[url] = {
    url,
    snippets: [snippet, ...current.snippets].slice(0, 20),
    updatedAt: new Date().toISOString()
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.drafts]: draftMap
  })

  await addSnippetCollectionItem({
    folderId: UNCATEGORIZED_FOLDER_ID,
    sourceUrl: url,
    snippetId: snippet.id,
    title: snippet.label || "未命名段落",
    text: snippet.text,
    originalText: snippet.text,
    mode: snippet.mode,
    selector: snippet.selector,
    analysisSummary: snippet.analysisSummary,
    analysisTags: snippet.analysisTags
  })

  return draftMap[url]
}

export async function removeCapturedSnippet(url: string, snippetId: string) {
  const draftMap = await getDraftMap()
  const current = draftMap[url]

  if (!current) {
    return {
      url,
      snippets: [],
      updatedAt: new Date().toISOString()
    }
  }

  draftMap[url] = {
    url,
    snippets: current.snippets.filter((snippet) => snippet.id !== snippetId),
    updatedAt: new Date().toISOString()
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.drafts]: draftMap
  })

  const collections = await getSnippetCollections()
  const linkedItem = collections.items.find(
    (item) => item.snippetId === snippetId
  )

  if (linkedItem) {
    await saveCollectionState({
      folders: collections.folders,
      items: collections.items.filter((item) => item.id !== linkedItem.id)
    })
  }

  return draftMap[url]
}

export async function updateCapturedSnippet(
  url: string,
  snippetId: string,
  updater: (snippet: CapturedSnippet) => CapturedSnippet
) {
  const draftMap = await getDraftMap()
  const current = draftMap[url]

  if (!current) {
    return {
      url,
      snippets: [],
      updatedAt: new Date().toISOString()
    }
  }

  draftMap[url] = {
    url,
    snippets: current.snippets.map((snippet) =>
      snippet.id === snippetId ? updater(snippet) : snippet
    ),
    updatedAt: new Date().toISOString()
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.drafts]: draftMap
  })

  const updated = draftMap[url]?.snippets.find(
    (snippet) => snippet.id === snippetId
  )
  if (updated) {
    const collections = await getSnippetCollections()
    const existingItem = collections.items.find(
      (item) => item.snippetId === snippetId
    )

    if (existingItem) {
      await saveCollectionState({
        folders: collections.folders,
        items: collections.items.map((item) =>
          item.id === existingItem.id
            ? {
                ...item,
                title: updated.label || item.title,
                text: updated.text,
                selector: updated.selector,
                analysisSummary: updated.analysisSummary,
                analysisTags: updated.analysisTags,
                updatedAt: new Date().toISOString()
              }
            : item
        )
      })
    }
  }

  return draftMap[url]
}

export async function clearCaptureDraft(url: string) {
  const draftMap = await getDraftMap()
  delete draftMap[url]

  await chrome.storage.local.set({
    [STORAGE_KEYS.drafts]: draftMap
  })
}

export { UNCATEGORIZED_FOLDER_ID, UNCATEGORIZED_FOLDER_NAME }
