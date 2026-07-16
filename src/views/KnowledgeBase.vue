<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"

import {
  KNOWLEDGE_MESSAGE,
  sendKnowledgeMessage
} from "../sdk/knowledgeMessages"
import type { KnowledgeItem, KnowledgeQuery } from "../types/knowledge"
import { KNOWLEDGE_CATEGORIES } from "../types/knowledge"

const items = ref<KnowledgeItem[]>([])
const isLoading = ref(true)
const keyword = ref("")
const selectedCategory = ref("")
const selectedSourceType = ref<"" | KnowledgeItem["sourceType"]>("")
const createdAfter = ref("")
const createdBefore = ref("")
const selectedItem = ref<KnowledgeItem | null>(null)
const statusMsg = ref("")
const isDeleting = ref(false)
const isRetryingAi = ref(false)
const isEditing = ref(false)
const editTitle = ref("")
const editSummary = ref("")
const editTags = ref("")

const categories = ["", ...KNOWLEDGE_CATEGORIES]

const query = computed<KnowledgeQuery>(() => ({
  keyword: keyword.value || undefined,
  category: selectedCategory.value || undefined,
  sourceType: selectedSourceType.value || undefined,
  createdAfter: createdAfter.value
    ? new Date(`${createdAfter.value}T00:00:00`).getTime()
    : undefined,
  createdBefore: createdBefore.value
    ? new Date(`${createdBefore.value}T23:59:59.999`).getTime()
    : undefined,
  orderBy: "createdAt",
  orderDir: "desc"
}))

async function loadItems() {
  isLoading.value = true
  try {
    items.value = await sendKnowledgeMessage(
      KNOWLEDGE_MESSAGE.list,
      query.value
    )
  } catch (e) {
    statusMsg.value = e instanceof Error ? e.message : "加载失败"
  } finally {
    isLoading.value = false
  }
}

watch(
  [keyword, selectedCategory, selectedSourceType, createdAfter, createdBefore],
  () => {
    void loadItems()
  }
)

onMounted(loadItems)

function selectItem(item: KnowledgeItem) {
  selectedItem.value = item
  isEditing.value = false
}

function beginEdit(item: KnowledgeItem) {
  editTitle.value = item.title
  editSummary.value = item.summary ?? ""
  editTags.value = item.tags.join(", ")
  isEditing.value = true
}

async function saveEdit(item: KnowledgeItem) {
  const updated = await sendKnowledgeMessage(KNOWLEDGE_MESSAGE.update, {
    id: item.id,
    title: editTitle.value.trim() || item.title,
    summary: editSummary.value.trim() || undefined,
    tags: editTags.value
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 12)
  })
  if (!updated) throw new Error("知识条目不存在")
  const index = items.value.findIndex((entry) => entry.id === item.id)
  if (index !== -1) items.value[index] = updated
  selectedItem.value = updated
  isEditing.value = false
  statusMsg.value = "已保存编辑"
}

function closeDetail() {
  selectedItem.value = null
}

async function toggleFavorite(item: KnowledgeItem) {
  await sendKnowledgeMessage(KNOWLEDGE_MESSAGE.update, {
    id: item.id,
    favorite: !item.favorite
  })
  item.favorite = !item.favorite
}

async function deleteItem(item: KnowledgeItem) {
  if (!confirm(`确认删除「${item.title}」？`)) return
  isDeleting.value = true
  try {
    await sendKnowledgeMessage(KNOWLEDGE_MESSAGE.remove, { id: item.id })
    items.value = items.value.filter((i) => i.id !== item.id)
    if (selectedItem.value?.id === item.id) selectedItem.value = null
  } catch (e) {
    statusMsg.value = e instanceof Error ? e.message : "删除失败"
  } finally {
    isDeleting.value = false
  }
}

async function retryAi(item: KnowledgeItem) {
  isRetryingAi.value = true
  try {
    const updated = await sendKnowledgeMessage(KNOWLEDGE_MESSAGE.retryAi, {
      id: item.id
    })
    if (!updated) throw new Error("知识条目不存在")
    const index = items.value.findIndex((i) => i.id === item.id)
    if (index !== -1) items.value[index] = updated
    if (selectedItem.value?.id === item.id) selectedItem.value = updated
    statusMsg.value = "AI 重新整理完成"
    setTimeout(() => {
      statusMsg.value = ""
    }, 3000)
  } catch (e) {
    statusMsg.value = e instanceof Error ? e.message : "AI 重试失败"
  } finally {
    isRetryingAi.value = false
  }
}

async function exportMarkdown(item: KnowledgeItem) {
  const lines = [`# ${item.title}`, "", `原文链接：${item.url}`, ""]
  if (item.summary) {
    lines.push("## 摘要", "", item.summary, "")
  }
  if (item.keyPoints?.length) {
    lines.push("## 关键点", "", ...item.keyPoints.map((p) => `- ${p}`), "")
  }
  if (item.tags.length) {
    lines.push("## 标签", "", item.tags.map((t) => `#${t}`).join(" "), "")
  }
  if (item.content) {
    lines.push("## 原文摘录", "", item.content.slice(0, 2000), "")
  }

  const blob = new Blob([lines.join("\n")], { type: "text/markdown" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${item.title.slice(0, 40).replace(/[/\\?%*:|"<>]/g, "_")}.md`
  a.click()
  URL.revokeObjectURL(url)
}

function exportJson(item: KnowledgeItem) {
  const blob = new Blob([JSON.stringify(item, null, 2)], {
    type: "application/json"
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${item.title.slice(0, 40).replace(/[/\\?%*:|"<>]/g, "_")}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  })
}
</script>

<template>
  <div class="kb">
    <!-- 工具栏 -->
    <div class="kb__toolbar">
      <input
        v-model="keyword"
        class="kb__search"
        type="text"
        placeholder="搜索标题、摘要、标签…" />
      <select v-model="selectedCategory" class="kb__select">
        <option value="">全部分类</option>
        <option v-for="cat in KNOWLEDGE_CATEGORIES" :key="cat" :value="cat">
          {{ cat }}
        </option>
      </select>
      <select v-model="selectedSourceType" class="kb__select">
        <option value="">全部来源</option>
        <option value="page">网页</option>
        <option value="selection">划线</option>
        <option value="bookmark">书签</option>
      </select>
      <input v-model="createdAfter" class="kb__select" type="date" />
      <input v-model="createdBefore" class="kb__select" type="date" />
    </div>

    <div v-if="statusMsg" class="kb__status">{{ statusMsg }}</div>

    <div class="kb__body">
      <!-- 列表 -->
      <div class="kb__list">
        <div v-if="isLoading" class="kb__empty">加载中…</div>
        <div v-else-if="items.length === 0" class="kb__empty">
          <div class="kb__empty-icon">📚</div>
          <div>还没有保存任何内容</div>
          <div class="kb__empty-hint">
            去网页上点击悬浮按钮，开始构建你的学习资料库。
          </div>
        </div>

        <div
          v-for="item in items"
          :key="item.id"
          class="kb__card"
          :class="{ 'kb__card--active': selectedItem?.id === item.id }"
          @click="selectItem(item)">
          <div class="kb__card-header">
            <div class="kb__card-title">{{ item.title || "无标题" }}</div>
            <div class="kb__card-actions">
              <button
                class="kb__icon-btn"
                :title="item.favorite ? '取消收藏' : '收藏'"
                @click.stop="toggleFavorite(item)">
                {{ item.favorite ? "⭐" : "☆" }}
              </button>
              <button
                class="kb__icon-btn kb__icon-btn--danger"
                title="删除"
                :disabled="isDeleting"
                @click.stop="deleteItem(item)">
                🗑️
              </button>
            </div>
          </div>
          <div v-if="item.summary" class="kb__card-summary">
            {{ item.summary }}
          </div>
          <div class="kb__card-footer">
            <span class="kb__tag kb__tag--cat">{{ item.category }}</span>
            <span
              v-for="tag in item.tags.slice(0, 3)"
              :key="tag"
              class="kb__tag"
              >{{ tag }}</span
            >
            <span v-if="item.aiStatus === 'pending'" class="kb__tag"
              >待 AI 整理</span
            >
            <span
              v-else-if="item.aiStatus === 'failed'"
              class="kb__tag kb__tag--error"
              >AI失败</span
            >
            <span class="kb__card-time">{{ formatDate(item.createdAt) }}</span>
          </div>
        </div>
      </div>

      <!-- 详情面板 -->
      <div v-if="selectedItem" class="kb__detail">
        <div class="kb__detail-header">
          <div class="kb__detail-title">{{ selectedItem.title }}</div>
          <button class="kb__icon-btn" @click="closeDetail">✕</button>
        </div>

        <div class="kb__detail-body">
          <a :href="selectedItem.url" target="_blank" class="kb__detail-url">
            {{ selectedItem.url }}
          </a>

          <div class="kb__detail-tags">
            <span class="kb__tag kb__tag--cat">{{
              selectedItem.category
            }}</span>
            <span v-if="selectedItem.subCategory" class="kb__tag">{{
              selectedItem.subCategory
            }}</span>
            <span v-for="tag in selectedItem.tags" :key="tag" class="kb__tag">{{
              tag
            }}</span>
          </div>

          <template v-if="isEditing">
            <label class="kb__detail-section">
              <div class="kb__detail-section-title">标题</div>
              <input v-model="editTitle" class="kb__edit-input" />
            </label>
            <label class="kb__detail-section">
              <div class="kb__detail-section-title">摘要</div>
              <textarea
                v-model="editSummary"
                class="kb__edit-input kb__edit-textarea" />
            </label>
            <label class="kb__detail-section">
              <div class="kb__detail-section-title">标签（逗号分隔）</div>
              <input v-model="editTags" class="kb__edit-input" />
            </label>
          </template>

          <div v-else-if="selectedItem.summary" class="kb__detail-section">
            <div class="kb__detail-section-title">摘要</div>
            <div class="kb__detail-text">{{ selectedItem.summary }}</div>
          </div>

          <div v-if="selectedItem.keyPoints?.length" class="kb__detail-section">
            <div class="kb__detail-section-title">关键点</div>
            <ul class="kb__detail-list">
              <li v-for="point in selectedItem.keyPoints" :key="point">
                {{ point }}
              </li>
            </ul>
          </div>

          <div v-if="selectedItem.learningNotes" class="kb__detail-section">
            <div class="kb__detail-section-title">学习笔记</div>
            <div class="kb__detail-text">{{ selectedItem.learningNotes }}</div>
          </div>

          <div v-if="selectedItem.content" class="kb__detail-section">
            <div class="kb__detail-section-title">原文摘录</div>
            <div class="kb__detail-text kb__detail-text--content">
              {{ selectedItem.content.slice(0, 1500)
              }}{{ selectedItem.content.length > 1500 ? "…" : "" }}
            </div>
          </div>

          <div class="kb__detail-meta">
            <span>来源类型：{{ selectedItem.sourceType }}</span>
            <span>保存时间：{{ formatDate(selectedItem.createdAt) }}</span>
            <span v-if="selectedItem.siteName"
              >站点：{{ selectedItem.siteName }}</span
            >
          </div>
        </div>

        <div class="kb__detail-footer">
          <button
            v-if="isEditing"
            class="kb__btn kb__btn--secondary"
            @click="saveEdit(selectedItem)">
            保存编辑
          </button>
          <button
            v-else
            class="kb__btn kb__btn--secondary"
            @click="beginEdit(selectedItem)">
            编辑
          </button>
          <button
            v-if="selectedItem.aiStatus === 'failed'"
            class="kb__btn kb__btn--secondary"
            :disabled="isRetryingAi"
            @click="retryAi(selectedItem)">
            {{ isRetryingAi ? "处理中…" : "重试 AI 整理" }}
          </button>
          <button
            class="kb__btn kb__btn--secondary"
            @click="exportMarkdown(selectedItem)">
            导出 Markdown
          </button>
          <button
            class="kb__btn kb__btn--secondary"
            @click="exportJson(selectedItem)">
            导出 JSON
          </button>
          <button
            class="kb__btn kb__btn--danger"
            :disabled="isDeleting"
            @click="deleteItem(selectedItem)">
            删除
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kb {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-family: "DM Sans", "PingFang SC", "Hiragino Sans GB", sans-serif;
}

.kb__toolbar {
  display: flex;
  gap: 8px;
  padding: 12px 0 10px;
}

.kb__search {
  flex: 1;
  padding: 7px 11px;
  border: 1px solid rgba(27, 27, 34, 0.12);
  border-radius: 5px;
  font-size: 13px;
  outline: none;
  background: #fff;
  color: #1b1b22;
  transition: border-color 0.15s;
  font-family: inherit;
}

.kb__search::placeholder {
  color: #aeadb8;
}

.kb__search:focus {
  border-color: #3960a8;
}

.kb__select {
  padding: 7px 10px;
  border: 1px solid rgba(27, 27, 34, 0.12);
  border-radius: 5px;
  font-size: 13px;
  outline: none;
  background: #fff;
  color: #1b1b22;
  font-family: inherit;
  cursor: pointer;
}

.kb__status {
  font-size: 12px;
  color: #6b6870;
  padding: 4px 0;
}

.kb__body {
  flex: 1;
  display: flex;
  gap: 14px;
  overflow: hidden;
  min-height: 0;
}

.kb__list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 4px;
  min-width: 0;
}

.kb__empty {
  text-align: center;
  padding: 48px 16px;
  color: #aeadb8;
  font-size: 13px;
  line-height: 1.8;
}

.kb__empty-icon {
  font-size: 28px;
  margin-bottom: 10px;
  opacity: 0.5;
}

.kb__empty-hint {
  font-size: 12px;
  color: #c8c7d1;
  margin-top: 4px;
}

/* Cards — minimal paper feel with left-border bookmark indicator */
.kb__card {
  padding: 11px 13px;
  border-radius: 6px;
  cursor: pointer;
  transition:
    background 0.12s,
    border-left-color 0.12s;
  background: #fff;
  border: 1px solid rgba(27, 27, 34, 0.07);
  border-left: 3px solid transparent;
}

.kb__card:hover {
  background: #fafaf8;
  border-left-color: rgba(57, 96, 168, 0.25);
}

.kb__card--active {
  border-left-color: #3960a8;
  background: #fafaf8;
}

.kb__card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 5px;
}

.kb__card-title {
  font-size: 13px;
  font-weight: 500;
  color: #1b1b22;
  line-height: 1.4;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.kb__card-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.kb__card-summary {
  font-size: 12px;
  color: #6b6870;
  line-height: 1.55;
  margin-bottom: 7px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.kb__card-footer {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.kb__card-time {
  font-size: 10px;
  color: #c8c7d1;
  margin-left: auto;
}

/* Tags — outline annotation style, no heavy fill */
.kb__tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  border: 1px solid rgba(57, 96, 168, 0.25);
  color: #3960a8;
  background: transparent;
  letter-spacing: 0.01em;
}

.kb__tag--cat {
  border-color: rgba(27, 27, 34, 0.2);
  color: #1b1b22;
  background: transparent;
  font-weight: 500;
}

.kb__tag--error {
  border-color: rgba(176, 58, 46, 0.3);
  color: #b03a2e;
  background: transparent;
}

.kb__icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  padding: 3px 5px;
  border-radius: 4px;
  color: #aeadb8;
  transition:
    color 0.12s,
    background 0.12s;
  line-height: 1;
}

.kb__icon-btn:hover {
  color: #1b1b22;
  background: rgba(27, 27, 34, 0.05);
}

.kb__icon-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.kb__icon-btn--danger:hover {
  color: #b03a2e;
  background: #faeae8;
}

/* Detail panel */
.kb__detail {
  width: 360px;
  flex-shrink: 0;
  border: 1px solid rgba(27, 27, 34, 0.08);
  border-radius: 8px;
  background: #fff;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.kb__detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(27, 27, 34, 0.07);
  background: #f5f4f0;
}

.kb__detail-title {
  font-size: 14px;
  font-weight: 600;
  color: #1b1b22;
  line-height: 1.4;
  flex: 1;
}

.kb__detail-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.kb__detail-url {
  font-size: 11px;
  color: #3960a8;
  text-decoration: none;
  word-break: break-all;
  opacity: 0.7;
  margin-bottom: 12px;
}

.kb__detail-url:hover {
  opacity: 1;
  text-decoration: underline;
}

.kb__detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 10px;
}

.kb__detail-section {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 10px 0;
  border-top: 1px solid rgba(27, 27, 34, 0.05);
}

/* Section title — like notebook margin headers */
.kb__detail-section-title {
  font-size: 10px;
  font-weight: 500;
  color: #aeadb8;
  text-transform: uppercase;
  letter-spacing: 0.07em;
}

.kb__detail-text {
  font-size: 13px;
  color: #1b1b22;
  line-height: 1.65;
}

.kb__detail-text--content {
  font-size: 12px;
  color: #6b6870;
  max-height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
  line-height: 1.6;
}

.kb__detail-list {
  font-size: 13px;
  color: #1b1b22;
  padding-left: 16px;
  line-height: 1.8;
  margin: 0;
}

.kb__detail-meta {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 11px;
  color: #aeadb8;
  padding: 10px 0 0;
  border-top: 1px solid rgba(27, 27, 34, 0.05);
  margin-top: 6px;
}

.kb__detail-footer {
  display: flex;
  gap: 6px;
  padding: 10px 14px;
  border-top: 1px solid rgba(27, 27, 34, 0.07);
  justify-content: flex-end;
}

.kb__btn {
  padding: 6px 12px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  font-family: inherit;
  transition:
    opacity 0.12s,
    background 0.12s;
}

.kb__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.kb__btn--secondary {
  background: #fff;
  color: #1b1b22;
  border-color: rgba(27, 27, 34, 0.15);
}

.kb__btn--secondary:hover:not(:disabled) {
  background: #f5f4f0;
}

.kb__btn--danger {
  background: #fff;
  color: #b03a2e;
  border-color: rgba(176, 58, 46, 0.2);
}

.kb__btn--danger:hover:not(:disabled) {
  background: #faeae8;
}
</style>
