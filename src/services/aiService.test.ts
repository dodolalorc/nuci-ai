import { describe, expect, it } from "vitest"

import { parseAiJsonResponse } from "./aiService"

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
