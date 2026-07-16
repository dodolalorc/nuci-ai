import type { ExperimentCondition, ExperimentEvent } from "~/src/sdk/types"
import type { KnowledgeItem } from "~/src/types/knowledge"

interface ConditionMetricSummary {
  condition: ExperimentCondition
  total: number
  top1Rate: number
  top3Rate: number
  avgSteps: number
  avgLatencyMs: number
  avgExplanationSatisfaction: number | null
  avgInterventionSatisfaction: number | null
}

export interface AnalyticsSummary {
  totalEvents: number
  totalKnowledgeRecords: number
  uniquePages: number
  conditionRows: ConditionMetricSummary[]
  tagDistribution: Array<{ label: string; count: number; ratio: number }>
  folderDistribution: Array<{ label: string; count: number; ratio: number }>
  sourceDistribution: Array<{ label: string; count: number; ratio: number }>
  domainDistribution: Array<{ label: string; count: number; ratio: number }>
  pageTypeDistribution: Array<{ label: string; count: number; ratio: number }>
  hourDistribution: Array<{ label: string; count: number; ratio: number }>
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function averageOrNull(values: number[]) {
  if (values.length === 0) {
    return null
  }

  return average(values)
}

function buildDistribution(entries: string[], limit = 8) {
  const total = entries.length
  if (total === 0) {
    return []
  }

  const counts = new Map<string, number>()
  for (const entry of entries) {
    const normalized = entry.trim()
    if (!normalized) {
      continue
    }

    counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([label, count]) => ({
      label,
      count,
      ratio: count / total
    }))
}

export function buildAnalyticsSummary(
  events: ExperimentEvent[],
  knowledgeItems: KnowledgeItem[]
): AnalyticsSummary {
  const conditions: ExperimentCondition[] = ["manual", "rule", "enhanced"]
  const conditionRows = conditions.map((condition) => {
    const scoped = events.filter((event) => event.condition === condition)

    return {
      condition,
      total: scoped.length,
      top1Rate: scoped.length
        ? scoped.filter((event) => event.top1Accepted).length / scoped.length
        : 0,
      top3Rate: scoped.length
        ? scoped.filter((event) => event.top3Covered).length / scoped.length
        : 0,
      avgSteps: average(scoped.map((event) => event.steps)),
      avgLatencyMs: average(scoped.map((event) => event.latencyMs)),
      avgExplanationSatisfaction: averageOrNull(
        scoped
          .map((event) => event.explanationSatisfaction)
          .filter((value): value is number => typeof value === "number")
      ),
      avgInterventionSatisfaction: averageOrNull(
        scoped
          .map((event) => event.interventionSatisfaction)
          .filter((value): value is number => typeof value === "number")
      )
    }
  })

  return {
    totalEvents: events.length,
    totalKnowledgeRecords: knowledgeItems.length,
    uniquePages: new Set(
      knowledgeItems.map((record) => record.url).filter(Boolean)
    ).size,
    conditionRows,
    tagDistribution: buildDistribution(
      knowledgeItems.flatMap((record) => record.tags)
    ),
    folderDistribution: buildDistribution(
      knowledgeItems.map(
        (record) => record.subCategory || record.category || "未分类"
      )
    ),
    sourceDistribution: buildDistribution(
      knowledgeItems.map((record) => record.sourceType || "unknown")
    ),
    domainDistribution: buildDistribution(
      knowledgeItems
        .map((record) => {
          try {
            return new URL(record.url).hostname
          } catch {
            return ""
          }
        })
        .filter(Boolean)
    ),
    pageTypeDistribution: buildDistribution(
      events.map((event) => event.pageType || "unknown")
    ),
    hourDistribution: buildDistribution(
      knowledgeItems.map((record) => {
        const date = new Date(record.createdAt)
        return `${date.getHours().toString().padStart(2, "0")}:00`
      }),
      24
    )
  }
}
