import type { SmartFavoritesSettings } from "~/src/sdk/types"

export const DEFAULT_PROVIDER_ID = "default-provider"
export const GITHUB_REPO_URL = "https://github.com/dodolalorc/nuci-ai"
export const DEFAULT_PROVIDER_LABEL = "DeepSeek 默认模型"
export const DEFAULT_PROVIDER_BASE_URL = "https://api.deepseek.com/v1"
export const DEFAULT_PROVIDER_MODEL = "deepseek-v4-flash"

export const STORAGE_KEYS = {
  settings: "bookmarks-collector/settings",
  knowledge: "bookmarks-collector/knowledge",
  knowledgeItems: "bookmarks-collector/knowledge-items",
  analytics: "bookmarks-collector/analytics",
  drafts: "bookmarks-collector/drafts",
  collections: "bookmarks-collector/collections",
  recommendationFeedback: "bookmarks-collector/recommendation-feedback",
  bookmarkUndoOperations: "bookmarks-collector/bookmark-undo-operations"
} as const

export const DEFAULT_SYSTEM_PROMPT =
  "你是一个浏览器书签分类助手。你不会自动执行移动，只输出适合的文件夹建议。优先复用已有结构，只有在确实不匹配时才建议新建文件夹。输出必须是 JSON。"

export const DEFAULT_PROMPT_TEMPLATE = `请根据以下信息推荐浏览器书签收藏夹。
页面信息：
- 标题：{{title}}
- 链接：{{url}}
- 域名：{{domain}}
- 描述：{{description}}
- 摘要：{{summary}}
- 用户选中文本：{{selectedText}}
- 用户补充标签：{{tags}}
- 用户备注：{{notes}}

现有收藏夹结构：
{{folders}}

请输出 JSON：
{
  "suggestions": [
    {
      "type": "existing" | "create",
      "folderId": "existing 时必填",
      "title": "文件夹标题",
      "reason": "说明原因"
    }
  ]
}
`

export const DEFAULT_SETTINGS: SmartFavoritesSettings = {
  provider: {
    baseUrl: DEFAULT_PROVIDER_BASE_URL,
    apiKey: "",
    model: DEFAULT_PROVIDER_MODEL
  },
  providers: [
    {
      id: DEFAULT_PROVIDER_ID,
      label: DEFAULT_PROVIDER_LABEL,
      baseUrl: DEFAULT_PROVIDER_BASE_URL,
      apiKey: "",
      model: DEFAULT_PROVIDER_MODEL
    }
  ],
  activeProviderId: DEFAULT_PROVIDER_ID,
  prompts: {
    system: DEFAULT_SYSTEM_PROMPT,
    template: DEFAULT_PROMPT_TEMPLATE
  },
  behavior: {
    allowCreateFolder: true,
    preferExistingFolder: true,
    storeKnowledge: true
  }
}
