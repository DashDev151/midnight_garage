import { computed, ref, type ComputedRef } from 'vue'

/**
 * A general-purpose drag-and-drop primitive (Sprint 17), built on the
 * Pointer Events API so mouse and touch work identically with the same
 * code - no native HTML5 Drag-and-Drop (poor/nonexistent touch support) and
 * no new dependency. Generic over payload type `T` (a car id today,
 * Sprint 18's part id tomorrow) - this file has zero domain knowledge.
 *
 * Deliberately does NOT use `setPointerCapture` or `elementFromPoint`: a
 * drop zone's own `onPointerUp` handler fires naturally via standard DOM
 * event targeting (the browser already knows which element is under the
 * pointer at release time) - simpler, and reliably testable without a real
 * rendering engine computing layout (this project's test environment is
 * happy-dom, which doesn't).
 *
 * One module-level `session` is shared across every `useDraggable`/
 * `useDropZone` pair on the page - a drag can only ever originate from one
 * draggable and land on one zone, so there is exactly one "what's currently
 * being dragged or picked" at a time, not one per component instance.
 */
export type DragSessionMode = 'drag' | 'pick'

export interface DragSession {
  payload: unknown
  mode: DragSessionMode
  x: number
  y: number
}

const session = ref<DragSession | null>(null)

/** Read-only view of the current drag/pick session, for rendering a ghost
 * preview that follows the pointer. `null` when nothing is in progress. */
export function useDragSession(): ComputedRef<DragSession | null> {
  return computed(() => session.value)
}

/** Pixels the pointer must move past `pointerdown` before this counts as a
 * drag rather than a click - small enough to feel responsive, large enough
 * that a plain click (e.g. a `RouterLink` underneath) still navigates. */
const DRAG_THRESHOLD_PX = 6

export interface DraggableHandle {
  /** True while this specific payload is being actively dragged (pointer down and past the threshold). */
  isDragging: ComputedRef<boolean>
  /** True while this specific payload is "picked" via the click-based accessibility fallback. */
  isPicked: ComputedRef<boolean>
  onPointerDown: (event: PointerEvent) => void
  onPointerMove: (event: PointerEvent) => void
  onPointerUp: (event: PointerEvent) => void
  /** Click-based fallback for keyboard/switch-access players (decision 2): toggles this payload
   * as "picked" without any pointer-drag gesture. A drop zone's `onClick` completes the move. */
  togglePick: () => void
}

/** A draggable item carrying `payload`. `getPayload` is a function (not a plain value) so the
 * caller can supply an always-current id even inside a `v-for` over reactive data. */
export function useDraggable<T>(getPayload: () => T): DraggableHandle {
  let pointerId: number | null = null
  let startX = 0
  let startY = 0
  let started = false

  function isMine(): boolean {
    return session.value !== null && session.value.payload === getPayload()
  }

  /**
   * Tracks the ghost's position once dragging is underway. Bound at
   * `window` level, not the origin card: pointer events are deliberately
   * uncaptured (see file header), so the moment the pointer moves off the
   * card it started on, the browser simply stops delivering `pointermove`
   * to that element - the ghost would freeze in place over the origin
   * instead of following the cursor to the drop target (a real bug, found
   * by actually dragging, not something a handler-level unit test alone
   * would catch). `onPointerMove` below only ever needs to detect the
   * initial threshold crossing; from then on, this is the sole position
   * source.
   */
  function onWindowPointerMove(event: PointerEvent): void {
    if (event.pointerId !== pointerId || !isMine()) return
    session.value = { ...session.value!, x: event.clientX, y: event.clientY }
  }

  function endDrag(): void {
    window.removeEventListener('pointermove', onWindowPointerMove)
    window.removeEventListener('pointerup', endDrag)
    window.removeEventListener('pointercancel', endDrag)
    // A no-op if a drop zone's own pointerup already resolved and cleared
    // the session - this only cancels an unhandled drop (released over
    // nothing, or somewhere with no matching zone).
    if (started && isMine()) session.value = null
    started = false
    pointerId = null
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    pointerId = event.pointerId
    startX = event.clientX
    startY = event.clientY
    started = false
  }

  function onPointerMove(event: PointerEvent): void {
    // Only detects the initial threshold crossing - once `started`, position
    // tracking moves to `onWindowPointerMove` above, so this returns early
    // rather than doing (now-redundant, and origin-bound) work.
    if (pointerId === null || event.pointerId !== pointerId || started) return
    const dx = event.clientX - startX
    const dy = event.clientY - startY
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
    started = true
    session.value = { payload: getPayload(), mode: 'drag', x: event.clientX, y: event.clientY }
    window.addEventListener('pointermove', onWindowPointerMove)
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', endDrag)
  }

  function onPointerUp(event: PointerEvent): void {
    // Real cleanup happens in endDrag (window-level, fires after any drop
    // zone's own target-phase handler) - this exists only so a plain click
    // that never left the draggable resets pointerId without waiting on it.
    if (!started && pointerId !== null && event.pointerId === pointerId) pointerId = null
  }

  return {
    isDragging: computed(() => started && isMine() && session.value?.mode === 'drag'),
    isPicked: computed(() => !started && isMine() && session.value?.mode === 'pick'),
    onPointerDown,
    onPointerMove,
    onPointerUp,
    togglePick(): void {
      if (isMine()) {
        session.value = null
      } else {
        session.value = { payload: getPayload(), mode: 'pick', x: 0, y: 0 }
      }
    },
  }
}

export interface DropZoneHandle {
  /** True while this specific zone should highlight as a drop target - for "valid drop targets
   * highlight, invalid ones don't" (Sprint 17 DoD). During a live pointer drag this means "the
   * pointer is actually over this zone right now" (bound via `onPointerEnter`/`onPointerLeave`),
   * not "every zone that would accept this payload somewhere on the page" - the latter lit up
   * every bay at once the moment a drag started, regardless of where the pointer was (found by
   * playtest). The click-based "pick" fallback has no pointer position to hover, so every
   * accepting zone still highlights in that mode - that's the whole point of the fallback. */
  isActiveTarget: ComputedRef<boolean>
  /** Bind on the zone's root element: resolves a live pointer-drag dropped here. */
  onPointerUp: () => void
  /** Bind on the zone's root element: marks the pointer as having entered this zone during a drag. */
  onPointerEnter: () => void
  /** Bind on the zone's root element: clears the hover flag set by `onPointerEnter`. */
  onPointerLeave: () => void
  /** Bind on the zone's root element: completes a "picked" session (the accessibility fallback). */
  onClick: () => void
}

/** A drop target accepting payloads of type `T`. `accepts` gates both the live-drag drop and the
 * click-fallback placement - one predicate, two trigger paths. */
export function useDropZone<T>(
  accepts: (payload: T) => boolean,
  onDrop: (payload: T) => void,
): DropZoneHandle {
  const isHovering = ref(false)

  function resolve(): void {
    if (!session.value) return
    const payload = session.value.payload as T
    if (!accepts(payload)) return
    onDrop(payload)
    session.value = null
    isHovering.value = false
  }

  return {
    isActiveTarget: computed(() => {
      if (!session.value || !accepts(session.value.payload as T)) return false
      // Pick mode has no pointer to hover - show every valid target. Drag mode only
      // highlights the zone the pointer is actually over right now.
      return session.value.mode === 'pick' || isHovering.value
    }),
    onPointerUp(): void {
      if (session.value?.mode === 'drag') resolve()
    },
    onPointerEnter(): void {
      if (session.value?.mode === 'drag') isHovering.value = true
    },
    onPointerLeave(): void {
      isHovering.value = false
    },
    onClick(): void {
      if (session.value?.mode === 'pick') resolve()
    },
  }
}

/** Test-only escape hatch: clears any in-progress drag/pick session between test cases, since
 * `session` is module-level state shared across every `useDraggable`/`useDropZone` instance. */
export function clearDragSession(): void {
  session.value = null
}
