import { analyzeSnippetContent } from "~/src/sdk/provider"
import {
  getCaptureDraft,
  getSettings,
  updateCapturedSnippet
} from "~/src/sdk/storage"
import type { PageCaptureDraft } from "~/src/sdk/types"

export async function analyzeCapturedSnippet(payload: {
  url: string
  snippetId: string
}): Promise<PageCaptureDraft> {
  const draft = await getCaptureDraft(payload.url)
  const target = draft.snippets.find(
    (snippet) => snippet.id === payload.snippetId
  )

  if (!target) return draft

  const analysis = await analyzeSnippetContent(target.text, await getSettings())
  return updateCapturedSnippet(payload.url, payload.snippetId, (snippet) => ({
    ...snippet,
    analysisSummary: analysis.summary,
    analysisTags: analysis.tags,
    analysisUpdatedAt: new Date().toISOString()
  }))
}

export async function updateCapturedSnippetTags(payload: {
  url: string
  snippetId: string
  tags: string[]
}): Promise<PageCaptureDraft> {
  const tags = payload.tags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12)

  return updateCapturedSnippet(payload.url, payload.snippetId, (snippet) => ({
    ...snippet,
    analysisTags: tags,
    analysisUpdatedAt: new Date().toISOString()
  }))
}

export async function analyzeAllCapturedSnippets(payload: {
  url: string
  force?: boolean
}): Promise<PageCaptureDraft> {
  const draft = await getCaptureDraft(payload.url)
  const settings = await getSettings()
  let nextDraft = draft

  for (const snippet of draft.snippets) {
    if (
      !payload.force &&
      snippet.analysisSummary &&
      snippet.analysisTags?.length
    ) {
      continue
    }

    const analysis = await analyzeSnippetContent(snippet.text, settings)
    nextDraft = await updateCapturedSnippet(
      payload.url,
      snippet.id,
      (current) => ({
        ...current,
        analysisSummary: analysis.summary,
        analysisTags: analysis.tags,
        analysisUpdatedAt: new Date().toISOString()
      })
    )
  }

  return nextDraft
}
