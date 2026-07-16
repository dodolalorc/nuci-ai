import { describe, expect, it } from "vitest"

import {
  normalizeDeepNote,
  normalizeQuickMeta,
  parseAiJsonResponse,
  withAiRetry
} from "./aiService"

describe("parseAiJsonResponse", () => {
  it("accepts a fenced JSON response", () => {
    expect(
      parseAiJsonResponse('```json\n{"summary":"ok","tags":["AI"]}\n```')
    ).toEqual({ summary: "ok", tags: ["AI"] })
  })

  it("rejects malformed model output", () => {
    expect(() => parseAiJsonResponse('{"summary":')).toThrow(
      "AI 响应 JSON 解析失败"
    )
  })
})

describe("AI response normalizers", () => {
  it("keeps only supported quick metadata fields", () => {
    expect(
      normalizeQuickMeta({
        summary: "  useful summary  ",
        tags: ["AI", 42, "", "x".repeat(60)],
        category: "not-a-category",
        subCategory: 123
      })
    ).toEqual({
      summary: "useful summary",
      tags: ["AI", "x".repeat(48)],
      category: "其他",
      subCategory: undefined
    })
  })

  it("normalizes deep note lists and difficulty", () => {
    expect(
      normalizeDeepNote({
        keyPoints: ["point", 1],
        outline: "invalid",
        learningNotes: 3,
        difficulty: "unknown"
      })
    ).toMatchObject({
      keyPoints: ["point"],
      outline: [],
      learningNotes: "",
      difficulty: "intermediate"
    })
  })
})

describe("withAiRetry", () => {
  it("retries a failed provider request once", async () => {
    let attempts = 0
    await expect(
      withAiRetry(async () => {
        attempts += 1
        if (attempts === 1) throw new Error("temporary")
        return "ok"
      })
    ).resolves.toBe("ok")
    expect(attempts).toBe(2)
  })
})
