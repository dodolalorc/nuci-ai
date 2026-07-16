import { describe, expect, it } from "vitest"

import { normalizeKnowledgePage } from "./knowledgeService"

describe("normalizeKnowledgePage", () => {
  const validPage = {
    title: "Example article",
    url: "https://example.com/article",
    content: "A useful article"
  }

  it("rejects an incomplete capture payload", () => {
    expect(() => normalizeKnowledgePage({ ...validPage, content: "" })).toThrow(
      "页面内容不完整"
    )
  })

  it("rejects non-web URLs", () => {
    expect(() =>
      normalizeKnowledgePage({ ...validPage, url: "chrome://settings" })
    ).toThrow("当前页面链接不可保存")
  })

  it("trims metadata and limits the saved content budget", () => {
    const page = normalizeKnowledgePage({
      ...validPage,
      title: "  Example article  ",
      content: "x".repeat(40_000),
      excerpt: "  summary  ",
      siteName: "  Example  "
    })

    expect(page).toMatchObject({
      title: "Example article",
      excerpt: "summary",
      siteName: "Example"
    })
    expect(page.content).toHaveLength(32_000)
  })
})
