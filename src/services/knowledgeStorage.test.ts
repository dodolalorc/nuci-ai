import { beforeEach, describe, expect, it, vi } from "vitest"

import { STORAGE_KEYS } from "~/src/sdk/constants"

type Store = Record<string, unknown>

let store: Store

beforeEach(() => {
  store = {}
  vi.resetModules()
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: store[key] })),
        set: vi.fn(async (value: Store) => Object.assign(store, value))
      }
    }
  })
})

describe("knowledgeStorage", () => {
  it("migrates a legacy bookmark record into the unified store", async () => {
    store[STORAGE_KEYS.knowledge] = [
      {
        createdAt: "2026-01-01T00:00:00.000Z",
        title: "Legacy article",
        url: "https://example.com/article",
        folderPath: "Reading / AI",
        tags: ["AI"],
        selectedText: "Useful passage",
        source: "existing"
      }
    ]

    const { knowledgeStorage } = await import("./knowledgeStorage")
    const items = await knowledgeStorage.list()

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      schemaVersion: 1,
      sourceType: "bookmark",
      category: "Reading / AI",
      content: "Useful passage"
    })
    expect(store[STORAGE_KEYS.knowledgeItems]).toHaveLength(1)
  })

  it("updates the existing item when the same page is saved again", async () => {
    const { knowledgeStorage } = await import("./knowledgeStorage")
    const first = await knowledgeStorage.upsertByUrl({
      title: "First title",
      url: "https://example.com/article",
      content: "Old content",
      sourceType: "page",
      tags: [],
      category: "其他",
      aiStatus: "pending"
    })
    await knowledgeStorage.update(first.id, { favorite: true })

    const updated = await knowledgeStorage.upsertByUrl({
      title: "Updated title",
      url: "https://example.com/article",
      content: "New content",
      sourceType: "page",
      tags: ["更新"],
      category: "产品",
      aiStatus: "success"
    })

    expect(updated).toMatchObject({
      id: first.id,
      title: "Updated title",
      favorite: true,
      category: "产品"
    })
    expect(await knowledgeStorage.list()).toHaveLength(1)
  })

  it("keeps existing AI metadata when a later quick save cannot use AI", async () => {
    const { knowledgeStorage } = await import("./knowledgeStorage")
    const first = await knowledgeStorage.upsertByUrl({
      title: "Article",
      url: "https://example.com/article",
      content: "Original content",
      sourceType: "page",
      summary: "Edited summary",
      tags: ["Important"],
      category: "产品",
      aiStatus: "success"
    })

    const updated = await knowledgeStorage.upsertByUrl({
      title: "Article",
      url: "https://example.com/article",
      content: "Freshly extracted content",
      sourceType: "page",
      tags: [],
      category: "其他",
      aiStatus: "pending"
    })

    expect(updated).toMatchObject({
      id: first.id,
      content: "Freshly extracted content",
      summary: "Edited summary",
      tags: ["Important"],
      category: "产品",
      aiStatus: "success"
    })
  })
})
