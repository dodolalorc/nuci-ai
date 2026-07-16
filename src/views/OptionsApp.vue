<script setup lang="ts">
import { computed, onMounted, ref } from "vue"

import { SmartFavoritesSDK } from "../sdk/client"
import {
  DEFAULT_PROMPT_TEMPLATE,
  DEFAULT_PROVIDER_BASE_URL,
  DEFAULT_PROVIDER_LABEL,
  DEFAULT_PROVIDER_MODEL,
  DEFAULT_SYSTEM_PROMPT
} from "../sdk/constants"
import { getProviderConfigNotice, resolveProvider } from "../sdk/provider"
import type {
  AiModelProfile,
  BookmarkMoveDecision,
  ExportSnapshot,
  HistoryRecommendationItem,
  SmartFavoritesSettings,
  SnippetCollectionFolder,
  SnippetCollectionItem,
  SnippetCollectionState
} from "../sdk/types"
import type { KnowledgeItem } from "../types/knowledge"
import BaseButton from "../ui/BaseButton.vue"
import BaseCard from "../ui/BaseCard.vue"
import FormField from "../ui/FormField.vue"
import SectionHeader from "../ui/SectionHeader.vue"
import CollectionSnippetCard from "./CollectionSnippetCard.vue"
import HistoryItemCard from "./HistoryItemCard.vue"
import KnowledgeBase from "./KnowledgeBase.vue"

const sdk = new SmartFavoritesSDK()

const resolveTabFromHash = () => {
  if (location.hash === "#history") {
    return "history" as const
  }

  if (location.hash === "#knowledge-base") {
    return "knowledge-base" as const
  }

  if (location.hash === "#knowledge") {
    return "knowledge" as const
  }

  return "settings" as const
}

const buildDistribution = (entries: string[], limit = 8) => {
  const total = entries.length
  if (total === 0) {
    return []
  }

  const counts = new Map<string, number>()
  for (const entry of entries) {
    const normalized = entry.trim()
    if (!normalized) {
      continue
    }

    counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([label, count]) => ({
      label,
      count,
      ratio: count / total
    }))
}

const importInput = ref<HTMLInputElement | null>(null)
const settings = ref<SmartFavoritesSettings | null>(null)
const status = ref("正在加载设置…")
const tab = ref<"settings" | "history" | "knowledge" | "knowledge-base">(
  resolveTabFromHash()
)
const historyItems = ref<HistoryRecommendationItem[]>([])
const selectedIds = ref<string[]>([])
const historyStatus = ref("正在加载历史书签推荐…")
const collections = ref<SnippetCollectionState>({
  folders: [],
  items: []
})
const knowledgeItems = ref<KnowledgeItem[]>([])
const knowledgeStatus = ref("正在加载知识条目…")
const knowledgeQuery = ref("")
const collectionsStatus = ref("正在加载收藏夹…")
const showApiKey = ref(false)
const activeFolderId = ref("uncategorized")
const folderNameInput = ref("")
const folderDescriptionInput = ref("")
const editingFolderId = ref("")
const itemTitleInput = ref("")
const itemTextInput = ref("")
const expandedItemIds = ref<string[]>([])
const editingItemId = ref("")
const editingItemTitle = ref("")
const editingItemText = ref("")
const historyRecommendationStartedAt = ref<number | null>(null)

const selectedDecisions = computed<BookmarkMoveDecision[]>(() =>
  historyItems.value
    .filter((item) => selectedIds.value.includes(item.bookmark.id))
    .map((item) => ({
      bookmarkId: item.bookmark.id,
      recommendation: item.recommendation.suggestions[0]
    }))
    .filter((item) => Boolean(item.recommendation))
)

const activeFolder = computed(
  () =>
    collections.value.folders.find(
      (folder) => folder.id === activeFolderId.value
    ) ??
    collections.value.folders[0] ??
    null
)

const activeFolderItems = computed(() =>
  collections.value.items.filter(
    (item) => item.folderId === activeFolderId.value
  )
)

const hasAnyManagedContent = computed(
  () =>
    collections.value.folders.length > 1 || collections.value.items.length > 0
)

const filteredKnowledgeItems = computed(() => {
  const query = knowledgeQuery.value.trim().toLowerCase()
  if (!query) {
    return knowledgeItems.value
  }

  return knowledgeItems.value.filter((record) =>
    [
      record.title,
      record.url,
      record.category,
      record.subCategory ?? "",
      record.tags.join(" "),
      record.summary ?? "",
      record.learningNotes ?? "",
      record.content
    ]
      .join("\n")
      .toLowerCase()
      .includes(query)
  )
})

const activeProvider = computed(() => {
  if (!settings.value) {
    return null
  }

  return (
    settings.value.providers.find(
      (provider) => provider.id === settings.value?.activeProviderId
    ) ??
    settings.value.providers[0] ??
    null
  )
})

const activeProviderNotice = computed(() => {
  if (!settings.value) {
    return ""
  }

  return getProviderConfigNotice(resolveProvider(settings.value))
})

const knowledgeInsightCards = computed(() => {
  const tagCount = new Set(
    knowledgeItems.value.flatMap((record) => record.tags)
  ).size
  const folderCount = new Set(
    knowledgeItems.value.map(
      (record) => record.subCategory || record.category || "uncategorized"
    )
  ).size
  const recentCount = knowledgeItems.value.filter((record) => {
    return Date.now() - record.createdAt <= 7 * 24 * 60 * 60 * 1000
  }).length

  return [
    { label: "知识条目", value: String(knowledgeItems.value.length) },
    { label: "目录类别", value: String(folderCount) },
    { label: "标签数量", value: String(tagCount) },
    { label: "近 7 日新增", value: String(recentCount) }
  ]
})

const knowledgeFolderDistribution = computed(() =>
  buildDistribution(
    knowledgeItems.value.map(
      (record) => record.subCategory || record.category || "未分类"
    )
  )
)

const knowledgeTagDistribution = computed(() =>
  buildDistribution(knowledgeItems.value.flatMap((record) => record.tags))
)

onMounted(() => {
  void loadSettings()
  void refreshHistory()
  void loadCollections()
  void loadKnowledgeRecords()

  const onHashChange = () => {
    tab.value = resolveTabFromHash()
  }

  window.addEventListener("hashchange", onHashChange)
})

const updateSettings = (next: SmartFavoritesSettings) => {
  settings.value = next
}

const syncActiveProviderView = (
  next: SmartFavoritesSettings
): SmartFavoritesSettings => {
  const activeProvider =
    next.providers.find((provider) => provider.id === next.activeProviderId) ??
    next.providers[0]

  return {
    ...next,
    provider: activeProvider
      ? {
          baseUrl: activeProvider.baseUrl,
          apiKey: activeProvider.apiKey,
          model: activeProvider.model
        }
      : next.provider
  }
}

const loadSettings = async () => {
  const loaded = await sdk.getSettings()
  settings.value = syncActiveProviderView(loaded)
  status.value = "已读取当前配置。"
}

const loadCollections = async () => {
  collections.value = await sdk.getSnippetCollections()
  if (
    !collections.value.folders.some(
      (folder) => folder.id === activeFolderId.value
    )
  ) {
    activeFolderId.value = collections.value.folders[0]?.id ?? "uncategorized"
  }
  collectionsStatus.value =
    collections.value.items.length > 0
      ? "已加载收藏夹内容。"
      : "第一次使用时，抓取的段落会先进入未分类内容。"
}

const loadKnowledgeRecords = async () => {
  knowledgeItems.value = await sdk.listKnowledgeItems()
  knowledgeStatus.value =
    knowledgeItems.value.length > 0
      ? `已加载 ${knowledgeItems.value.length} 条知识条目。`
      : "当前还没有知识条目，保存网页或确认书签归档后会在这里沉淀内容。"
}

const saveSettings = async () => {
  if (!settings.value) {
    return
  }

  const normalized = syncActiveProviderView(settings.value)
  await sdk.saveSettings(normalized)
  settings.value = normalized
  status.value = "配置已保存。"
}

const downloadJson = (snapshot: ExportSnapshot) => {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
    type: "application/json"
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `bookmarks-collector-backup-${Date.now()}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

const exportBackup = async () => {
  const snapshot = await sdk.exportSnapshot()
  downloadJson(snapshot)
  status.value = "已导出本地备份。"
}

const triggerImportBackup = () => {
  importInput.value?.click()
}

const importBackup = async (event: Event) => {
  const target = event.target
  if (!(target instanceof HTMLInputElement) || !target.files?.[0]) {
    return
  }

  try {
    const text = await target.files[0].text()
    const snapshot = JSON.parse(text) as ExportSnapshot
    const result = await sdk.importSnapshot(snapshot)
    await Promise.all([
      loadSettings(),
      loadCollections(),
      loadKnowledgeRecords(),
      refreshHistory()
    ])
    status.value =
      `已导入备份：${result.knowledgeCount} 条知识记录，` +
      `${result.draftCount} 个页面草稿，${result.collectionItemCount} 条内容片段。`
  } catch (error) {
    status.value =
      error instanceof Error
        ? `导入失败：${error.message}`
        : "导入失败，请检查备份文件格式。"
  } finally {
    target.value = ""
  }
}

const refreshHistory = async () => {
  historyRecommendationStartedAt.value = Date.now()
  historyStatus.value = "正在重新生成历史书签推荐…"
  const items = await sdk.listHistoryBookmarks(40)
  historyItems.value = items.filter(
    (item) => item.recommendation.suggestions.length > 0
  )
  selectedIds.value = []
  historyStatus.value =
    historyItems.value.length > 0
      ? "已生成推荐。勾选需要迁移的书签后再执行。"
      : "当前没有可迁移的历史推荐。"
}

const applySelected = async () => {
  if (selectedDecisions.value.length === 0) {
    historyStatus.value = "先勾选至少一条推荐记录。"
    return
  }

  const selectedItems = historyItems.value.filter((item) =>
    selectedIds.value.includes(item.bookmark.id)
  )
  const result = await sdk.applyBulkBookmarkRecommendations(
    selectedDecisions.value
  )
  await Promise.all(
    selectedItems.map((item, index) =>
      sdk.recordExperimentEvent({
        condition: "rule",
        source: "history",
        pageTitle: item.bookmark.title,
        url: item.bookmark.url,
        domain: new URL(item.bookmark.url).hostname,
        folderPath: result.results[index]?.folderPath,
        steps: 2,
        latencyMs: historyRecommendationStartedAt.value
          ? Date.now() - historyRecommendationStartedAt.value
          : 0,
        suggestionCount: item.recommendation.suggestions.length,
        selectedRank: 1,
        top1Accepted: true,
        top3Covered: item.recommendation.suggestions.length > 0,
        recommendedPaths: item.recommendation.suggestions.map(
          (suggestion) => suggestion.path
        )
      })
    )
  )
  historyStatus.value = `已迁移 ${result.moved} 条书签。`
  await Promise.all([refreshHistory(), loadKnowledgeRecords()])
}

const toggleSelected = (id: string) => {
  selectedIds.value = selectedIds.value.includes(id)
    ? selectedIds.value.filter((item) => item !== id)
    : [...selectedIds.value, id]
}

const switchTab = (next: "settings" | "history" | "knowledge") => {
  tab.value = next
  location.hash =
    next === "history" ? "#history" : next === "knowledge" ? "#knowledge" : ""
}

const readInputValue = (event: Event) => {
  const target = event.target
  return target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
    ? target.value
    : ""
}

const readCheckedValue = (event: Event) => {
  const target = event.target
  return target instanceof HTMLInputElement ? target.checked : false
}

const updateProvider = (
  providerId: string,
  updates: Partial<AiModelProfile>
) => {
  if (!settings.value) {
    return
  }

  const next = syncActiveProviderView({
    ...settings.value,
    providers: settings.value.providers.map((provider) =>
      provider.id === providerId ? { ...provider, ...updates } : provider
    )
  })

  updateSettings(next)
}

const switchProvider = (providerId: string) => {
  if (!settings.value) {
    return
  }

  updateSettings(
    syncActiveProviderView({
      ...settings.value,
      activeProviderId: providerId
    })
  )
}

const addProvider = () => {
  if (!settings.value) {
    return
  }

  const nextProvider: AiModelProfile = {
    id: `provider-${Date.now()}`,
    label:
      settings.value.providers.length === 0
        ? DEFAULT_PROVIDER_LABEL
        : `DeepSeek 模型 ${settings.value.providers.length + 1}`,
    baseUrl: DEFAULT_PROVIDER_BASE_URL,
    apiKey: "",
    model: DEFAULT_PROVIDER_MODEL
  }

  updateSettings(
    syncActiveProviderView({
      ...settings.value,
      providers: [...settings.value.providers, nextProvider],
      activeProviderId: nextProvider.id
    })
  )
}

const removeProvider = (providerId: string) => {
  if (!settings.value || settings.value.providers.length <= 1) {
    status.value = "至少保留一个模型配置。"
    return
  }

  const providers = settings.value.providers.filter(
    (provider) => provider.id !== providerId
  )
  const activeProviderId =
    settings.value.activeProviderId === providerId
      ? providers[0].id
      : settings.value.activeProviderId

  updateSettings(
    syncActiveProviderView({
      ...settings.value,
      providers,
      activeProviderId
    })
  )
}

const onSystemPromptInput = (event: Event) => {
  if (!settings.value) {
    return
  }

  updateSettings({
    ...settings.value,
    prompts: {
      ...settings.value.prompts,
      system: readInputValue(event)
    }
  })
}

const onTemplateInput = (event: Event) => {
  if (!settings.value) {
    return
  }

  updateSettings({
    ...settings.value,
    prompts: {
      ...settings.value.prompts,
      template: readInputValue(event)
    }
  })
}

const onAllowCreateFolderChange = (event: Event) => {
  if (!settings.value) {
    return
  }

  updateSettings({
    ...settings.value,
    behavior: {
      ...settings.value.behavior,
      allowCreateFolder: readCheckedValue(event)
    }
  })
}

const onPreferExistingFolderChange = (event: Event) => {
  if (!settings.value) {
    return
  }

  updateSettings({
    ...settings.value,
    behavior: {
      ...settings.value.behavior,
      preferExistingFolder: readCheckedValue(event)
    }
  })
}

const onStoreKnowledgeChange = (event: Event) => {
  if (!settings.value) {
    return
  }

  updateSettings({
    ...settings.value,
    behavior: {
      ...settings.value.behavior,
      storeKnowledge: readCheckedValue(event)
    }
  })
}

const resetFolderForm = () => {
  editingFolderId.value = ""
  folderNameInput.value = ""
  folderDescriptionInput.value = ""
}

const startEditFolder = (folder: SnippetCollectionFolder) => {
  if (folder.isDefault) {
    return
  }

  editingFolderId.value = folder.id
  folderNameInput.value = folder.name
  folderDescriptionInput.value = folder.description ?? ""
}

const saveFolder = async () => {
  if (!folderNameInput.value.trim()) {
    collectionsStatus.value = "收藏夹名称不能为空。"
    return
  }

  if (editingFolderId.value) {
    const result = await sdk.updateSnippetFolder({
      folderId: editingFolderId.value,
      name: folderNameInput.value,
      description: folderDescriptionInput.value
    })
    collections.value = result.collections
    collectionsStatus.value = "已更新收藏夹。"
  } else {
    const result = await sdk.createSnippetFolder({
      name: folderNameInput.value,
      description: folderDescriptionInput.value
    })
    collections.value = result.collections
    activeFolderId.value = result.folderId
    collectionsStatus.value = "已创建新收藏夹。"
  }

  resetFolderForm()
}

const removeFolder = async (folder: SnippetCollectionFolder) => {
  if (folder.isDefault) {
    collectionsStatus.value = "未分类内容不能删除。"
    return
  }

  const result = await sdk.deleteSnippetFolder({ folderId: folder.id })
  collections.value = result.collections
  if (activeFolderId.value === folder.id) {
    activeFolderId.value = "uncategorized"
  }
  collectionsStatus.value = "已删除收藏夹，内容已回到未分类内容。"
}

const createItem = async () => {
  if (!itemTitleInput.value.trim() || !itemTextInput.value.trim()) {
    collectionsStatus.value = "段落标题和内容都不能为空。"
    return
  }

  const result = await sdk.createSnippetCollectionItem({
    folderId: activeFolderId.value,
    title: itemTitleInput.value,
    text: itemTextInput.value
  })
  collections.value = result.collections
  itemTitleInput.value = ""
  itemTextInput.value = ""
  collectionsStatus.value = "已新增段落内容。"
}

const startEditItem = (item: SnippetCollectionItem) => {
  editingItemId.value = item.id
  editingItemTitle.value = item.title
  editingItemText.value = item.text
}

const cancelEditItem = () => {
  editingItemId.value = ""
  editingItemTitle.value = ""
  editingItemText.value = ""
}

const saveItem = async (itemId: string) => {
  if (!editingItemTitle.value.trim() || !editingItemText.value.trim()) {
    collectionsStatus.value = "编辑内容不能为空。"
    return
  }

  const result = await sdk.updateSnippetCollectionItem({
    itemId,
    title: editingItemTitle.value,
    text: editingItemText.value
  })
  collections.value = result.collections
  cancelEditItem()
  collectionsStatus.value = "已保存段落修改。"
}

const moveItem = async (payload: { itemId: string; folderId: string }) => {
  const result = await sdk.moveSnippetCollectionItem(payload)
  collections.value = result.collections
  collectionsStatus.value = "已移动段落内容。"
}

const removeItem = async (itemId: string) => {
  const result = await sdk.deleteSnippetCollectionItem({ itemId })
  collections.value = result.collections
  collectionsStatus.value = "已删除段落内容。"
}

const toggleExpandedItem = (itemId: string) => {
  expandedItemIds.value = expandedItemIds.value.includes(itemId)
    ? expandedItemIds.value.filter((id) => id !== itemId)
    : [...expandedItemIds.value, itemId]
}

const getFolderItemCount = (folderId: string) =>
  collections.value.items.filter((item) => item.folderId === folderId).length

const handleItemTitleInput = (event: Event) => {
  itemTitleInput.value = readInputValue(event)
}

const handleItemTextInput = (event: Event) => {
  itemTextInput.value = readInputValue(event)
}

const handleFolderNameInput = (event: Event) => {
  folderNameInput.value = readInputValue(event)
}

const handleFolderDescriptionInput = (event: Event) => {
  folderDescriptionInput.value = readInputValue(event)
}

const handleCollectionCardStartEdit = (itemId: string) => {
  const target = collections.value.items.find((item) => item.id === itemId)
  if (!target) {
    return
  }

  startEditItem(target)
}

const formatKnowledgeTime = (value: string | number) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`

const distributionStyle = (ratio: number) => ({
  width: `${Math.max(ratio * 100, 4)}%`
})
</script>

<template>
  <main class="page">
    <BaseCard class="panel-head">
      <input
        ref="importInput"
        type="file"
        accept="application/json,.json"
        class="hidden-input"
        @change="importBackup" />
      <div>
        <div class="eyebrow">Workspace</div>
        <div class="title">整理工作台</div>
      </div>
      <div class="tab-actions">
        <BaseButton
          :variant="tab === 'settings' ? 'primary' : 'secondary'"
          @click="switchTab('settings')">
          <font-awesome-icon icon="gear" />
          模型配置
        </BaseButton>
        <BaseButton
          :variant="tab === 'history' ? 'primary' : 'secondary'"
          @click="switchTab('history')">
          <font-awesome-icon icon="bookmark" />
          内容整理
        </BaseButton>
        <BaseButton
          :variant="tab === 'knowledge-base' ? 'primary' : 'secondary'"
          @click="switchTab('knowledge-base')">
          <font-awesome-icon icon="database" />
          知识库
        </BaseButton>
        <BaseButton
          :variant="tab === 'knowledge' ? 'primary' : 'secondary'"
          @click="switchTab('knowledge')">
          <font-awesome-icon icon="book-open" />
          知识笔记
        </BaseButton>
      </div>
    </BaseCard>

    <template v-if="!settings">
      <BaseCard>{{ status }}</BaseCard>
    </template>

    <template v-else-if="tab === 'settings'">
      <BaseCard class="quickstart-hero">
        <SectionHeader
          compact
          title="使用路径"
          subtitle="这个版本把主线收敛成三件事：先配置模型，再在网页里抓取和整理，最后回来看沉淀结果。" />
        <div class="status">
          {{
            activeProviderNotice ||
            "当前模型配置完整，可以直接开始使用页面抓取、AI 整理和书签归档。"
          }}
        </div>
        <div class="quickstart-copy">
          管理台保留三个入口：模型配置负责接通
          AI，内容整理负责管理抓取片段和高级书签迁移，知识笔记负责回看已经沉淀下来的记录。
        </div>
      </BaseCard>

      <BaseCard>
        <div class="row wrap">
          <SectionHeader
            compact
            title="AI Models"
            subtitle="默认预置 DeepSeek，也支持配置多个兼容模型，并同步给网页 AI 面板使用。" />
          <BaseButton variant="accent" @click="addProvider">
            <font-awesome-icon icon="plus" />
            添加模型
          </BaseButton>
        </div>

        <div class="provider-grid">
          <button
            v-for="provider in settings.providers"
            :key="provider.id"
            class="provider-card"
            :class="{ active: settings.activeProviderId === provider.id }"
            @click="switchProvider(provider.id)">
            <div class="provider-card-top">
              <div>
                <div class="provider-name">{{ provider.label }}</div>
                <div class="provider-model">
                  {{ provider.model || "未填写模型名" }}
                </div>
              </div>
              <div class="provider-tools">
                <span
                  v-if="settings.activeProviderId === provider.id"
                  class="provider-badge">
                  当前
                </span>
                <button
                  v-if="settings.providers.length > 1"
                  class="mini-icon danger"
                  type="button"
                  title="删除模型"
                  @click.stop="removeProvider(provider.id)">
                  <font-awesome-icon icon="trash" />
                </button>
              </div>
            </div>
            <div class="provider-url">{{ provider.baseUrl }}</div>
          </button>
        </div>
      </BaseCard>

      <BaseCard v-if="activeProvider">
        <SectionHeader compact title="当前模型编辑" />
        <div v-if="activeProviderNotice" class="config-notice">
          {{ activeProviderNotice }}
        </div>
        <FormField label="展示名称">
          <input
            class="field"
            :value="activeProvider.label"
            @input="
              updateProvider(activeProvider.id, {
                label: readInputValue($event)
              })
            " />
        </FormField>
        <FormField label="接口基地址">
          <input
            class="field"
            :value="activeProvider.baseUrl"
            @input="
              updateProvider(activeProvider.id, {
                baseUrl: readInputValue($event)
              })
            " />
        </FormField>
        <FormField label="模型名称">
          <input
            class="field"
            :value="activeProvider.model"
            @input="
              updateProvider(activeProvider.id, {
                model: readInputValue($event)
              })
            " />
        </FormField>
        <FormField label="API Key">
          <div class="secret-field">
            <input
              class="field secret-input"
              :type="showApiKey ? 'text' : 'password'"
              :value="activeProvider.apiKey"
              @input="
                updateProvider(activeProvider.id, {
                  apiKey: readInputValue($event)
                })
              " />
            <button
              v-if="activeProvider.apiKey"
              class="eye-button"
              type="button"
              :title="showApiKey ? '隐藏 Key' : '查看 Key'"
              @click="showApiKey = !showApiKey">
              <font-awesome-icon :icon="showApiKey ? 'eye-slash' : 'eye'" />
            </button>
          </div>
        </FormField>
      </BaseCard>

      <BaseCard>
        <SectionHeader compact title="Prompt 模板" />
        <FormField label="System Prompt">
          <textarea
            class="field"
            rows="6"
            :value="settings.prompts.system"
            @input="onSystemPromptInput" />
        </FormField>
        <FormField label="User Prompt Template">
          <textarea
            class="field"
            rows="12"
            :value="settings.prompts.template"
            @input="onTemplateInput" />
        </FormField>
        <BaseButton
          @click="
            updateSettings({
              ...settings,
              prompts: {
                system: DEFAULT_SYSTEM_PROMPT,
                template: DEFAULT_PROMPT_TEMPLATE
              }
            })
          ">
          <font-awesome-icon icon="rotate-left" />
          恢复默认模板
        </BaseButton>
      </BaseCard>

      <BaseCard>
        <SectionHeader compact title="策略开关" />
        <label class="check-item">
          <input
            type="checkbox"
            :checked="settings.behavior.allowCreateFolder"
            @change="onAllowCreateFolderChange" />
          允许推荐创建新文件夹
        </label>
        <label class="check-item">
          <input
            type="checkbox"
            :checked="settings.behavior.preferExistingFolder"
            @change="onPreferExistingFolderChange" />
          优先推荐已有结构，降低新建文件夹频率
        </label>
        <label class="check-item">
          <input
            type="checkbox"
            :checked="settings.behavior.storeKnowledge"
            @change="onStoreKnowledgeChange" />
          保存页面摘要、标签和推荐结果到本地知识库
        </label>
      </BaseCard>

      <BaseCard class="actions">
        <div class="status">{{ status }}</div>
        <div class="button-row">
          <BaseButton @click="exportBackup">
            <font-awesome-icon icon="file-export" />
            导出备份
          </BaseButton>
          <BaseButton @click="triggerImportBackup">
            <font-awesome-icon icon="folder-open" />
            导入备份
          </BaseButton>
          <BaseButton variant="primary" @click="saveSettings">
            <font-awesome-icon icon="floppy-disk" />
            保存配置
          </BaseButton>
        </div>
      </BaseCard>
    </template>

    <template v-else-if="tab === 'history'">
      <BaseCard class="history-header">
        <div>
          <SectionHeader compact title="内容整理" />
          <div class="status">{{ collectionsStatus }}</div>
        </div>
        <div class="button-row">
          <BaseButton @click="loadCollections">
            <font-awesome-icon icon="arrows-rotate" />
            刷新收藏夹
          </BaseButton>
          <BaseButton @click="refreshHistory">
            <font-awesome-icon icon="rotate-right" />
            刷新推荐
          </BaseButton>
          <BaseButton variant="primary" @click="applySelected">
            <font-awesome-icon icon="check" />
            应用选中项
          </BaseButton>
        </div>
      </BaseCard>

      <template v-if="!hasAnyManagedContent">
        <BaseCard class="empty-hero">
          <div class="empty-kicker">首次使用</div>
          <div class="empty-title">这里会成为你的历史整理工作台</div>
          <div class="empty-copy">
            当你在网页里划线抓取内容后，段落会先进入“未分类内容”。你也可以现在先创建一个空收藏夹，为后续整理预留结构。
          </div>
          <div class="empty-columns">
            <div class="empty-pill">1. 页面划线后自动入库</div>
            <div class="empty-pill">2. 支持新建空收藏夹</div>
            <div class="empty-pill">3. 可查看每段内容的原文</div>
          </div>
        </BaseCard>
      </template>

      <div class="history-grid">
        <BaseCard class="folders-panel">
          <div class="row">
            <SectionHeader compact title="收藏夹管理" />
          </div>
          <div class="folder-form">
            <input
              class="field"
              :value="folderNameInput"
              placeholder="新建收藏夹名称"
              @input="handleFolderNameInput" />
            <textarea
              class="field"
              rows="3"
              :value="folderDescriptionInput"
              placeholder="可选描述"
              @input="handleFolderDescriptionInput" />
            <div class="button-row">
              <BaseButton variant="primary" @click="saveFolder">
                <font-awesome-icon
                  :icon="editingFolderId ? 'floppy-disk' : 'folder-plus'" />
                {{ editingFolderId ? "保存收藏夹" : "新建空收藏夹" }}
              </BaseButton>
              <BaseButton v-if="editingFolderId" @click="resetFolderForm">
                取消编辑
              </BaseButton>
            </div>
          </div>

          <div class="folder-list">
            <button
              v-for="folder in collections.folders"
              :key="folder.id"
              class="folder-item"
              :class="{ active: activeFolderId === folder.id }"
              @click="activeFolderId = folder.id">
              <div class="folder-item-top">
                <div>
                  <div class="folder-name">{{ folder.name }}</div>
                  <div class="folder-desc">
                    {{ folder.description || "暂无描述" }}
                  </div>
                </div>
                <div class="folder-tools">
                  <span class="folder-count">
                    {{ getFolderItemCount(folder.id) }}
                  </span>
                  <button
                    v-if="!folder.isDefault"
                    class="mini-button"
                    type="button"
                    @click.stop="startEditFolder(folder)">
                    编辑
                  </button>
                  <button
                    v-if="!folder.isDefault"
                    class="mini-button danger"
                    type="button"
                    @click.stop="removeFolder(folder)">
                    删除
                  </button>
                </div>
              </div>
            </button>
          </div>
        </BaseCard>

        <BaseCard class="snippets-panel">
          <div class="row wrap">
            <div>
              <SectionHeader
                compact
                :title="
                  activeFolder ? `内容列表 · ${activeFolder.name}` : '内容列表'
                " />
              <div class="status">
                支持增删查改收藏夹中的内容，并查看每段内容的原始文本。
              </div>
            </div>
          </div>

          <div class="folder-form">
            <input
              class="field"
              :value="itemTitleInput"
              placeholder="新增段落标题"
              @input="handleItemTitleInput" />
            <textarea
              class="field"
              rows="4"
              :value="itemTextInput"
              placeholder="新增段落内容"
              @input="handleItemTextInput" />
            <div class="button-row">
              <BaseButton variant="primary" @click="createItem">
                <font-awesome-icon icon="plus" />
                新增内容
              </BaseButton>
            </div>
          </div>

          <div v-if="activeFolderItems.length === 0" class="soft-empty">
            当前收藏夹还没有内容。你可以直接新增一段内容，或者先去网页中划线抓取。
          </div>

          <div class="snippet-list">
            <CollectionSnippetCard
              v-for="item in activeFolderItems"
              :key="item.id"
              :item="item"
              :folders="collections.folders"
              :expanded="expandedItemIds.includes(item.id)"
              :editing="editingItemId === item.id"
              :draft-title="editingItemTitle"
              :draft-text="editingItemText"
              @toggle-expand="toggleExpandedItem"
              @start-edit="handleCollectionCardStartEdit"
              @cancel-edit="cancelEditItem"
              @update-draft-title="editingItemTitle = $event"
              @update-draft-text="editingItemText = $event"
              @save-edit="saveItem"
              @delete="removeItem"
              @move="moveItem" />
          </div>
        </BaseCard>
      </div>

      <BaseCard>
        <div class="row wrap">
          <div>
            <SectionHeader compact title="历史书签整理（高级）" />
            <div class="status">
              {{ historyStatus }}
              这部分会调整已有书签目录，适合在确认推荐结果后再批量处理。
            </div>
          </div>
        </div>
        <div v-if="historyItems.length === 0" class="soft-empty">
          当前没有可展示的历史推荐。
        </div>
        <div class="history-list">
          <HistoryItemCard
            v-for="item in historyItems"
            :key="item.bookmark.id"
            :checked="selectedIds.includes(item.bookmark.id)"
            :item="item"
            @toggle="toggleSelected" />
        </div>
      </BaseCard>
    </template>

    <template v-else-if="tab === 'knowledge-base'">
      <div class="knowledge-base-wrapper">
        <KnowledgeBase />
      </div>
    </template>

    <template v-else-if="tab === 'knowledge'">
      <BaseCard class="history-header">
        <div>
          <SectionHeader compact title="知识笔记库" />
          <div class="status">{{ knowledgeStatus }}</div>
        </div>
        <div class="button-row">
          <BaseButton @click="loadKnowledgeRecords">
            <font-awesome-icon icon="arrows-rotate" />
            刷新记录
          </BaseButton>
        </div>
      </BaseCard>

      <BaseCard>
        <div class="metrics-grid compact-grid">
          <div
            v-for="card in knowledgeInsightCards"
            :key="card.label"
            class="metric-panel">
            <div class="metric-label">{{ card.label }}</div>
            <div class="metric-value">{{ card.value }}</div>
          </div>
        </div>
      </BaseCard>

      <BaseCard>
        <div class="analytics-columns">
          <div>
            <div class="quickstart-title">目录分布</div>
            <div
              v-for="item in knowledgeFolderDistribution"
              :key="item.label"
              class="distribution-item">
              <div class="distribution-head">
                <span>{{ item.label }}</span>
                <span>{{ item.count }} · {{ formatPercent(item.ratio) }}</span>
              </div>
              <div class="distribution-track">
                <div
                  class="distribution-fill"
                  :style="distributionStyle(item.ratio)" />
              </div>
            </div>
          </div>
          <div>
            <div class="quickstart-title">标签频率</div>
            <div
              v-for="item in knowledgeTagDistribution"
              :key="item.label"
              class="distribution-item">
              <div class="distribution-head">
                <span>{{ item.label }}</span>
                <span>{{ item.count }} · {{ formatPercent(item.ratio) }}</span>
              </div>
              <div class="distribution-track">
                <div
                  class="distribution-fill warm"
                  :style="distributionStyle(item.ratio)" />
              </div>
            </div>
          </div>
        </div>
      </BaseCard>

      <BaseCard>
        <div class="knowledge-toolbar">
          <input
            v-model="knowledgeQuery"
            class="field"
            placeholder="搜索标题、标签、来源网址、分类、摘要或正文" />
          <div class="status">
            当前显示 {{ filteredKnowledgeItems.length }} /
            {{ knowledgeItems.length }} 条
          </div>
        </div>
      </BaseCard>

      <BaseCard v-if="filteredKnowledgeItems.length === 0" class="soft-empty">
        没有匹配的知识条目。可以先保存网页、确认书签归档，或换一个搜索词。
      </BaseCard>

      <BaseCard
        v-for="record in filteredKnowledgeItems"
        :key="record.id"
        class="knowledge-card">
        <div class="knowledge-head">
          <div>
            <div class="knowledge-title">{{ record.title }}</div>
            <div class="knowledge-url">{{ record.url }}</div>
          </div>
          <div class="knowledge-time">
            {{ formatKnowledgeTime(record.createdAt) }}
          </div>
        </div>
        <div class="knowledge-meta">
          <span
            >分类：{{ record.subCategory || record.category || "未分类" }}</span
          >
          <span>来源：{{ record.sourceType }}</span>
        </div>
        <div v-if="record.tags.length" class="tag-row">
          <span v-for="tag in record.tags" :key="tag" class="tag-chip">{{
            tag
          }}</span>
        </div>
        <div v-if="record.summary" class="knowledge-block">
          <div class="knowledge-label">摘要</div>
          <div>{{ record.summary }}</div>
        </div>
        <div v-if="record.content" class="knowledge-block">
          <div class="knowledge-label">内容摘录</div>
          <div class="knowledge-quote">{{ record.content.slice(0, 500) }}</div>
        </div>
      </BaseCard>
    </template>
  </main>
</template>

<style scoped>
.page {
  min-height: 100vh;
  padding: 32px;
  background: var(--sf-color-surface-soft);
  color: var(--sf-color-text);
  font-size: var(--sf-font-size-md);
  font-family: var(--sf-font-family);
}

:deep(.base-card) {
  max-width: 1180px;
  margin: 0 auto var(--sf-space-5);
  padding: var(--sf-space-6);
  border-radius: var(--sf-radius-xl);
}

.knowledge-base-wrapper {
  max-width: 1180px;
  margin: 0 auto;
  height: calc(100vh - 180px);
  display: flex;
  flex-direction: column;
}

.panel-head,
.row,
.actions,
.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--sf-space-4);
}

.wrap {
  align-items: flex-start;
}

.tab-actions,
.button-row,
.provider-tools {
  display: flex;
  gap: var(--sf-space-3);
  flex-wrap: wrap;
}

.eyebrow {
  font-size: var(--sf-font-size-xs);
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--sf-color-text-muted);
}

.title {
  font-size: var(--sf-font-size-2xl);
  font-weight: 800;
  margin-top: var(--sf-space-1);
}

.field {
  width: 100%;
  min-height: var(--sf-button-height);
  padding: var(--sf-space-3) var(--sf-space-4);
  border-radius: var(--sf-radius-md);
  border: 1px solid #d7deea;
  box-sizing: border-box;
  font-size: var(--sf-font-size-md);
  background: var(--sf-color-surface);
  resize: vertical;
}

.hidden-input {
  display: none;
}

.config-notice,
.quickstart-hero,
.quickstart-card {
  background: var(--sf-color-surface-soft);
}

.config-notice {
  margin-bottom: 16px;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid rgba(235, 186, 92, 0.22);
  color: #7a5a18;
  line-height: 1.7;
}

.quickstart-title {
  font-size: 18px;
  font-weight: 800;
  color: #22314f;
}

.quickstart-copy {
  margin-top: 10px;
  color: #5f6f89;
  line-height: 1.8;
}

.provider-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--sf-space-3);
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--sf-space-3);
}

.compact-grid {
  max-width: 1180px;
}

.metric-panel,
.event-card {
  border: 1px solid rgba(124, 148, 188, 0.16);
  border-radius: 18px;
  padding: 16px;
  background: var(--sf-color-surface-soft);
}

.metric-label {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #7b8ab1;
}

.metric-value {
  margin-top: 8px;
  font-size: 28px;
  font-weight: 800;
  color: #24324c;
}

.analytics-columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: var(--sf-space-4);
}

.distribution-item {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.distribution-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: #607089;
  font-size: 13px;
}

.distribution-track {
  height: 10px;
  border-radius: 999px;
  background: #edf3fb;
  overflow: hidden;
}

.distribution-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--sf-color-surface-soft);
}

.distribution-fill.warm {
  background: var(--sf-color-surface-soft);
}

.table-scroll {
  overflow-x: auto;
}

.stats-table {
  width: 100%;
  border-collapse: collapse;
}

.stats-table th,
.stats-table td {
  padding: 12px 14px;
  border-bottom: 1px solid #dfe8f4;
  text-align: left;
}

.stats-table th {
  color: #607089;
  font-size: 13px;
}

.provider-card {
  width: 100%;
  border: 1px solid rgba(123, 153, 205, 0.18);
  border-radius: 18px;
  padding: 16px;
  background: var(--sf-color-surface-soft);
  text-align: left;
  cursor: pointer;
}

.provider-card.active {
  border-color: rgba(104, 147, 255, 0.42);
  box-shadow: 0 12px 24px rgba(97, 129, 184, 0.12);
  background: var(--sf-color-surface-soft);
}

.provider-card-top {
  display: flex;
  justify-content: space-between;
  gap: var(--sf-space-3);
  align-items: flex-start;
}

.provider-name {
  font-size: 15px;
  font-weight: 800;
  color: #23324d;
}

.provider-model,
.provider-url {
  margin-top: 4px;
  color: #6f809d;
  font-size: 12px;
  line-height: 1.6;
  word-break: break-all;
}

.provider-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: #edf4ff;
  color: #5570a1;
  font-size: 12px;
  font-weight: 800;
}

.mini-icon {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  border: 0;
  background: #f0f4fb;
  color: #5a6e97;
  cursor: pointer;
}

.mini-icon.danger {
  background: #ffe9ed;
  color: #ca3654;
}

.secret-field {
  position: relative;
}

.secret-input {
  padding-right: 52px;
}

.eye-button {
  position: absolute;
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 999px;
  background: #edf4ff;
  color: #5570a1;
  cursor: pointer;
}

.check-item {
  display: flex;
  gap: var(--sf-space-2);
  margin-bottom: var(--sf-space-3);
  font-size: var(--sf-font-size-sm);
}

.status {
  color: var(--sf-color-text-muted);
  font-size: var(--sf-font-size-md);
  line-height: 1.6;
}

.history-grid {
  max-width: 1180px;
  margin: 0 auto var(--sf-space-5);
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: var(--sf-space-5);
}

.folders-panel,
.snippets-panel {
  margin: 0;
}

.folder-form {
  display: grid;
  gap: 12px;
}

.knowledge-toolbar {
  display: grid;
  gap: 12px;
}

.folder-list,
.snippet-list,
.history-list {
  display: flex;
  flex-direction: column;
  gap: var(--sf-space-3);
  margin-top: 18px;
}

.folder-item {
  width: 100%;
  padding: 16px;
  border: 1px solid rgba(124, 148, 188, 0.16);
  border-radius: 18px;
  background: var(--sf-color-surface-soft);
  text-align: left;
  cursor: pointer;
}

.folder-item.active {
  border-color: rgba(104, 147, 255, 0.5);
  box-shadow: 0 12px 24px rgba(97, 129, 184, 0.12);
  background: var(--sf-color-surface-soft);
}

.folder-item-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.folder-name {
  font-size: 15px;
  font-weight: 800;
  color: #23324d;
}

.folder-desc {
  margin-top: 4px;
  color: #7b879f;
  font-size: 12px;
  line-height: 1.5;
}

.folder-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.folder-count {
  min-width: 28px;
  height: 28px;
  border-radius: 999px;
  background: #edf4ff;
  color: #5570a1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 800;
}

.mini-button {
  border: 0;
  border-radius: 999px;
  padding: 6px 10px;
  background: #f0f4fb;
  color: #5a6e97;
  cursor: pointer;
}

.mini-button.danger {
  background: #ffe9ed;
  color: #ca3654;
}

.empty-hero {
  text-align: left;
  background: var(--sf-color-surface-soft);
}

.empty-kicker {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #7d8bb0;
}

.empty-title {
  margin-top: 10px;
  font-size: 28px;
  font-weight: 800;
  color: #24324c;
}

.empty-copy {
  max-width: 680px;
  margin-top: 12px;
  line-height: 1.8;
  color: #62708a;
}

.empty-columns {
  margin-top: 20px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.empty-pill {
  padding: 10px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid rgba(128, 154, 199, 0.14);
  color: #526689;
}

.soft-empty {
  margin-top: 18px;
  border-radius: 18px;
  padding: 20px;
  background: #f7faff;
  color: #66758d;
  line-height: 1.7;
}

.knowledge-card {
  display: grid;
  gap: 14px;
}

.knowledge-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.knowledge-title {
  font-size: 18px;
  font-weight: 800;
  color: #22314f;
}

.knowledge-url {
  margin-top: 6px;
  color: #6f809d;
  word-break: break-all;
  font-size: 13px;
}

.knowledge-time {
  color: #7b8ab1;
  font-size: 12px;
  white-space: nowrap;
}

.knowledge-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 18px;
  color: #607089;
  font-size: 13px;
}

.knowledge-block {
  display: grid;
  gap: 6px;
  padding: 14px;
  border-radius: 16px;
  background: #f7faff;
  color: #24314a;
  line-height: 1.7;
}

.knowledge-label {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #7b8ab1;
}

.knowledge-quote {
  white-space: pre-wrap;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-chip {
  padding: 4px 10px;
  border-radius: 999px;
  background: #e8f3ff;
  color: #4d6d99;
  font-size: 12px;
}

@media (max-width: 980px) {
  .page {
    padding: 18px;
  }

  .history-grid {
    grid-template-columns: 1fr;
  }

  .panel-head,
  .row,
  .actions,
  .history-header,
  .knowledge-head {
    flex-direction: column;
    align-items: stretch;
  }
}

/* Notebook theme override: remove gradients and vivid fills */
.page {
  background: var(--sf-color-bg) !important;
}

.config-notice,
.quickstart-hero,
.quickstart-card,
.metric-panel,
.event-card,
.provider-card,
.folder-item,
.knowledge-card,
.empty-hero,
.history-item,
.snippets-panel,
.folders-panel {
  background: var(--sf-color-surface) !important;
  border-color: var(--sf-color-border-medium) !important;
  box-shadow: none !important;
}

.provider-card.active,
.folder-item.active {
  background: var(--sf-color-surface-soft) !important;
  border-color: var(--sf-color-accent) !important;
}

.distribution-track {
  background: var(--sf-color-surface-soft) !important;
}

.distribution-fill,
.distribution-fill.warm {
  background: var(--sf-color-accent) !important;
}

.provider-badge,
.folder-count,
.tag-chip,
.mini-button,
.mini-icon,
.eye-button {
  background: var(--sf-color-surface-soft) !important;
  color: var(--sf-color-text-muted) !important;
}

.mini-button.danger,
.mini-icon.danger {
  background: var(--sf-color-error-soft) !important;
  color: var(--sf-color-error) !important;
}

.field,
.secret-input {
  border-color: var(--sf-color-border-medium) !important;
}
</style>
