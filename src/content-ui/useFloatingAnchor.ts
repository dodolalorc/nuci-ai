import { computed, ref } from "vue"

export type FloatingSide = "left" | "right"

type FloatingAnchor = {
  side: FloatingSide
  top: number
}

type DragSession = {
  offsetX: number
  offsetY: number
  moved: boolean
}

const FLOATING_ANCHOR_KEY = "bookmarks-collector/floating-anchor"
const BALL_SIZE = 40
const EDGE_GAP = 12
const DRAG_THRESHOLD = 4

export function useFloatingAnchor() {
  const ballRef = ref<HTMLElement | null>(null)
  const anchor = ref<FloatingAnchor>(createDefaultAnchor())
  const dragLeft = ref(0)
  const dragTop = ref(0)
  const isDragging = ref(false)
  const justDragged = ref(false)
  let dragSession: DragSession | null = null

  const resolvedSide = computed<FloatingSide>(() => anchor.value.side)
  const rootStyle = computed(() => {
    if (isDragging.value) {
      return { top: `${dragTop.value}px`, left: `${dragLeft.value}px` }
    }

    return anchor.value.side === "left"
      ? { top: `${anchor.value.top}px`, left: `${EDGE_GAP}px` }
      : { top: `${anchor.value.top}px`, right: `${EDGE_GAP}px` }
  })

  function createDefaultAnchor(): FloatingAnchor {
    return {
      side: "right",
      top: clampTop(Math.round(window.innerHeight * 0.22))
    }
  }

  function clampTop(value: number) {
    const maxTop = Math.max(EDGE_GAP, window.innerHeight - BALL_SIZE - EDGE_GAP)
    return Math.min(Math.max(value, EDGE_GAP), maxTop)
  }

  function clampLeft(value: number) {
    const maxLeft = Math.max(EDGE_GAP, window.innerWidth - BALL_SIZE - EDGE_GAP)
    return Math.min(Math.max(value, EDGE_GAP), maxLeft)
  }

  async function loadAnchor() {
    const stored = await chrome.storage.local.get(FLOATING_ANCHOR_KEY)
    const next = stored[FLOATING_ANCHOR_KEY] as
      | Partial<FloatingAnchor>
      | undefined

    if (next?.side !== "left" && next?.side !== "right") {
      anchor.value = createDefaultAnchor()
      return
    }

    anchor.value = {
      side: next.side,
      top: clampTop(Number(next.top) || createDefaultAnchor().top)
    }
  }

  async function persistAnchor() {
    await chrome.storage.local.set({ [FLOATING_ANCHOR_KEY]: anchor.value })
  }

  function clearDragListeners() {
    document.removeEventListener("mousemove", handleDragMove, true)
    document.removeEventListener("mouseup", handleDragEnd, true)
  }

  function handleBallMouseDown(event: MouseEvent, onStart: () => void) {
    if (event.button !== 0 || !ballRef.value) return

    const rect = ballRef.value.getBoundingClientRect()
    dragSession = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false
    }
    dragLeft.value = rect.left
    dragTop.value = rect.top
    isDragging.value = false
    onStart()
    document.addEventListener("mousemove", handleDragMove, true)
    document.addEventListener("mouseup", handleDragEnd, true)
  }

  function handleDragMove(event: MouseEvent) {
    if (!dragSession) return

    const nextLeft = clampLeft(event.clientX - dragSession.offsetX)
    const nextTop = clampTop(event.clientY - dragSession.offsetY)
    if (
      !dragSession.moved &&
      (Math.abs(nextLeft - dragLeft.value) > DRAG_THRESHOLD ||
        Math.abs(nextTop - dragTop.value) > DRAG_THRESHOLD)
    ) {
      dragSession.moved = true
    }

    dragLeft.value = nextLeft
    dragTop.value = nextTop
    isDragging.value = dragSession.moved
  }

  function handleDragEnd() {
    if (!dragSession) return

    const moved = dragSession.moved
    anchor.value = {
      side:
        dragLeft.value + BALL_SIZE / 2 < window.innerWidth / 2
          ? "left"
          : "right",
      top: clampTop(dragTop.value)
    }
    clearDragListeners()
    dragSession = null
    isDragging.value = false
    void persistAnchor()

    if (moved) {
      justDragged.value = true
      window.setTimeout(() => {
        justDragged.value = false
      }, 0)
    }
  }

  function handleResize() {
    anchor.value = { ...anchor.value, top: clampTop(anchor.value.top) }
    void persistAnchor()
  }

  return {
    ballRef,
    clearDragListeners,
    handleBallMouseDown,
    handleResize,
    isDragging,
    justDragged,
    loadAnchor,
    resolvedSide,
    rootStyle
  }
}
