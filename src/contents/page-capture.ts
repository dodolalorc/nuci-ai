import type { PlasmoCSConfig } from "plasmo"
import { createApp, reactive } from "vue"
import "../ui/design-tokens.css"

import { getProviderConfigNotice } from "../sdk/provider"
import { registerFontAwesome } from "../ui/fontawesome"
import type {
  AiModelProfile,
  CapturedSnippet,
  CapturePageResponse,
  PageContext,
  PageCaptureDraft,
  PageDigestSegment
} from "../sdk/types"
import {
  ROOT_ID,
  ensureCaptureStyles,
  ensureHighlightBox,
  ensureOverlayRoot,
  hideHighlight,
  updateHighlightRect
} from "./capture/dom"
import {
  createSnippet,
  cssPathFor,
  getCurrentSelectionText,
  getPageArticleText,
  getPageArticleSegments,
  getPageContext
} from "./capture/extract"
import PageCaptureOverlay from "../content-ui/PageCaptureOverlay.vue"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"]
}

const SIDEBAR_MIN_WIDTH = 400
const SIDEBAR_MAX_WIDTH = 720
const DEFAULT_SIDEBAR_WIDTH = 420

const estimateTokens = (text: string) => Math.max(1, Math.ceil(text.length / 4))

type OverlayState = {
  draft: PageCaptureDraft
  sidebarOpen: boolean
  sidebarWidth: number
  aiDialogOpen: boolean
  elementPickMode: boolean
  status: string
  aiStatus: string
  aiConfigNotice: string
  aiConfigured: boolean
  bookmarkPromptVisible: boolean
  selectionText: string
  articleTitle: string
  articleUrl: string
  articleAuthor: string
  articleDate: string
  articleContent: string
  aiSummaryContent: string
  articleSegments: PageDigestSegment[]
  articleMode: "full" | "segments"
  aiPrompt: string
  aiModelId: string
  aiModelLabel: string
  aiTokenEstimate: number
  aiCharCount: number
  aiRunning: boolean
  aiModels: AiModelProfile[]
  selectionAnchorVisible: boolean
  selectionAnchorHovered: boolean
  selectionAnchor: {
    top: number
    left: number
  }
}

const state = reactive<OverlayState>({
  draft: {
    url: location.href,
    snippets: [],
    updatedAt: new Date().toISOString()
  },
  sidebarOpen: false,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  aiDialogOpen: false,
  elementPickMode: false,
  status: "等待抓取",
  aiStatus: "等待整理当前页面…",
  aiConfigNotice: "",
  aiConfigured: false,
  bookmarkPromptVisible: false,
  selectionText: "",
  articleTitle: "",
  articleUrl: location.href,
  articleAuthor: "",
  articleDate: "",
  articleContent: "",
  aiSummaryContent: "",
  articleSegments: [],
  articleMode: "full",
  aiPrompt: "",
  aiModelId: "",
  aiModelLabel: "",
  aiTokenEstimate: 0,
  aiCharCount: 0,
  aiRunning: false,
  aiModels: [],
  selectionAnchorVisible: false,
  selectionAnchorHovered: false,
  selectionAnchor: {
    top: 0,
    left: 0
  }
})

let overlayMounted = false

const clampSidebarWidth = (width: number) =>
  Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, Math.round(width)))

const applyViewportInset = () => {
  const width = state.sidebarOpen ? `${state.sidebarWidth}px` : "0px"
  document.documentElement.style.marginRight = width
  document.body.style.marginRight = width
}

const sendMessage = async <T>(type: string, payload?: unknown) => {
  const response = await chrome.runtime.sendMessage({
    type,
    payload
  })

  if (!response?.ok) {
    throw new Error(response?.error || "内容脚本消息失败")
  }

  return response.payload as T
}

const fetchDraft = async () => {
  state.draft = await sendMessage<PageCaptureDraft>(
    "bookmarks-collector/get-capture-draft",
    location.href
  )
  hydrateArticleFields(getPageContext())
  await hydrateModels()
  renderOverlay()
}

const hydrateArticleFields = (page: PageContext) => {
  const articleContent = getPageArticleText()
  const articleSegments = getPageArticleSegments()
  state.articleTitle = page.title || document.title || location.hostname
  state.articleUrl = page.url || location.href
  state.articleAuthor = page.author || ""
  state.articleDate = page.publishedAt || ""
  state.articleContent = articleContent
  state.aiSummaryContent = ""
  state.articleSegments = articleSegments
  state.aiCharCount = articleContent.length
  state.aiTokenEstimate = estimateTokens(articleContent)
}

const hydrateModels = async () => {
  const settings = await sendMessage<{
    provider: {
      model: string
      apiKey?: string
      baseUrl?: string
    }
    providers: AiModelProfile[]
    activeProviderId: string
  }>("bookmarks-collector/get-settings")

  state.aiModels = settings.providers ?? []
  state.aiModelId = settings.activeProviderId || settings.providers?.[0]?.id || ""
  const activeModel =
    settings.providers.find((provider) => provider.id === state.aiModelId) ??
    settings.providers[0]

  state.aiModelLabel =
    activeModel?.label || activeModel?.model || settings.provider.model || "未配置模型"
  state.aiConfigured = Boolean(
    activeModel?.apiKey?.trim() && activeModel?.baseUrl?.trim() && activeModel?.model?.trim()
  )
  state.aiConfigNotice = activeModel
    ? getProviderConfigNotice(activeModel)
    : "尚未配置模型，请前往插件管理页 > 模型配置进行配置。"
}

const storeSnippet = async (snippet: CapturedSnippet) => {
  state.draft = await sendMessage<PageCaptureDraft>(
    "bookmarks-collector/add-captured-snippet",
    {
      url: location.href,
      snippet
    }
  )
  renderOverlay()
}

const removeSnippet = async (snippetId: string) => {
  state.draft = await sendMessage<PageCaptureDraft>(
    "bookmarks-collector/remove-captured-snippet",
    {
      url: location.href,
      snippetId
    }
  )
  renderOverlay()
}

const analyzeSnippet = async (snippetId: string) => {
  state.status = "正在分析该段内容…"
  renderOverlay()

  state.draft = await sendMessage<PageCaptureDraft>(
    "bookmarks-collector/analyze-captured-snippet",
    {
      url: location.href,
      snippetId
    }
  )

  state.status = "该片段分析完成。"
  renderOverlay()
}

const updateSnippetTags = async (snippetId: string, tags: string[]) => {
  state.status = "正在保存标签…"
  renderOverlay()

  state.draft = await sendMessage<PageCaptureDraft>(
    "bookmarks-collector/update-captured-snippet-tags",
    {
      url: location.href,
      snippetId,
      tags
    }
  )

  state.status = "片段标签已更新。"
  renderOverlay()
}

const analyzeAllSnippets = async (force = false) => {
  state.status = force ? "正在重新分析全部片段…" : "正在分析全部片段…"
  renderOverlay()

  state.draft = await sendMessage<PageCaptureDraft>(
    "bookmarks-collector/analyze-all-captured-snippets",
    {
      url: location.href,
      force
    }
  )

  state.status = force ? "全部片段已重新分析。" : "全部片段分析完成。"
  renderOverlay()
}

const openExtensionPage = async (path: string) => {
  await sendMessage<{ success: boolean }>("bookmarks-collector/open-extension-page", {
    path
  })
}

const quickSaveToKnowledge = async () => {
  state.status = "正在保存到知识库…"
  renderOverlay()

  try {
    await sendMessage("knowledge/quick-save", {
      sourceType: "page"
    })
    state.status = "已保存到知识库。"
  } catch (error) {
    state.status =
      error instanceof Error ? error.message : "保存到知识库失败，请稍后重试。"
  } finally {
    renderOverlay()
  }
}

const renderOverlay = () => {
  state.selectionText = getCurrentSelectionText()
  applyViewportInset()

  if (overlayMounted) {
    return
  }

  overlayMounted = true

  const app = createApp(PageCaptureOverlay, {
    state,
    onToggleSidebar: () => {
      state.sidebarOpen = !state.sidebarOpen
      applyViewportInset()
      renderOverlay()
    },
    onOpenSidebar: () => {
      state.sidebarOpen = true
      applyViewportInset()
      state.status = "已打开页面抓取面板。"
      renderOverlay()
    },
    onToggleAiDialog: () => {
      state.aiDialogOpen = !state.aiDialogOpen
      if (state.aiDialogOpen) {
        hydrateArticleFields(getPageContext())
        void hydrateModels()
      }
      renderOverlay()
    },
    onOpenAiDialog: () => {
      state.aiDialogOpen = true
      hydrateArticleFields(getPageContext())
      void hydrateModels()
      renderOverlay()
    },
    onCloseAiDialog: () => {
      state.aiDialogOpen = false
      renderOverlay()
    },
    onStartSidebarResize: (event: MouseEvent) => {
      const startX = event.clientX
      const startWidth = state.sidebarWidth

      const onMouseMove = (moveEvent: MouseEvent) => {
        const nextWidth = clampSidebarWidth(startWidth + (startX - moveEvent.clientX))
        state.sidebarWidth = nextWidth
        applyViewportInset()
        renderOverlay()
      }

      const stopResize = () => {
        document.removeEventListener("mousemove", onMouseMove, true)
        document.removeEventListener("mouseup", stopResize, true)
      }

      document.addEventListener("mousemove", onMouseMove, true)
      document.addEventListener("mouseup", stopResize, true)
    },
    onCaptureSelection: () => {
      void captureSelection()
    },
    onToggleElementMode: () => {
      state.elementPickMode = !state.elementPickMode
      state.sidebarOpen = true
      applyViewportInset()
      state.status = state.elementPickMode
        ? "框选模式已开启，点击页面区域即可抓取一段内容。"
        : "框选模式已关闭。"
      renderOverlay()
    },
    onStartElementMode: () => {
      state.elementPickMode = true
      state.sidebarOpen = true
      applyViewportInset()
      state.status = "框选模式已开启，点击页面区域即可抓取一段内容。"
      renderOverlay()
    },
    onDeleteSnippet: (snippetId: string) => {
      void removeSnippet(snippetId).then(() => renderOverlay())
    },
    onAnalyzeSnippet: (snippetId: string) => {
      void analyzeSnippet(snippetId)
    },
    onSaveSnippetTags: (payload: { snippetId: string; tags: string[] }) => {
      void updateSnippetTags(payload.snippetId, payload.tags)
    },
    onAnalyzeAllSnippets: () => {
      void analyzeAllSnippets(false)
    },
    onReanalyzeAllSnippets: () => {
      void analyzeAllSnippets(true)
    },
    onOpenOptions: () => {
      void openExtensionPage("tabs/manage.html")
    },
    onOpenHistory: () => {
      void openExtensionPage("tabs/manage.html#history")
    },
    onRefreshArticle: () => {
      hydrateArticleFields(getPageContext())
      state.aiStatus = "已重新抓取当前页面正文。"
      renderOverlay()
    },
    onUpdateArticleMeta: (payload: {
      title?: string
      url?: string
      author?: string
      date?: string
      content?: string
      prompt?: string
      modelId?: string
      mode?: "full" | "segments"
      segmentId?: string
      segmentSelected?: boolean
    }) => {
      if (typeof payload.title === "string") {
        state.articleTitle = payload.title
      }
      if (typeof payload.url === "string") {
        state.articleUrl = payload.url
      }
      if (typeof payload.author === "string") {
        state.articleAuthor = payload.author
      }
      if (typeof payload.date === "string") {
        state.articleDate = payload.date
      }
      if (typeof payload.content === "string") {
        state.articleContent = payload.content
        state.aiCharCount = payload.content.length
        state.aiTokenEstimate = estimateTokens(payload.content)
      }
      if (typeof payload.prompt === "string") {
        state.aiPrompt = payload.prompt
      }
      if (typeof payload.modelId === "string") {
        state.aiModelId = payload.modelId
        const activeModel =
          state.aiModels.find((provider) => provider.id === payload.modelId) ??
          state.aiModels[0]
        state.aiModelLabel = activeModel?.label || activeModel?.model || "未配置模型"
        state.aiConfigured = Boolean(
          activeModel?.apiKey?.trim() && activeModel?.baseUrl?.trim() && activeModel?.model?.trim()
        )
        state.aiConfigNotice = activeModel
          ? getProviderConfigNotice(activeModel)
          : "尚未配置模型，请前往插件管理页 > 模型配置进行配置。"
        void sendMessage("bookmarks-collector/update-active-provider", {
          providerId: payload.modelId
        }).catch(() => undefined)
      }
      if (payload.mode) {
        state.articleMode = payload.mode
      }
      if (payload.segmentId && typeof payload.segmentSelected === "boolean") {
        state.articleSegments = state.articleSegments.map((segment) =>
          segment.id === payload.segmentId
            ? {
              ...segment,
              selected: payload.segmentSelected
            }
            : segment
        )
      }
      renderOverlay()
    },
    onSummarizeArticle: () => {
      void summarizeArticle()
    },
    onSmartSelectSegments: () => {
      void smartSelectSegments()
    },
    onSelectAllSegments: (selected: boolean) => {
      state.articleSegments = state.articleSegments.map((segment) => ({
        ...segment,
        selected
      }))
      renderOverlay()
    },
    onQuickSaveToKnowledge: () => {
      void quickSaveToKnowledge()
    },
    onClassifyNow: () => {
      state.bookmarkPromptVisible = false
      state.sidebarOpen = true
      applyViewportInset()
      state.status = "已打开当前页面抓取面板。你可以先补充知识片段，再进入历史整理。"
      renderOverlay()
    },
    onDismissBookmarkPrompt: () => {
      state.bookmarkPromptVisible = false
      renderOverlay()
    },
    onShowSelectionPrompt: () => {
      state.selectionAnchorHovered = true
      renderOverlay()
    },
    onHideSelectionPrompt: () => {
      window.setTimeout(() => {
        state.selectionAnchorHovered = false
        renderOverlay()
      }, 120)
    }
  })

  registerFontAwesome(app)
  app.mount(ensureOverlayRoot())
}

const captureSelection = async () => {
  const text = getCurrentSelectionText()

  if (text.length < 2) {
    state.status = "先在页面中选中一段文字。"
    renderOverlay()
    return
  }

  await storeSnippet(createSnippet("selection", text.slice(0, 2000), "selection"))
  state.status = "已把选中文本加入当前页面知识列表。"
  state.sidebarOpen = true
  state.selectionAnchorVisible = false
  state.selectionAnchorHovered = false
  applyViewportInset()
  renderOverlay()
}

const summarizeArticle = async () => {
  if (!state.aiConfigured) {
    state.aiStatus = state.aiConfigNotice || "尚未配置模型，请前往插件管理页 > 模型配置进行配置。"
    renderOverlay()
    return
  }

  if (!state.articleContent.trim()) {
    state.aiStatus = "当前页面没有抓取到可整理的正文。"
    renderOverlay()
    return
  }

  if (
    state.articleMode === "segments" &&
    !state.articleSegments.some((segment) => segment.selected)
  ) {
    state.aiStatus = "分段模式下至少需要保留一段正文。"
    renderOverlay()
    return
  }

  state.aiRunning = true
  state.aiStatus = "正在将当前页面整理成 AI 易读格式…"
  renderOverlay()

  try {
    const page = getPageContext()
    const activeSegments = state.articleSegments.filter((segment) => segment.selected)
    const result = await sendMessage<{
      modelLabel: string
      providerId: string
      content: string
      tokenEstimate: number
    }>("bookmarks-collector/summarize-page-content", {
      page: {
        ...page,
        title: state.articleTitle.trim() || page.title,
        url: state.articleUrl.trim() || page.url,
        author: state.articleAuthor.trim() || page.author,
        publishedAt: state.articleDate.trim() || page.publishedAt
      },
      content: state.articleContent,
      mode: state.articleMode,
      segments: activeSegments,
      prompt: state.aiPrompt,
      providerId: state.aiModelId
    })

    state.aiSummaryContent = result.content
    state.aiModelId = result.providerId
    state.aiModelLabel = result.modelLabel
    state.aiStatus = `已完成一键总结，当前使用模型：${result.modelLabel}`
  } catch (error) {
    state.aiStatus =
      error instanceof Error ? error.message : "AI 整理失败，请稍后再试。"
  } finally {
    state.aiRunning = false
    renderOverlay()
  }
}

const smartSelectSegments = async () => {
  if (!state.aiConfigured) {
    state.aiStatus = state.aiConfigNotice || "尚未配置模型，请前往插件管理页 > 模型配置进行配置。"
    renderOverlay()
    return
  }

  if (state.articleSegments.length === 0) {
    state.aiStatus = "当前页面没有可供分段筛选的正文。"
    renderOverlay()
    return
  }

  state.aiRunning = true
  state.aiStatus = "正在智能选取正文相关段落…"
  renderOverlay()

  try {
    const result = await sendMessage<{
      selectedSegmentIds: string[]
      reasons: Array<{ segmentId: string; reason: string }>
      modelLabel: string
    }>("bookmarks-collector/select-relevant-segments", {
      page: getPageContext(),
      content: state.articleContent,
      mode: "segments",
      segments: state.articleSegments,
      providerId: state.aiModelId
    })

    const reasonMap = new Map(
      result.reasons.map((item) => [item.segmentId, item.reason] as const)
    )

    state.articleSegments = state.articleSegments.map((segment) => ({
      ...segment,
      selected: result.selectedSegmentIds.includes(segment.id),
      reason: reasonMap.get(segment.id)
    }))
    state.aiStatus = `已完成智能选取，当前使用模型：${result.modelLabel}`
  } catch (error) {
    state.aiStatus =
      error instanceof Error ? error.message : "智能选取失败，请稍后再试。"
  } finally {
    state.aiRunning = false
    renderOverlay()
  }
}
const updateSelectionAnchor = () => {
  const selection = window.getSelection?.()
  const text = selection?.toString().trim() ?? ""

  if (!selection || selection.rangeCount === 0 || text.length < 2) {
    state.selectionAnchorVisible = false
    state.selectionAnchorHovered = false
    renderOverlay()
    return
  }

  const range = selection.getRangeAt(0).cloneRange()
  const rects = range.getClientRects()
  const lastRect = rects[rects.length - 1]

  if (!lastRect) {
    state.selectionAnchorVisible = false
    state.selectionAnchorHovered = false
    renderOverlay()
    return
  }

  state.selectionText = text
  state.selectionAnchorVisible = true
  const sidebarInset = state.sidebarOpen ? state.sidebarWidth : 0
  const maxLeft = Math.max(24, window.innerWidth - sidebarInset - 24)
  const maxTop = Math.max(24, window.innerHeight - 24)

  state.selectionAnchor.top = Math.min(lastRect.bottom + 12, maxTop)
  state.selectionAnchor.left = Math.min(Math.max(lastRect.right, 24), maxLeft)
  renderOverlay()
}

const bindElementPicker = () => {
  const highlight = ensureHighlightBox() as HTMLElement

  document.addEventListener(
    "mousemove",
    (event) => {
      if (!state.elementPickMode) {
        hideHighlight(highlight)
        return
      }

      const target = event.target
      if (!(target instanceof Element) || target.closest(`#${ROOT_ID}`)) {
        hideHighlight(highlight)
        return
      }

      const rect = target.getBoundingClientRect()
      updateHighlightRect(highlight, rect, window.scrollX, window.scrollY)
    },
    true
  )

  document.addEventListener(
    "click",
    async (event) => {
      if (!state.elementPickMode) {
        return
      }

      const target = event.target
      if (!(target instanceof Element) || target.closest(`#${ROOT_ID}`)) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const text = target.textContent?.replace(/\s+/g, " ").trim() ?? ""
      if (text.length < 8) {
        state.status = "这个区域内容太短，换一个更完整的内容块。"
        renderOverlay()
        return
      }

      await storeSnippet(
        createSnippet(
          "element",
          text.slice(0, 2000),
          target.tagName.toLowerCase(),
          cssPathFor(target)
        )
      )

      state.status = `已加入一个页面区域：${target.tagName.toLowerCase()}`
      state.sidebarOpen = true
      state.bookmarkPromptVisible = false
      applyViewportInset()
      hideHighlight(highlight)
      renderOverlay()
    },
    true
  )
}

const openCaptureSidebarFromFloatingMenu = () => {
  state.sidebarOpen = true
  state.bookmarkPromptVisible = false
  applyViewportInset()
  state.status = "已打开页面抓取面板。"
  renderOverlay()
}

const startElementModeFromFloatingMenu = () => {
  state.elementPickMode = true
  state.sidebarOpen = true
  state.bookmarkPromptVisible = false
  applyViewportInset()
  state.status = "框选模式已开启，点击页面区域即可抓取一段内容。"
  renderOverlay()
}

ensureCaptureStyles()

document.addEventListener("selectionchange", () => {
  window.requestAnimationFrame(updateSelectionAnchor)
})

document.addEventListener(
  "mousedown",
  (event) => {
    const target = event.target
    if (target instanceof Element && target.closest(`#${ROOT_ID}`)) {
      return
    }

    if (state.selectionAnchorHovered) {
      return
    }

    state.selectionAnchorVisible = false
    state.selectionAnchorHovered = false
    renderOverlay()
  },
  true
)

window.addEventListener("scroll", () => {
  if (state.selectionAnchorVisible) {
    updateSelectionAnchor()
  }
})

window.addEventListener("kc-page-capture-open-sidebar", () => {
  openCaptureSidebarFromFloatingMenu()
})

window.addEventListener("kc-page-capture-start-element-mode", () => {
  startElementModeFromFloatingMenu()
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "bookmarks-collector/capture-page") {
    state.selectionText = getCurrentSelectionText()
    sendResponse({
      page: getPageContext(),
      selectionText: state.selectionText,
      snippets: state.draft.snippets,
      extractedAt: new Date().toISOString()
    } satisfies CapturePageResponse)
    return
  }

  if (message?.type === "bookmarks-collector/bookmark-created") {
    state.bookmarkPromptVisible = true
    state.status = "检测到你刚刚收藏了当前页面。"
    renderOverlay()

    window.setTimeout(() => {
      if (state.bookmarkPromptVisible) {
        state.bookmarkPromptVisible = false
        renderOverlay()
      }
    }, 12000)
  }
})

void fetchDraft()
bindElementPicker()
renderOverlay()
