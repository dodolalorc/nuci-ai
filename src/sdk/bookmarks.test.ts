import { beforeEach, describe, expect, it, vi } from "vitest"

import { STORAGE_KEYS } from "./constants"

type Store = Record<string, unknown>

let store: Store
let move: ReturnType<typeof vi.fn>

beforeEach(() => {
  store = {}
  move = vi.fn(async () => undefined)
  vi.resetModules()
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: store[key] })),
        set: vi.fn(async (value: Store) => Object.assign(store, value))
      }
    },
    bookmarks: { move }
  })
})

describe("undoBulkBookmarkOperation", () => {
  it("restores a batch in reverse order and clears its completed operation", async () => {
    store[STORAGE_KEYS.bookmarkUndoOperations] = [
      {
        id: "undo-1",
        createdAt: "2026-07-16T00:00:00.000Z",
        entries: [
          { bookmarkId: "first", parentId: "folder-a", index: 0 },
          { bookmarkId: "second", parentId: "folder-b", index: 2 }
        ]
      }
    ]

    const { undoBulkBookmarkOperation } = await import("./bookmarks")
    await expect(undoBulkBookmarkOperation("undo-1")).resolves.toEqual({
      restored: 2,
      skipped: 0
    })

    expect(move).toHaveBeenNthCalledWith(1, "second", {
      parentId: "folder-b",
      index: 2
    })
    expect(move).toHaveBeenNthCalledWith(2, "first", {
      parentId: "folder-a",
      index: 0
    })
    expect(store[STORAGE_KEYS.bookmarkUndoOperations]).toEqual([])
  })
})
