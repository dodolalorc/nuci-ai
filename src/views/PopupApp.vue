<script setup lang="ts">
import { onMounted, ref } from "vue"

import {
  KNOWLEDGE_MESSAGE,
  sendKnowledgeMessage
} from "../sdk/knowledgeMessages"

interface RecentItem {
  id: string
  title: string
  url: string
  category: string
  createdAt: number
}

const todayCount = ref(0)
const recentItems = ref<RecentItem[]>([])
const isLoading = ref(true)

onMounted(async () => {
  try {
    const [count, items] = await Promise.all([
      sendKnowledgeMessage(KNOWLEDGE_MESSAGE.getTodayCount, undefined),
      sendKnowledgeMessage(KNOWLEDGE_MESSAGE.getRecent, { limit: 3 })
    ])
    todayCount.value = count
    recentItems.value = items
  } catch {
    // ignore - not yet configured
  } finally {
    isLoading.value = false
  }
})

function openKnowledgeBase() {
  void sendKnowledgeMessage(KNOWLEDGE_MESSAGE.openKnowledgeBase, undefined)
}

function openHistory() {
  chrome.tabs.create({ url: chrome.runtime.getURL("tabs/manage.html#history") })
}

function openSettings() {
  chrome.tabs.create({
    url: chrome.runtime.getURL("tabs/manage.html#settings")
  })
}

function formatTime(ts: number) {
  const d = new Date(ts)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return "刚刚"
  if (diffMin < 60) return `${diffMin} 分钟前`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH} 小时前`
  return `${Math.floor(diffH / 24)} 天前`
}
</script>

<template>
  <div class="popup">
    <!-- 头部 -->
    <div class="popup__header">
      <div class="popup__logo">K</div>
      <div class="popup__title-group">
        <div class="popup__title">知识库</div>
        <div class="popup__subtitle">本地优先 · 网页知识采集</div>
      </div>
    </div>

    <!-- 今日统计 -->
    <div class="popup__stat-row">
      <span class="popup__stat-label">今日已保存</span>
      <span class="popup__stat-number">{{ isLoading ? "–" : todayCount }}</span>
      <span class="popup__stat-unit">条</span>
    </div>

    <!-- 最近保存 -->
    <div class="popup__section">
      <div class="popup__section-title">最近保存</div>
      <div v-if="isLoading" class="popup__empty">加载中…</div>
      <div v-else-if="recentItems.length === 0" class="popup__empty">
        还没有保存任何内容<br />
        <span class="popup__empty-hint">在网页右下角点击悬浮按钮开始保存</span>
      </div>
      <div v-else class="popup__recent-list">
        <a
          v-for="item in recentItems"
          :key="item.id"
          :href="item.url"
          target="_blank"
          class="popup__recent-item">
          <div class="popup__recent-title" :title="item.title">
            {{ item.title || "无标题" }}
          </div>
          <div class="popup__recent-meta">
            <span class="popup__recent-cat">{{ item.category }}</span>
            <span class="popup__recent-time">{{
              formatTime(item.createdAt)
            }}</span>
          </div>
        </a>
      </div>
    </div>

    <!-- 操作 -->
    <div class="popup__actions">
      <button class="popup__action-btn" @click="openKnowledgeBase">
        打开知识库
      </button>
      <div class="popup__action-secondary">
        <button class="popup__action-link" @click="openHistory">
          历史书签整理
        </button>
        <button class="popup__action-link" @click="openSettings">设置</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.popup {
  width: 300px;
  min-height: 360px;
  background: #f5f4f0;
  font-family: "DM Sans", "PingFang SC", "Hiragino Sans GB", sans-serif;
  color: #1b1b22;
  display: flex;
  flex-direction: column;
}

.popup__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  background: #ffffff;
  border-bottom: 1px solid rgba(27, 27, 34, 0.07);
}

.popup__logo {
  width: 30px;
  height: 30px;
  border-radius: 6px;
  background: #1b1b22;
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  letter-spacing: -0.01em;
}

.popup__title-group {
  min-width: 0;
}

.popup__title {
  font-size: 14px;
  font-weight: 600;
  color: #1b1b22;
  line-height: 1.3;
}

.popup__subtitle {
  font-size: 11px;
  color: #aeadb8;
  margin-top: 1px;
  letter-spacing: 0.01em;
}

.popup__stat-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
  padding: 12px 16px;
  background: #ffffff;
  border-bottom: 1px solid rgba(27, 27, 34, 0.07);
}

.popup__stat-label {
  font-size: 12px;
  color: #6b6870;
  flex: 1;
}

.popup__stat-number {
  font-size: 20px;
  font-weight: 600;
  color: #1b1b22;
  line-height: 1;
  letter-spacing: -0.03em;
}

.popup__stat-unit {
  font-size: 12px;
  color: #6b6870;
}

.popup__section {
  flex: 1;
  padding: 12px 16px;
  background: #f5f4f0;
}

.popup__section-title {
  font-size: 10px;
  font-weight: 500;
  color: #aeadb8;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  margin-bottom: 8px;
}

.popup__empty {
  font-size: 12px;
  color: #aeadb8;
  line-height: 1.7;
  padding: 4px 0;
  text-align: left;
}

.popup__empty-hint {
  font-size: 11px;
  color: #c8c7d1;
  display: block;
  margin-top: 2px;
}

.popup__recent-list {
  display: flex;
  flex-direction: column;
}

.popup__recent-item {
  display: block;
  padding: 8px 0 8px 10px;
  text-decoration: none;
  color: inherit;
  border-left: 2px solid rgba(27, 27, 34, 0.08);
  transition: border-color 0.15s;
  margin-bottom: 4px;
}

.popup__recent-item:hover {
  border-left-color: #3960a8;
}

.popup__recent-title {
  font-size: 12px;
  font-weight: 500;
  color: #1b1b22;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
}

.popup__recent-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
}

.popup__recent-cat {
  font-size: 10px;
  color: #3960a8;
  border: 1px solid rgba(57, 96, 168, 0.28);
  border-radius: 3px;
  padding: 0 5px;
  line-height: 16px;
}

.popup__recent-time {
  font-size: 10px;
  color: #aeadb8;
}

.popup__actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px 16px;
  background: #ffffff;
  border-top: 1px solid rgba(27, 27, 34, 0.07);
}

.popup__action-btn {
  display: block;
  width: 100%;
  padding: 9px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  font-family: inherit;
  text-align: center;
  background: #1b1b22;
  color: #fff;
  transition: opacity 0.15s;
}

.popup__action-btn:hover {
  opacity: 0.82;
}

.popup__action-secondary {
  display: flex;
  justify-content: center;
  gap: 20px;
}

.popup__action-link {
  background: none;
  border: none;
  font-size: 12px;
  color: #6b6870;
  cursor: pointer;
  font-family: inherit;
  padding: 0;
  transition: color 0.15s;
}

.popup__action-link:hover {
  color: #1b1b22;
}
</style>
