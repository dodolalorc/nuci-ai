import {
  getAllCaptureDrafts,
  getExperimentEvents,
  getKnowledgeRecords,
  getSnippetCollections,
  redactProviderSecrets
} from "~/src/sdk/storage"
import type {
  ApplyBookmarkPayload,
  BookmarkFolder,
  BookmarkItem,
  BookmarkMoveDecision,
  BookmarkMutationResult,
  BulkBookmarkApplyResult,
  ExportSnapshot,
  FolderIndex,
  SmartFavoritesSettings
} from "~/src/sdk/types"
import { knowledgeStorage } from "~/src/services/knowledgeStorage"

function rootTitleFor(node: chrome.bookmarks.BookmarkTreeNode) {
  if (node.id === "0") {
    return "Root"
  }

  return node.title || "Untitled"
}

function normalizeFolderSegments(input: string) {
  return input
    .split("/")
    .map((segment) => segment.trim())
    .filter(
      (segment) =>
        Boolean(segment) &&
        !["新建", "新建分类", "新建文件夹"].includes(segment)
    )
}

function walkFolders(
  node: chrome.bookmarks.BookmarkTreeNode,
  trail: string[],
  output: BookmarkFolder[]
) {
  const isFolder = !node.url
  const title = rootTitleFor(node)
  const nextTrail = node.id === "0" ? [] : [...trail, title]

  if (isFolder && node.id !== "0") {
    const children = node.children ?? []
    const bookmarkChildren = children.filter((item) => Boolean(item.url))

    output.push({
      id: node.id,
      title,
      parentId: node.parentId,
      path: nextTrail.join(" / "),
      bookmarkCount: bookmarkChildren.length,
      sampleTitles: bookmarkChildren
        .slice(0, 4)
        .map((item) => item.title || item.url || "")
        .filter(Boolean)
    })
  }

  for (const child of node.children ?? []) {
    if (!child.url) {
      walkFolders(child, nextTrail, output)
    }
  }
}

function walkBookmarks(
  node: chrome.bookmarks.BookmarkTreeNode,
  trail: string[],
  output: BookmarkItem[]
) {
  const title = rootTitleFor(node)
  const nextTrail = node.id === "0" ? [] : [...trail, title]

  for (const child of node.children ?? []) {
    if (child.url) {
      output.push({
        id: child.id,
        title: child.title || child.url,
        url: child.url,
        parentId: child.parentId,
        parentPath: nextTrail.join(" / "),
        dateAdded: child.dateAdded
      })
      continue
    }

    walkBookmarks(child, nextTrail, output)
  }
}

export async function buildFolderIndex(): Promise<FolderIndex> {
  const tree = await chrome.bookmarks.getTree()
  const folders: BookmarkFolder[] = []

  for (const root of tree) {
    walkFolders(root, [], folders)
  }

  return { folders }
}

export async function listBookmarks(limit = 200): Promise<BookmarkItem[]> {
  const tree = await chrome.bookmarks.getTree()
  const bookmarks: BookmarkItem[] = []

  for (const root of tree) {
    walkBookmarks(root, [], bookmarks)
  }

  return bookmarks
    .filter((item) => item.url.startsWith("http"))
    .sort((left, right) => (right.dateAdded ?? 0) - (left.dateAdded ?? 0))
    .slice(0, limit)
}

async function ensureFolderByPath(pathOrTitle: string) {
  const tree = await chrome.bookmarks.getTree()
  const bookmarkBar = findBookmarkBar(tree[0])

  if (!bookmarkBar) {
    throw new Error("未找到浏览器书签栏，无法创建文件夹。")
  }

  const segments = normalizeFolderSegments(pathOrTitle)
  if (segments.length === 0) {
    throw new Error("文件夹路径不能为空。")
  }

  let current = bookmarkBar

  for (const segment of segments) {
    const existing = (current.children ?? []).find(
      (child) => !child.url && child.title.trim() === segment
    )

    if (existing) {
      current = existing
      continue
    }

    current = await chrome.bookmarks.create({
      parentId: current.id,
      title: segment
    })
  }

  return current
}

function findBookmarkBar(node?: chrome.bookmarks.BookmarkTreeNode) {
  if (!node) {
    return undefined
  }

  if (node.id === "1" || node.title.toLowerCase().includes("bookmark")) {
    return node
  }

  for (const child of node.children ?? []) {
    const result = findBookmarkBar(child)
    if (result) {
      return result
    }
  }

  return undefined
}

async function findExistingBookmark(url: string) {
  const matches = await chrome.bookmarks.search({ url })
  return matches.find((item) => Boolean(item.url))
}

async function resolveFolder(payload: ApplyBookmarkPayload) {
  if (
    payload.recommendation.type === "existing" &&
    payload.recommendation.folderId
  ) {
    const [folder] = await chrome.bookmarks.get(payload.recommendation.folderId)
    if (folder) {
      return folder
    }
  }

  const requestedPath =
    payload.recommendation.type === "create"
      ? payload.recommendation.path.replace(/^新建\s*\/\s*/u, "").trim() ||
        payload.recommendation.title
      : payload.recommendation.title

  return ensureFolderByPath(requestedPath)
}

export async function applyBookmarkDecision(
  payload: ApplyBookmarkPayload
): Promise<BookmarkMutationResult> {
  const folder = await resolveFolder(payload)
  const existing = await findExistingBookmark(payload.page.url)

  let bookmark: chrome.bookmarks.BookmarkTreeNode

  if (existing?.id) {
    bookmark = await chrome.bookmarks.move(existing.id, {
      parentId: folder.id
    })

    bookmark = await chrome.bookmarks.update(existing.id, {
      title: payload.page.title
    })
  } else {
    bookmark = await chrome.bookmarks.create({
      parentId: folder.id,
      title: payload.page.title,
      url: payload.page.url
    })
  }

  return {
    folderPath: await resolveFolderPath(folder.id),
    bookmark,
    message: existing
      ? `已将现有书签移动到「${folder.title}」`
      : `已在「${folder.title}」中创建书签`
  }
}

async function resolveFolderPath(folderId: string) {
  const [folder] = await chrome.bookmarks.get(folderId)

  if (!folder) {
    return ""
  }

  const parts: string[] = []
  let current: chrome.bookmarks.BookmarkTreeNode | undefined = folder

  while (current) {
    if (current.id !== "0" && current.title) {
      parts.unshift(current.title)
    }

    if (!current.parentId) {
      break
    }

    const [parent] = await chrome.bookmarks.get(current.parentId)
    current = parent
  }

  return parts.join(" / ")
}

export async function applyBulkBookmarkDecisions(
  decisions: BookmarkMoveDecision[]
): Promise<BulkBookmarkApplyResult> {
  const results: BookmarkMutationResult[] = []

  for (const decision of decisions) {
    const [bookmark] = await chrome.bookmarks.get(decision.bookmarkId)

    if (!bookmark?.url) {
      continue
    }

    const result = await applyBookmarkDecision({
      page: {
        title: bookmark.title || bookmark.url,
        url: bookmark.url,
        domain: new URL(bookmark.url).hostname,
        summary: ""
      },
      input: {
        page: {
          title: bookmark.title || bookmark.url,
          url: bookmark.url,
          domain: new URL(bookmark.url).hostname,
          summary: ""
        },
        tags: [],
        notes: ""
      },
      recommendation: decision.recommendation
    })

    results.push(result)
  }

  return {
    moved: results.length,
    results
  }
}

export async function buildExportSnapshot(
  settings: SmartFavoritesSettings,
  folderIndex: FolderIndex
): Promise<ExportSnapshot> {
  const [knowledge, knowledgeItems, analytics, drafts, collections] =
    await Promise.all([
      getKnowledgeRecords(),
      knowledgeStorage.list({ includeArchived: true }),
      getExperimentEvents(),
      getAllCaptureDrafts(),
      getSnippetCollections()
    ])

  return {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    settings: redactProviderSecrets(settings),
    knowledge,
    knowledgeItems,
    analytics,
    folders: folderIndex.folders,
    drafts,
    collections
  }
}
