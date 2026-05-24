<script setup lang="ts">
import { ref, watch } from "vue"

import type { CapturedSnippet } from "../sdk/types"

const props = defineProps<{
  snippet: CapturedSnippet
}>()

const emit = defineEmits<{
  analyze: [snippetId: string]
  delete: [snippetId: string]
  saveTags: [payload: { snippetId: string; tags: string[] }]
}>()

const isEditingTags = ref(false)
const draftTags = ref("")

watch(
  () => props.snippet.analysisTags,
  (tags) => {
    if (!isEditingTags.value) {
      draftTags.value = (tags ?? []).join(", ")
    }
  },
  {
    immediate: true
  }
)

const startEditTags = () => {
  isEditingTags.value = true
  draftTags.value = (props.snippet.analysisTags ?? []).join(", ")
}

const cancelEditTags = () => {
  isEditingTags.value = false
  draftTags.value = (props.snippet.analysisTags ?? []).join(", ")
}

const saveTags = () => {
  const tags = draftTags.value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)

  emit("saveTags", {
    snippetId: props.snippet.id,
    tags
  })
  isEditingTags.value = false
}
</script>

<template>
  <div class="snippet-card">
    <div class="snippet-head">
      <div>
        <div class="snippet-mode">
          {{ snippet.mode === "selection" ? "Selection" : "Element" }}
        </div>
        <div class="snippet-label">{{ snippet.label }}</div>
        <div v-if="snippet.analysisTags?.length" class="snippet-tags">
          <span
            v-for="tag in snippet.analysisTags"
            :key="tag"
            class="snippet-tag">
            {{ tag }}
          </span>
        </div>
      </div>
      <div class="snippet-actions">
        <button class="snippet-analyze" @click="$emit('analyze', snippet.id)">
          <font-awesome-icon icon="wand-magic-sparkles" />
        </button>
        <button class="snippet-delete" @click="$emit('delete', snippet.id)">
          <font-awesome-icon icon="trash" />
        </button>
      </div>
    </div>
    <div v-if="snippet.selector" class="snippet-selector">
      {{ snippet.selector }}
    </div>
    <div class="snippet-text">{{ snippet.text.slice(0, 420) }}</div>
    <div v-if="snippet.analysisSummary" class="snippet-summary">
      {{ snippet.analysisSummary }}
    </div>
    <div class="snippet-tag-editor">
      <div class="tag-editor-head">
        <span class="tag-editor-label">关键标签</span>
        <button
          v-if="!isEditingTags"
          class="snippet-edit"
          @click="startEditTags">
          编辑
        </button>
      </div>
      <template v-if="isEditingTags">
        <textarea
          v-model="draftTags"
          class="tag-editor-input"
          rows="2"
          placeholder="使用英文逗号分隔，例如：AI, 浏览器, 提示词" />
        <div class="tag-editor-actions">
          <button class="snippet-save" @click="saveTags">保存</button>
          <button class="snippet-cancel" @click="cancelEditTags">取消</button>
        </div>
      </template>
      <div v-else class="tag-editor-hint">
        {{
          snippet.analysisTags?.length
            ? "可手动补充、删减或重排标签。"
            : "暂无标签，可点击编辑手动补充。"
        }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.snippet-card {
  border: 1px solid rgba(112, 135, 168, 0.14);
  border-radius: 18px;
  padding: 12px;
  background: var(--sf-color-surface-soft);
  box-shadow: 0 8px 20px rgba(101, 133, 173, 0.08);
}

.snippet-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
  margin-bottom: 8px;
}

.snippet-mode {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6d7fb0;
}

.snippet-label {
  font-size: 13px;
  color: #7f8ca6;
  margin-top: 3px;
}

.snippet-tags {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.snippet-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #eaf4ff;
  color: #4d6f9d;
}

.snippet-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.snippet-analyze,
.snippet-delete,
.snippet-edit,
.snippet-save,
.snippet-cancel {
  border: 0;
  cursor: pointer;
  font: inherit;
}

.snippet-analyze {
  border-radius: 999px;
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #eef4ff;
  color: #5d6f98;
}

.snippet-delete {
  border-radius: 999px;
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #ffebee;
  color: #cf263f;
}

.snippet-selector {
  font-size: 11px;
  color: #8d99b3;
  word-break: break-all;
  margin-bottom: 8px;
}

.snippet-text {
  font-size: 13px;
  line-height: 1.7;
  color: #25324d;
  white-space: pre-wrap;
}

.snippet-summary {
  margin-top: 10px;
  padding: 10px;
  border-radius: 10px;
  background: #f4f9ff;
  color: #324a72;
  font-size: 13px;
  line-height: 1.6;
}

.snippet-tag-editor {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(112, 135, 168, 0.12);
}

.tag-editor-head,
.tag-editor-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.tag-editor-label {
  font-size: 12px;
  font-weight: 700;
  color: #51678f;
}

.tag-editor-input {
  width: 100%;
  box-sizing: border-box;
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid #d3ddef;
  background: #fff;
  color: #25324d;
  font: inherit;
  resize: vertical;
}

.snippet-edit,
.snippet-save,
.snippet-cancel {
  padding: 6px 10px;
  border-radius: 999px;
}

.snippet-edit,
.snippet-cancel {
  background: #eef4ff;
  color: #5d6f98;
}

.snippet-save {
  background: #dff3e8;
  color: #236548;
}

.tag-editor-actions {
  justify-content: flex-end;
  margin-top: 8px;
}

.tag-editor-hint {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: #7f8ca6;
}

/* Notebook theme override */
.snippet-card {
  border-color: var(--sf-color-border-medium) !important;
  border-radius: 8px !important;
  background: var(--sf-color-surface) !important;
  box-shadow: none !important;
}

.snippet-mode,
.snippet-label,
.snippet-selector,
.tag-editor-hint {
  color: var(--sf-color-text-faint) !important;
}

.snippet-text,
.tag-editor-label {
  color: var(--sf-color-text) !important;
}

.snippet-tag,
.snippet-summary,
.snippet-analyze,
.snippet-edit,
.snippet-cancel,
.tag-editor-input {
  background: var(--sf-color-surface-soft) !important;
  color: var(--sf-color-text-muted) !important;
  border-color: var(--sf-color-border-medium) !important;
}

.snippet-save {
  background: var(--sf-color-primary) !important;
  color: var(--sf-color-surface) !important;
}

.snippet-delete {
  background: var(--sf-color-error-soft) !important;
  color: var(--sf-color-error) !important;
}
</style>
