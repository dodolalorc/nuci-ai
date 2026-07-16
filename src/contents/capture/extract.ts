import type {
  CapturedSnippet,
  PageContext,
  PageDigestSegment
} from "../../sdk/types"
import { extractPageContent } from "../../services/pageExtractor"

const readMeta = (selector: string, attr = "content") =>
  document.querySelector(selector)?.getAttribute(attr)?.trim() ?? ""

const NOISE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "svg",
  "canvas",
  "iframe",
  "form",
  "button",
  "input",
  "textarea",
  "select",
  "nav",
  "aside",
  "footer",
  "header nav",
  "[role='navigation']",
  "[role='complementary']",
  ".advertisement",
  ".ads",
  ".ad",
  ".sidebar",
  ".toc",
  ".table-of-contents",
  ".comments",
  ".comment",
  ".related",
  ".recommend",
  ".breadcrumb",
  ".pager",
  ".pagination"
].join(", ")

export const getCurrentSelectionText = () =>
  window.getSelection?.()?.toString().trim() ?? ""

export const createSnippet = (
  mode: "selection" | "element",
  text: string,
  label: string,
  selector?: string
): CapturedSnippet => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  mode,
  text,
  label,
  selector,
  createdAt: new Date().toISOString()
})

const normalizeText = (text: string) =>
  text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()

const uniqueTextBlocks = (items: string[]) => {
  const seen = new Set<string>()

  return items.filter((item) => {
    const normalized = normalizeText(item)
    if (!normalized || seen.has(normalized)) {
      return false
    }

    seen.add(normalized)
    return true
  })
}

const sanitizeRoot = (root: Element) => {
  const clone = root.cloneNode(true) as Element
  clone.querySelectorAll(NOISE_SELECTORS).forEach((node) => node.remove())
  return clone
}

const readTextBlocks = (root: ParentNode, selector: string) =>
  uniqueTextBlocks(
    Array.from(root.querySelectorAll(selector))
      .map((element) => element.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter((text) => text.length > 0)
  )

const textDensity = (element: Element) => {
  const textLength = normalizeText(element.textContent ?? "").length
  const htmlLength = element.innerHTML.length || 1
  return textLength / htmlLength
}

const scoreArticleCandidate = (element: Element) => {
  const cleanRoot = sanitizeRoot(element)
  const text = normalizeText(cleanRoot.textContent ?? "")
  const paragraphs = readTextBlocks(cleanRoot, "p")
  const headings = readTextBlocks(cleanRoot, "h1, h2, h3, h4")
  const lists = readTextBlocks(cleanRoot, "li")
  const density = textDensity(cleanRoot)

  return (
    text.length +
    paragraphs.length * 220 +
    headings.length * 90 +
    lists.length * 40 +
    density * 400
  )
}

const pickArticleRoot = () => {
  const candidates = Array.from(
    document.querySelectorAll(
      "article, main article, main, [role='main'], .post, .article, .entry-content, .markdown-body, .content, .post-content, .article-content, .document, .docMainContainer"
    )
  )

  const scored = candidates
    .map((element) => ({
      element,
      score: scoreArticleCandidate(element)
    }))
    .sort((left, right) => right.score - left.score)

  return scored[0]?.element ?? document.body
}

export const getPageArticleText = () => {
  return extractPageContent().content.slice(0, 32000)
}

export const getPageArticleSegments = (): PageDigestSegment[] => {
  const articleRoot = sanitizeRoot(pickArticleRoot())
  const blocks = uniqueTextBlocks(
    readTextBlocks(articleRoot, "p, li, blockquote, pre code, figcaption, td")
  )
    .map((text) => normalizeText(text))
    .filter((text) => text.length >= 36)
    .slice(0, 120)

  return blocks.map((text, index) => ({
    id: `segment-${index + 1}`,
    text,
    selected: true,
    order: index
  }))
}

const buildSummaryBlocks = (root: Element) =>
  uniqueTextBlocks(readTextBlocks(root, "p, article p, main p, li, blockquote"))
    .filter((text) => text.length > 40)
    .slice(0, 8)

export const getPageContext = (): PageContext => {
  const title = document.title?.trim() || location.hostname
  const description = readMeta('meta[name="description"]')
  const author =
    readMeta('meta[name="author"]') ||
    readMeta('meta[property="article:author"]') ||
    (document.querySelector('[itemprop="author"]')?.textContent?.trim() ?? "")
  const siteName = readMeta('meta[property="og:site_name"]')
  const publishedAt =
    readMeta('meta[property="article:published_time"]') ||
    readMeta('meta[name="publish-date"]') ||
    readMeta('meta[name="date"]') ||
    (document.querySelector("time")?.getAttribute("datetime")?.trim() ?? "")

  const articleRoot = sanitizeRoot(pickArticleRoot())
  const headings = uniqueTextBlocks(
    Array.from(articleRoot.querySelectorAll("h1, h2, h3"))
      .map((element) => element.textContent?.trim() ?? "")
      .filter(Boolean)
  ).slice(0, 10)

  const paragraphs = buildSummaryBlocks(articleRoot)

  return {
    title,
    url: location.href,
    domain: location.hostname,
    description,
    author,
    siteName,
    publishedAt,
    summary: [description, ...headings, ...paragraphs]
      .filter(Boolean)
      .join("\n")
      .slice(0, 2400)
  }
}

export const cssPathFor = (element: Element) => {
  const segments: string[] = []
  let current: Element | null = element

  while (current && segments.length < 5) {
    const tag = current.tagName.toLowerCase()
    if (current.id) {
      segments.unshift(`${tag}#${current.id}`)
      break
    }

    const siblings = current.parentElement
      ? Array.from(current.parentElement.children).filter(
          (item) => item.tagName === current.tagName
        )
      : []
    const index =
      siblings.length > 1
        ? `:nth-of-type(${siblings.indexOf(current) + 1})`
        : ""
    segments.unshift(`${tag}${index}`)
    current = current.parentElement
  }

  return segments.join(" > ")
}
