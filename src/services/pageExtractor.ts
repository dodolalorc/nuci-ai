import type { QuickSavePayload } from "~/src/types/knowledge"

export interface ExtractedPageContent extends QuickSavePayload {}

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

const ARTICLE_CONTENT_SELECTORS = [
  "article",
  "main article",
  "main",
  "[role='main']",
  ".post-content",
  ".article-content",
  ".markdown-body",
  ".entry-content",
  ".article-body",
  "#content",
  "#main"
]

function readMeta(selector: string, attr = "content"): string {
  return document.querySelector(selector)?.getAttribute(attr)?.trim() ?? ""
}

function normalizeText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

function sanitize(root: Element): Element {
  const clone = root.cloneNode(true) as Element
  clone.querySelectorAll(NOISE_SELECTORS).forEach((node) => node.remove())
  return clone
}

function scoreCandidate(element: Element): number {
  const cleaned = sanitize(element)
  const text = normalizeText(cleaned.textContent ?? "")
  return (
    text.length +
    cleaned.querySelectorAll("p").length * 80 +
    (text.length / Math.max(element.innerHTML.length, 1)) * 200
  )
}

function extractMainText(): string {
  for (const selector of ARTICLE_CONTENT_SELECTORS) {
    const element = document.querySelector(selector)
    if (!element) continue
    const text = normalizeText(sanitize(element).textContent ?? "")
    if (text.length > 200) return text
  }

  const candidates = Array.from(
    document.body?.querySelectorAll("div, section, article, main") ?? []
  )
  const best = candidates
    .map((element) => ({ element, score: scoreCandidate(element) }))
    .sort((left, right) => right.score - left.score)[0]

  return normalizeText(
    sanitize(best?.element ?? document.body).textContent ?? ""
  )
}

export function extractPageContent(): ExtractedPageContent {
  return {
    title:
      document.title ||
      readMeta('meta[property="og:title"]') ||
      readMeta('meta[name="twitter:title"]') ||
      location.hostname,
    url: location.href,
    content: extractMainText(),
    excerpt:
      readMeta('meta[name="description"]') ||
      readMeta('meta[property="og:description"]') ||
      readMeta('meta[name="twitter:description"]'),
    siteName:
      readMeta('meta[property="og:site_name"]') ||
      readMeta('meta[name="application-name"]') ||
      location.hostname
  }
}
