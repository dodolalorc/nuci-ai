<script setup lang="ts">
import { computed } from "vue"

import type {
  AiModelProfile,
  CapturedSnippet,
  PageDigestSegment
} from "../sdk/types"
import OverlaySnippetCard from "./OverlaySnippetCard.vue"

type OverlayStateView = {
  draft: {
    snippets: CapturedSnippet[]
  }
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

const props = defineProps<{
  state: OverlayStateView
}>()

const emit = defineEmits<{
  toggleSidebar: []
  openSidebar: []
  toggleAiDialog: []
  openAiDialog: []
  closeAiDialog: []
  startSidebarResize: [event: MouseEvent]
  captureSelection: []
  toggleElementMode: []
  startElementMode: []
  deleteSnippet: [snippetId: string]
  analyzeSnippet: [snippetId: string]
  saveTags: [payload: { snippetId: string; tags: string[] }]
  analyzeAllSnippets: []
  reanalyzeAllSnippets: []
  openOptions: []
  openHistory: []
  refreshArticle: []
  updateArticleMeta: [
    payload: {
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
    }
  ]
  summarizeArticle: []
  smartSelectSegments: []
  selectAllSegments: [selected: boolean]
  classifyNow: []
  dismissBookmarkPrompt: []
  showSelectionPrompt: []
  hideSelectionPrompt: []
}>()

const FLOATING_BALL_TOP = 84

const pageEdgeOffset = computed(() =>
  props.state.sidebarOpen ? props.state.sidebarWidth + 20 : 20
)

const promptRight = computed(() => `${pageEdgeOffset.value + 52}px`)

const selectionPromptStyle = computed(() => ({
  top: `${props.state.selectionAnchor.top + 22}px`,
  left: `${Math.max(props.state.selectionAnchor.left - 44, 16)}px`
}))

const selectionDotStyle = computed(() => ({
  top: `${props.state.selectionAnchor.top}px`,
  left: `${props.state.selectionAnchor.left}px`
}))

const aiMetaSummary = computed(() => [
  { label: "字符", value: props.state.aiCharCount.toLocaleString() },
  { label: "预估 Token", value: props.state.aiTokenEstimate.toLocaleString() },
  { label: "模型", value: props.state.aiModelLabel || "未配置模型" }
])

const selectedSegmentCount = computed(
  () => props.state.articleSegments.filter((segment) => segment.selected).length
)

const onTextInput =
  (key: "title" | "url" | "author" | "date" | "content" | "prompt") =>
  (event: Event) => {
    const target = event.target
    if (
      !(target instanceof HTMLInputElement) &&
      !(target instanceof HTMLTextAreaElement)
    ) {
      return
    }

    emit("updateArticleMeta", {
      [key]: target.value
    })
  }

const onModelChange = (event: Event) => {
  const target = event.target
  if (!(target instanceof HTMLSelectElement)) {
    return
  }

  emit("updateArticleMeta", {
    modelId: target.value
  })
}

const onModeChange = (mode: "full" | "segments") => {
  emit("updateArticleMeta", {
    mode
  })
}

const onSegmentToggle = (segmentId: string, selected: boolean) => {
  emit("updateArticleMeta", {
    segmentId,
    segmentSelected: selected
  })
}
</script>

<template>
  <div class="overlay-root">
    <div
      v-if="state.bookmarkPromptVisible"
      class="prompt"
      :style="{ right: promptRight }">
      <div class="prompt-title">检测到你收藏了当前页面</div>
      <div class="prompt-text">
        要不要现在整理标签，并补充当前页面里的知识片段？
      </div>
      <div class="prompt-actions">
        <button class="chip chip-gradient" @click="emit('classifyNow')">
          <font-awesome-icon icon="bolt" />
          立即处理
        </button>
        <button class="chip" @click="emit('dismissBookmarkPrompt')">
          <font-awesome-icon icon="clock" />
          稍后
        </button>
      </div>
    </div>

    <div
      v-if="state.selectionAnchorVisible"
      class="selection-anchor-wrap"
      :style="selectionDotStyle"
      @mouseenter="emit('showSelectionPrompt')"
      @mouseleave="emit('hideSelectionPrompt')">
      <button class="selection-anchor" title="将选中文本加入当前知识片段">
        <span class="selection-anchor-core"></span>
      </button>
      <div
        v-if="state.selectionAnchorHovered"
        class="selection-anchor-pop"
        :style="selectionPromptStyle">
        <div class="selection-anchor-title">加入当前抓取面板</div>
        <div class="selection-anchor-copy">
          选中文本后，这个按钮会出现在选择区域末尾，方便直接加入当前页面草稿。
        </div>
        <button class="chip chip-gradient" @click="emit('captureSelection')">
          <font-awesome-icon icon="highlighter" />
          选择加入
        </button>
      </div>
    </div>

    <aside
      class="page-sidebar"
      :class="{ open: state.sidebarOpen }"
      :style="{ width: `${state.sidebarWidth}px` }">
      <button
        class="resize-handle"
        title="拖动调整宽度"
        @mousedown.prevent="emit('startSidebarResize', $event)" />

      <div class="sidebar-head">
        <div class="sidebar-title-wrap">
          <div class="sidebar-eyebrow">Page Capture</div>
          <div class="sidebar-title">页面知识抓取</div>
          <div class="sidebar-subtitle">
            这里像浏览器侧边工具一样嵌入页面右侧。打开后会为页面预留宽度，避免直接遮挡正文。
          </div>
        </div>
        <button class="icon-button" @click="emit('toggleSidebar')">
          <font-awesome-icon icon="xmark" />
        </button>
      </div>

      <div class="sidebar-status">{{ state.status }}</div>

      <div class="toolbar">
        <button class="chip chip-gradient" @click="emit('captureSelection')">
          <font-awesome-icon icon="highlighter" />
          抓取当前选中
        </button>
        <button class="chip" @click="emit('toggleElementMode')">
          <font-awesome-icon icon="vector-square" />
          {{ state.elementPickMode ? "退出框选模式" : "开启框选模式" }}
        </button>
        <button class="chip" @click="emit('analyzeAllSnippets')">
          <font-awesome-icon icon="wand-magic-sparkles" />
          分析全部
        </button>
        <button class="chip" @click="emit('reanalyzeAllSnippets')">
          <font-awesome-icon icon="arrows-rotate" />
          重新分析
        </button>
      </div>

      <div v-if="state.selectionText" class="selection-panel">
        <div class="selection-label">Current Selection</div>
        <div class="selection-text">
          {{ state.selectionText.slice(0, 280) }}
        </div>
      </div>

      <div class="snippet-list">
        <div v-if="state.draft.snippets.length === 0" class="empty-state">
          这里会展示当前页面抓取到的知识片段。你可以先选中文本直接加入，也可以开启框选模式抓取页面某个区域。
        </div>
        <OverlaySnippetCard
          v-for="snippet in state.draft.snippets"
          :key="snippet.id"
          :snippet="snippet"
          @analyze="emit('analyzeSnippet', $event)"
          @save-tags="emit('saveTags', $event)"
          @delete="emit('deleteSnippet', $event)" />
      </div>

      <div class="sidebar-footer">
        <div class="footer-text">模型配置和内容整理都在管理台里</div>
        <div class="footer-actions">
          <button
            class="icon-button"
            title="模型配置"
            @click="emit('openOptions')">
            <font-awesome-icon icon="gear" />
          </button>
          <button
            class="icon-button"
            title="内容整理"
            @click="emit('openHistory')">
            <font-awesome-icon icon="bookmark" />
          </button>
        </div>
      </div>
    </aside>

    <div
      v-if="state.aiDialogOpen"
      class="ai-dialog-backdrop"
      @click="emit('closeAiDialog')" />

    <section v-if="state.aiDialogOpen" class="ai-dialog" @click.stop>
      <div class="ai-panel-head">
        <div>
          <div class="sidebar-eyebrow">Page Digest</div>
          <div class="sidebar-title">AI 页面整理</div>
          <div class="sidebar-subtitle">
            这里改成独立弹窗，不再和页面知识抓取共用侧边抽屉。适合集中整理当前页面内容。
          </div>
        </div>
        <div class="panel-actions">
          <button
            class="icon-button"
            title="刷新页面抓取"
            @click="emit('refreshArticle')">
            <font-awesome-icon icon="rotate-right" />
          </button>
          <button
            class="icon-button"
            title="模型配置"
            @click="emit('openOptions')">
            <font-awesome-icon icon="gear" />
          </button>
          <button
            class="icon-button"
            title="关闭弹窗"
            @click="emit('closeAiDialog')">
            <font-awesome-icon icon="xmark" />
          </button>
        </div>
      </div>

      <div class="ai-panel-body">
        <div class="sidebar-status">{{ state.aiStatus }}</div>

        <div v-if="state.aiConfigNotice" class="config-notice">
          {{ state.aiConfigNotice }}
        </div>

        <div class="meta-grid">
          <label class="field-wrap">
            <span class="field-label">标题</span>
            <input
              class="field"
              :value="state.articleTitle"
              @input="onTextInput('title')" />
          </label>
          <label class="field-wrap">
            <span class="field-label">作者</span>
            <input
              class="field"
              :value="state.articleAuthor"
              @input="onTextInput('author')" />
          </label>
          <label class="field-wrap">
            <span class="field-label">日期</span>
            <input
              class="field"
              :value="state.articleDate"
              @input="onTextInput('date')" />
          </label>
          <label class="field-wrap field-wrap-wide">
            <span class="field-label">网址</span>
            <input
              class="field"
              :value="state.articleUrl"
              @input="onTextInput('url')" />
          </label>
        </div>

        <div class="field-wrap">
          <div class="field-row">
            <span class="field-label">文章主要内容</span>
            <div class="field-stats mode-row">
              <div class="mode-switch">
                <button
                  class="mode-chip"
                  :class="{ active: state.articleMode === 'full' }"
                  @click="onModeChange('full')">
                  全文模式
                </button>
                <button
                  class="mode-chip"
                  :class="{ active: state.articleMode === 'segments' }"
                  @click="onModeChange('segments')">
                  分段模式
                </button>
              </div>
              <span
                v-for="item in aiMetaSummary"
                :key="item.label"
                class="stat-pill">
                {{ item.label }} {{ item.value }}
              </span>
            </div>
          </div>
          <textarea
            v-if="state.articleMode === 'full'"
            class="field textarea-large"
            :value="state.articleContent"
            @input="onTextInput('content')" />
          <div v-else class="segment-panel">
            <div class="segment-toolbar">
              <div class="segment-summary">
                已选 {{ selectedSegmentCount }} /
                {{ state.articleSegments.length }} 段
              </div>
              <div class="segment-actions">
                <button class="chip" @click="emit('selectAllSegments', true)">
                  全选
                </button>
                <button class="chip" @click="emit('selectAllSegments', false)">
                  清空
                </button>
                <button
                  class="chip chip-gradient"
                  :disabled="state.aiRunning || !state.aiConfigured"
                  @click="emit('smartSelectSegments')">
                  <font-awesome-icon icon="brain" />
                  智能选取
                </button>
              </div>
            </div>
            <div class="segment-list">
              <label
                v-for="segment in state.articleSegments"
                :key="segment.id"
                class="segment-card"
                :class="{ off: !segment.selected }">
                <div class="segment-card-head">
                  <input
                    type="checkbox"
                    :checked="segment.selected"
                    @change="onSegmentToggle(segment.id, !segment.selected)" />
                  <span class="segment-index"
                    >段落 {{ segment.order + 1 }}</span
                  >
                </div>
                <div class="segment-text">{{ segment.text }}</div>
                <div v-if="segment.reason" class="segment-reason">
                  {{ segment.reason }}
                </div>
              </label>
            </div>
          </div>
        </div>

        <div v-if="state.aiSummaryContent" class="field-wrap">
          <div class="field-row">
            <span class="field-label">AI 总结结果</span>
            <span class="field-label field-label-muted">
              保留原文，不覆盖正文输入区
            </span>
          </div>
          <div class="summary-output">
            {{ state.aiSummaryContent }}
          </div>
        </div>

        <div class="field-wrap">
          <span class="field-label">AI 提示语</span>
          <textarea
            class="field textarea-prompt"
            :value="state.aiPrompt"
            placeholder="补充你希望 AI 以什么视角整理页面，例如：保留关键论点并输出成技术笔记。"
            @input="onTextInput('prompt')" />
        </div>

        <div class="field-row action-row">
          <label class="field-wrap model-select-wrap">
            <span class="field-label">模型选择</span>
            <div class="select-shell">
              <select
                class="field select-field"
                :value="state.aiModelId"
                @change="onModelChange">
                <option
                  v-for="model in state.aiModels"
                  :key="model.id"
                  :value="model.id">
                  {{ model.label }}{{ model.model ? ` · ${model.model}` : "" }}
                </option>
              </select>
              <font-awesome-icon icon="chevron-down" class="select-arrow" />
            </div>
          </label>

          <div class="bar-actions">
            <button class="chip" @click="emit('openOptions')">
              <font-awesome-icon icon="gear" />
              模型配置
            </button>
            <button class="chip" @click="emit('openHistory')">
              <font-awesome-icon icon="bookmark" />
              内容整理
            </button>
            <button
              class="chip chip-gradient"
              :disabled="state.aiRunning || !state.aiConfigured"
              @click="emit('summarizeArticle')">
              <font-awesome-icon icon="robot" />
              {{ state.aiRunning ? "整理中" : "一键总结" }}
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.overlay-root {
  all: initial;
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 2147483646;
  font-family: var(--sf-font-family);
}

.prompt {
  position: fixed;
  top: 86px;
  pointer-events: auto;
  max-width: 260px;
  border-radius: var(--sf-radius-lg);
  padding: var(--sf-space-3) var(--sf-space-3) var(--sf-space-2);
  background: var(--sf-color-surface-soft);
  border: 1px solid rgba(132, 174, 224, 0.24);
  box-shadow: 0 18px 34px rgba(93, 118, 164, 0.18);
}

.prompt-title {
  font-size: var(--sf-font-size-md);
  font-weight: 800;
  color: #2b3962;
  margin-bottom: 6px;
}

.prompt-text {
  font-size: var(--sf-font-size-sm);
  line-height: var(--sf-line-height-relaxed);
  color: #6d7994;
  margin-bottom: 10px;
}

.prompt-actions,
.footer-actions,
.panel-actions,
.bar-actions {
  display: flex;
  gap: var(--sf-space-2);
  align-items: center;
  flex-wrap: wrap;
}

.selection-anchor-wrap {
  position: fixed;
  pointer-events: auto;
  z-index: 2147483647;
  animation: anchor-in 180ms ease;
}

.selection-anchor {
  position: absolute;
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 999px;
  padding: 0;
  transform: translate(-50%, -50%);
  background: var(--sf-color-surface-soft);
  box-shadow:
    0 6px 16px rgba(87, 114, 193, 0.3),
    0 0 0 3px rgba(255, 255, 255, 0.92);
  cursor: pointer;
}

.selection-anchor-core {
  display: block;
  width: 8px;
  height: 8px;
  margin: 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.95);
}

.selection-anchor-pop {
  position: absolute;
  width: 200px;
  border-radius: 16px;
  padding: 12px;
  background: var(--sf-color-surface-soft);
  border: 1px solid rgba(137, 175, 233, 0.24);
  box-shadow: 0 18px 34px rgba(85, 106, 155, 0.2);
  animation: pop-in 160ms ease;
}

.selection-anchor-title {
  font-size: 13px;
  font-weight: 800;
  color: #30436d;
}

.selection-anchor-copy {
  margin: 6px 0 10px;
  font-size: 12px;
  line-height: 1.6;
  color: #6d7994;
}

.page-sidebar {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  transform: translateX(100%);
  transition: transform 220ms ease;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--sf-color-surface-soft);
  border-left: 1px solid rgba(136, 176, 224, 0.26);
  box-shadow: -24px 0 48px rgba(75, 105, 150, 0.22);
  backdrop-filter: blur(18px);
}

.page-sidebar.open {
  transform: translateX(0);
}

.resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 10px;
  margin-left: -5px;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: ew-resize;
}

.resize-handle::before {
  content: "";
  position: absolute;
  left: 4px;
  top: 24px;
  bottom: 24px;
  width: 2px;
  border-radius: 999px;
  background: var(--sf-color-surface-soft);
}

.sidebar-head,
.ai-panel-head {
  padding: var(--sf-space-4) var(--sf-space-4) var(--sf-space-3);
  border-bottom: 1px solid rgba(136, 176, 224, 0.14);
  background: var(--sf-color-surface-soft);
  display: flex;
  justify-content: space-between;
  gap: var(--sf-space-3);
}

.ai-panel-head {
  background: var(--sf-color-surface-soft);
}

.sidebar-eyebrow {
  font-size: var(--sf-font-size-xs);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #7d88b1;
  font-weight: 800;
}

.sidebar-title {
  font-size: var(--sf-font-size-xl);
  line-height: 1.05;
  font-weight: 900;
  color: #25324d;
  margin-top: var(--sf-space-1);
}

.sidebar-subtitle {
  font-size: var(--sf-font-size-sm);
  line-height: var(--sf-line-height-relaxed);
  color: #6e7997;
  margin-top: var(--sf-space-2);
}

.sidebar-status {
  padding: var(--sf-space-3) var(--sf-space-4) 0;
  font-size: var(--sf-font-size-sm);
  line-height: var(--sf-line-height-relaxed);
  color: #65728f;
}

.toolbar {
  padding: var(--sf-space-4) var(--sf-space-4) 0;
  display: flex;
  gap: var(--sf-space-2);
  flex-wrap: wrap;
}

.chip {
  border: 0;
  border-radius: 999px;
  min-height: var(--sf-button-height);
  padding: 0 var(--sf-space-3);
  background: #eef4ff;
  color: #657899;
  font-size: var(--sf-font-size-xs);
  font-weight: 800;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: var(--sf-space-1);
}

.chip:disabled,
.icon-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.chip-gradient {
  background: var(--sf-color-surface-soft);
  color: #21304f;
}

.summary-output {
  margin-top: 8px;
  padding: 14px;
  border-radius: 16px;
  background: var(--sf-color-surface-soft);
  border: 1px solid rgba(255, 198, 107, 0.28);
  color: #33445f;
  font-size: 13px;
  line-height: 1.8;
  white-space: pre-wrap;
}

.field-label-muted {
  color: #7b88a4;
  font-weight: 600;
}

.icon-button {
  border: 0;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: #516890;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.selection-panel {
  margin: var(--sf-space-3) var(--sf-space-4) 0;
  border-radius: var(--sf-radius-lg);
  padding: var(--sf-space-3);
  background: var(--sf-color-surface-soft);
  border: 1px solid rgba(150, 195, 235, 0.18);
}

.selection-label,
.field-label {
  font-size: var(--sf-font-size-xs);
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #7c86ad;
}

.selection-text {
  margin-top: var(--sf-space-1);
  font-size: var(--sf-font-size-sm);
  line-height: 1.65;
  color: #31415f;
}

.snippet-list,
.ai-panel-body {
  padding: var(--sf-space-3) var(--sf-space-4) var(--sf-space-4);
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: var(--sf-space-3);
  flex: 1;
}

.empty-state {
  border-radius: var(--sf-radius-xl);
  padding: var(--sf-space-4);
  background: rgba(255, 255, 255, 0.7);
  border: 1px dashed rgba(126, 169, 220, 0.28);
  font-size: var(--sf-font-size-sm);
  line-height: 1.7;
  color: #72809e;
}

.sidebar-footer {
  padding: var(--sf-space-3) var(--sf-space-4) var(--sf-space-4);
  border-top: 1px solid rgba(136, 176, 224, 0.12);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--sf-space-2);
}

.footer-text {
  font-size: var(--sf-font-size-xs);
  color: #8591ac;
}

.ai-dialog-backdrop {
  position: fixed;
  inset: 0;
  pointer-events: auto;
  background: rgba(37, 50, 77, 0.24);
  backdrop-filter: blur(4px);
  animation: fade-in 220ms ease;
}

.ai-dialog {
  position: fixed;
  top: 48px;
  left: 50%;
  transform: translateX(-50%);
  width: min(820px, calc(100vw - 64px));
  max-height: calc(100vh - 96px);
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 28px;
  background: var(--sf-color-surface-soft);
  border: 1px solid rgba(236, 203, 120, 0.22);
  box-shadow: 0 30px 80px rgba(75, 105, 150, 0.26);
  transform-origin: center bottom;
  animation: dock-open 300ms cubic-bezier(0.22, 1, 0.36, 1);
}

.config-notice {
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(255, 248, 228, 0.88);
  border: 1px solid rgba(232, 188, 92, 0.26);
  color: #7a5a18;
  line-height: 1.7;
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sf-space-3);
}

.field-wrap {
  display: flex;
  flex-direction: column;
  gap: var(--sf-space-1);
}

.field-wrap-wide {
  grid-column: 1 / -1;
}

.field-row {
  display: flex;
  justify-content: space-between;
  gap: var(--sf-space-2);
  align-items: center;
}

.field-stats {
  display: flex;
  gap: var(--sf-space-2);
  flex-wrap: wrap;
  justify-content: flex-end;
}

.mode-row {
  align-items: center;
}

.mode-switch {
  display: inline-flex;
  padding: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(147, 168, 197, 0.22);
}

.mode-chip {
  border: 0;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  background: transparent;
  color: #6a7794;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.mode-chip.active {
  background: var(--sf-color-surface-soft);
  color: #714d12;
}

.stat-pill {
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.74);
  color: #586781;
  font-size: 12px;
  font-weight: 700;
}

.field,
.select-field {
  width: 100%;
  min-height: 40px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(147, 168, 197, 0.44);
  background: rgba(255, 255, 255, 0.82);
  color: #20304c;
  box-sizing: border-box;
}

.textarea-large {
  min-height: 280px;
  resize: vertical;
  line-height: 1.7;
}

.textarea-prompt {
  min-height: 92px;
  resize: vertical;
  line-height: 1.6;
}

.segment-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.segment-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.segment-summary {
  font-size: 13px;
  font-weight: 700;
  color: #5c6c87;
}

.segment-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.segment-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 360px;
  overflow: auto;
}

.segment-card {
  display: grid;
  gap: 8px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid rgba(147, 168, 197, 0.26);
  background: rgba(255, 255, 255, 0.82);
  cursor: pointer;
}

.segment-card.off {
  opacity: 0.58;
}

.segment-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.segment-index {
  font-size: 12px;
  font-weight: 800;
  color: #7a87a3;
  letter-spacing: 0.04em;
}

.segment-text {
  color: #22314f;
  line-height: 1.8;
  white-space: pre-wrap;
}

.segment-reason {
  color: #8a6a23;
  font-size: 12px;
  line-height: 1.6;
}

@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes pop-in {
  from {
    opacity: 0;
    transform: translateY(-6px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes anchor-in {
  from {
    opacity: 0;
    transform: scale(0.88);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes dock-open {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(20px) scale(0.92);
  }
  60% {
    opacity: 1;
    transform: translateX(-50%) translateY(-4px) scale(1.015);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0) scale(1);
  }
}

.action-row {
  align-items: flex-end;
  flex-wrap: wrap;
}

.model-select-wrap {
  min-width: 240px;
  flex: 1;
}

.select-shell {
  position: relative;
}

.select-field {
  appearance: none;
  padding-right: 34px;
}

.select-arrow {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #7686a1;
  pointer-events: none;
}

@media (max-width: 860px) {
  .meta-grid {
    grid-template-columns: 1fr;
  }

  .ai-dialog {
    top: 16px;
    width: calc(100vw - 24px);
    max-height: calc(100vh - 32px);
  }
}

/* Notebook theme override: neutral paper + pencil lines */
[class*="gradient"] {
  background: var(--sf-color-surface-soft) !important;
  color: var(--sf-color-text) !important;
}

.selection-anchor {
  background: var(--sf-color-primary) !important;
  outline: none !important;
  border-color: var(--sf-color-surface) !important;
  box-shadow: 0 4px 12px rgba(27, 27, 34, 0.18) !important;
}

.page-sidebar,
.ai-dialog,
.selection-anchor-pop,
.summary-output,
.selection-panel,
.config-notice,
.empty-state,
.mode-switch,
.segment-card,
.prompt-box {
  background: var(--sf-color-surface) !important;
  border-color: var(--sf-color-border-medium) !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
}

.sidebar-head,
.ai-panel-head {
  background: var(--sf-color-bg) !important;
  border-bottom-color: var(--sf-color-border) !important;
}

.chip,
.chip-gradient,
.icon-button,
.mode-chip.active,
.stat-pill {
  background: var(--sf-color-surface-soft) !important;
  color: var(--sf-color-text-muted) !important;
  border: 1px solid var(--sf-color-border-medium) !important;
}

.field,
.select-field,
.textarea-large,
.textarea-prompt {
  background: var(--sf-color-surface) !important;
  border-color: var(--sf-color-border-medium) !important;
  color: var(--sf-color-text) !important;
}

.selection-label,
.field-label,
.sidebar-eyebrow,
.segment-index,
.field-label-muted,
.footer-text,
.select-arrow {
  color: var(--sf-color-text-faint) !important;
}

.sidebar-title,
.selection-text,
.segment-text,
.prompt-title,
.selection-anchor-title {
  color: var(--sf-color-text) !important;
}

.sidebar-subtitle,
.sidebar-status,
.segment-summary,
.prompt-text,
.selection-anchor-copy,
.segment-reason {
  color: var(--sf-color-text-muted) !important;
}
</style>
