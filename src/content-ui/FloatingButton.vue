<template>
  <div
    v-if="!hidden"
    class="kc-float-root"
    :class="[
      `kc-float-root--${resolvedSide}`,
      { 'kc-float-root--dragging': isDragging }
    ]"
    :style="rootStyle">
    <div
      ref="ballRef"
      class="kc-ball"
      :class="{ 'kc-ball--open': menuOpen, 'kc-ball--saving': isSaving }"
      title="保存到知识库"
      @mouseenter="openMenu"
      @mouseleave="scheduleCloseMenu"
      @mousedown.prevent="beginDrag"
      @click="handleBallClick">
      <span v-if="isSaving" class="kc-ball__icon">...</span>
      <span v-else-if="saveSuccess" class="kc-ball__icon">OK</span>
      <img
        v-else
        class="kc-ball__icon-img"
        :src="floatingBallIconUrl"
        alt="保存到知识库" />
    </div>

    <Transition name="kc-menu">
      <div
        v-if="menuOpen"
        class="kc-menu"
        :class="`kc-menu--${resolvedSide}`"
        @mouseenter="openMenu"
        @mouseleave="scheduleCloseMenu">
        <button class="kc-menu__item" @click="openCaptureSidebar">
          <span class="kc-menu__icon">[]</span>
          抓取侧边栏
        </button>
        <button class="kc-menu__item" @click="startElementCapture">
          <span class="kc-menu__icon">+</span>
          框选模式抓取
        </button>
        <button class="kc-menu__item" @click="quickSave">
          <span class="kc-menu__icon">S</span>
          快速保存
        </button>
        <button class="kc-menu__item" @click="deepSave">
          <span class="kc-menu__icon">D</span>
          深度保存
        </button>
        <button
          class="kc-menu__item"
          :disabled="!hasSelection"
          @click="saveSelection">
          <span class="kc-menu__icon">T</span>
          保存选中文本
        </button>
        <button class="kc-menu__item" @click="openKnowledgeBase">
          <span class="kc-menu__icon">K</span>
          打开知识库
        </button>
        <button class="kc-menu__item" @click="openSettings">
          <span class="kc-menu__icon">G</span>
          打开设置
        </button>
        <div v-if="showModelTip" class="kc-menu__tip">
          <div class="kc-menu__tip-title">还没有可用模型</div>
          <button class="kc-menu__tip-link" @click="openSettings">
            前往设置页配置 DeepSeek 模型
          </button>
        </div>
      </div>
    </Transition>

    <Transition name="kc-toast">
      <div
        v-if="toastMsg"
        class="kc-toast"
        :class="[
          `kc-toast--${resolvedSide}`,
          { 'kc-toast--error': toastError }
        ]">
        {{ toastMsg }}
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue"

import floatingBallIconUrl from "../contents/icon.png"
import {
  KNOWLEDGE_MESSAGE,
  sendKnowledgeMessage
} from "../sdk/knowledgeMessages"
import type { SmartFavoritesSettings } from "../sdk/types"
import { extractPageContent } from "../services/pageExtractor"
import { useFloatingAnchor } from "./useFloatingAnchor"

type ProviderCandidate = {
  apiKey?: string
  baseUrl?: string
  model?: string
}

const hidden = ref(false)
const menuOpen = ref(false)
const isSaving = ref(false)
const saveSuccess = ref(false)
const hasSelection = ref(false)
const toastMsg = ref("")
const toastError = ref(false)
const hasConfiguredModel = ref(true)
const modelStatusLoaded = ref(false)
const {
  ballRef,
  clearDragListeners,
  handleBallMouseDown,
  handleResize,
  isDragging,
  justDragged,
  loadAnchor,
  resolvedSide,
  rootStyle
} = useFloatingAnchor()

const selectionText = ref("")

let menuCloseTimer: number | undefined
const showModelTip = computed(
  () => modelStatusLoaded.value && !hasConfiguredModel.value
)

function hasCompleteProviderConfig(provider?: ProviderCandidate | null) {
  return Boolean(
    provider?.apiKey?.trim() &&
      provider?.baseUrl?.trim() &&
      provider?.model?.trim()
  )
}

function onSelectionChange() {
  const text = window.getSelection()?.toString().trim() ?? ""
  selectionText.value = text
  hasSelection.value = text.length > 0
}

async function sendMessage<T>(type: string, payload?: unknown): Promise<T> {
  const response = await chrome.runtime.sendMessage({ type, payload })
  if (!response?.ok) {
    throw new Error(response?.error ?? "操作失败")
  }
  return response.payload as T
}

async function refreshModelAvailability() {
  try {
    const settings = await sendMessage<SmartFavoritesSettings>(
      "bookmarks-collector/get-settings"
    )
    const providers = settings.providers?.length
      ? settings.providers
      : [settings.provider]

    hasConfiguredModel.value = providers.some((provider) =>
      hasCompleteProviderConfig(provider)
    )
  } catch {
    hasConfiguredModel.value = false
  } finally {
    modelStatusLoaded.value = true
  }
}

function showToast(msg: string, isError = false, duration = 3000) {
  toastMsg.value = msg
  toastError.value = isError
  window.setTimeout(() => {
    toastMsg.value = ""
  }, duration)
}

function closeMenu() {
  menuOpen.value = false
}

function openMenu() {
  if (isDragging.value || justDragged.value) {
    return
  }

  if (menuCloseTimer) {
    window.clearTimeout(menuCloseTimer)
    menuCloseTimer = undefined
  }

  menuOpen.value = true
  void refreshModelAvailability()
}

function scheduleCloseMenu() {
  if (isDragging.value) {
    return
  }

  if (menuCloseTimer) {
    window.clearTimeout(menuCloseTimer)
  }

  menuCloseTimer = window.setTimeout(() => {
    menuOpen.value = false
  }, 120)
}

function handleBallClick() {
  if (justDragged.value) {
    justDragged.value = false
    return
  }

  if (menuOpen.value) {
    menuOpen.value = false
    return
  }

  void quickSave()
}

function beginDrag(event: MouseEvent) {
  handleBallMouseDown(event, closeMenu)
}

function openCaptureSidebar() {
  closeMenu()
  window.dispatchEvent(new CustomEvent("kc-page-capture-open-sidebar"))
}

function startElementCapture() {
  closeMenu()
  window.dispatchEvent(new CustomEvent("kc-page-capture-start-element-mode"))
}

async function quickSave() {
  closeMenu()
  if (isSaving.value) {
    return
  }

  isSaving.value = true

  try {
    showToast("正在抓取网页...")
    showToast("正在整理内容...")
    await sendKnowledgeMessage(
      KNOWLEDGE_MESSAGE.quickSave,
      extractPageContent()
    )
    saveSuccess.value = true
    showToast("已保存到知识库")
    window.setTimeout(() => {
      saveSuccess.value = false
    }, 3000)
  } catch (error) {
    showToast(error instanceof Error ? error.message : "保存失败，请重试", true)
  } finally {
    isSaving.value = false
  }
}

function deepSave() {
  closeMenu()
  window.dispatchEvent(new CustomEvent("kc-page-capture-open-ai-dialog"))
}

async function saveSelection() {
  closeMenu()

  if (!selectionText.value) {
    showToast("请先在页面上选中一段文本", true)
    return
  }

  isSaving.value = true
  try {
    await sendKnowledgeMessage(KNOWLEDGE_MESSAGE.saveSelection, {
      ...extractPageContent(),
      selectedText: selectionText.value
    })
    showToast("选中文本已保存")
  } catch (error) {
    showToast(error instanceof Error ? error.message : "保存失败", true)
  } finally {
    isSaving.value = false
  }
}

function openKnowledgeBase() {
  closeMenu()
  void sendKnowledgeMessage(KNOWLEDGE_MESSAGE.openKnowledgeBase, undefined)
}

async function openSettings() {
  closeMenu()
  await sendMessage("bookmarks-collector/open-extension-page", {
    path: "tabs/manage.html#settings"
  })
}

onMounted(() => {
  document.addEventListener("selectionchange", onSelectionChange)
  window.addEventListener("resize", handleResize)
  void loadAnchor()
  void refreshModelAvailability()
  onSelectionChange()
})

onUnmounted(() => {
  document.removeEventListener("selectionchange", onSelectionChange)
  window.removeEventListener("resize", handleResize)
  clearDragListeners()

  if (menuCloseTimer) {
    window.clearTimeout(menuCloseTimer)
  }
})
</script>

<style scoped>
.kc-float-root {
  position: fixed;
  z-index: 2147483640;
  width: 40px;
  height: 40px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 13px;
}

.kc-float-root--dragging {
  transition: none;
}

.kc-ball {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #fff;
  color: #1b1b22;
  border: 1px solid rgba(27, 27, 34, 0.16);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  box-shadow: 0 2px 10px rgba(27, 27, 34, 0.22);
  transition:
    transform 0.18s,
    box-shadow 0.18s,
    background 0.18s;
  user-select: none;
}

.kc-float-root--dragging .kc-ball {
  cursor: grabbing;
  transform: scale(1.05);
  box-shadow: 0 8px 24px rgba(27, 27, 34, 0.22);
}

.kc-ball:hover {
  transform: scale(1.07);
  box-shadow: 0 4px 16px rgba(27, 27, 34, 0.28);
}

.kc-ball--saving {
  background: #6b6870;
  color: #fff;
}

.kc-ball--open {
  background: #f5f4f0;
}

.kc-ball__icon {
  font-size: 13px;
  line-height: 1;
}

.kc-ball__icon-img {
  width: 20px;
  height: 20px;
  object-fit: contain;
  display: block;
}

.kc-menu {
  position: absolute;
  top: 0;
  min-width: 172px;
  background: #fff;
  border: 1px solid rgba(27, 27, 34, 0.1);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(27, 27, 34, 0.12);
  padding: 4px 0;
  overflow: hidden;
}

.kc-menu--right {
  right: 48px;
}

.kc-menu--left {
  left: 48px;
}

.kc-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 13px;
  background: none;
  border: none;
  font-size: 13px;
  color: #1b1b22;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s;
  font-family: inherit;
}

.kc-menu__item:hover {
  background: #f5f4f0;
}

.kc-menu__item:disabled {
  color: #aeadb8;
  cursor: not-allowed;
}

.kc-menu__icon {
  width: 16px;
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  text-align: center;
  color: #6b6870;
}

.kc-menu__tip {
  border-top: 1px solid rgba(27, 27, 34, 0.08);
  padding: 10px 13px 12px;
  background: #fcfaf4;
}

.kc-menu__tip-title {
  font-size: 12px;
  font-weight: 600;
  color: #7a5a18;
}

.kc-menu__tip-link {
  margin-top: 6px;
  padding: 0;
  border: none;
  background: none;
  color: #3960a8;
  font-size: 12px;
  cursor: pointer;
  text-decoration: underline;
  font-family: inherit;
}

.kc-toast {
  position: absolute;
  top: 48px;
  background: #1b1b22;
  color: #fff;
  font-size: 12px;
  padding: 7px 12px;
  border-radius: 6px;
  white-space: nowrap;
  box-shadow: 0 2px 10px rgba(27, 27, 34, 0.2);
}

.kc-toast--right {
  right: 0;
}

.kc-toast--left {
  left: 0;
}

.kc-toast--error {
  background: #b03a2e;
}

.kc-menu-enter-active,
.kc-menu-leave-active {
  transition:
    opacity 0.15s,
    transform 0.15s;
}

.kc-menu-enter-from,
.kc-menu-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.kc-toast-enter-active,
.kc-toast-leave-active {
  transition:
    opacity 0.2s,
    transform 0.2s;
}

.kc-toast-enter-from,
.kc-toast-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
