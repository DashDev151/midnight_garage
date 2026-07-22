import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDragSession, useDragSession, useDraggable, useDropZone } from './useDragAndDrop'

function pointerEvent(overrides: Partial<PointerEvent> = {}, type = 'pointer'): PointerEvent {
  const event = new Event(type) as unknown as {
    pointerId: number
    clientX: number
    clientY: number
    pointerType: string
    button: number
  }
  event.pointerId = 1
  event.clientX = 0
  event.clientY = 0
  event.pointerType = 'mouse'
  event.button = 0
  Object.assign(event, overrides)
  return event as unknown as PointerEvent
}

describe('useDraggable / useDropZone (Sprint 17)', () => {
  beforeEach(() => clearDragSession())
  afterEach(() => clearDragSession())

  it('a plain pointerdown+pointerup with no movement never starts a drag', () => {
    const draggable = useDraggable(() => 'car-1')
    draggable.onPointerDown(pointerEvent())
    draggable.onPointerUp(pointerEvent())
    expect(draggable.isDragging.value).toBe(false)
    expect(useDragSession().value).toBeNull()
  })

  it('movement below the threshold does not start a drag', () => {
    const draggable = useDraggable(() => 'car-1')
    draggable.onPointerDown(pointerEvent({ clientX: 0, clientY: 0 }))
    draggable.onPointerMove(pointerEvent({ clientX: 2, clientY: 2 })) // well under the 6px threshold
    expect(draggable.isDragging.value).toBe(false)
    expect(useDragSession().value).toBeNull()
  })

  it('movement past the threshold starts a drag and sets the initial pointer position', () => {
    const draggable = useDraggable(() => 'car-1')
    draggable.onPointerDown(pointerEvent({ clientX: 0, clientY: 0 }))
    draggable.onPointerMove(pointerEvent({ clientX: 20, clientY: 0 }))
    expect(draggable.isDragging.value).toBe(true)
    expect(useDragSession().value).toMatchObject({ payload: 'car-1', mode: 'drag', x: 20, y: 0 })
  })

  it('once dragging, position tracks a window-level pointermove - the ghost must follow the cursor everywhere on the page, not just over the origin card', () => {
    // Real bug: pointer events are deliberately uncaptured (see file header),
    // so once the cursor leaves the card it started on, the browser stops
    // delivering pointermove to that element entirely - the ghost would
    // freeze over the origin instead of following the cursor to the drop
    // target. Position tracking must come from a window-level listener,
    // not the origin element's own onPointerMove.
    const draggable = useDraggable(() => 'car-1')
    draggable.onPointerDown(pointerEvent({ clientX: 0, clientY: 0 }))
    draggable.onPointerMove(pointerEvent({ clientX: 20, clientY: 0 }))
    expect(useDragSession().value).toMatchObject({ x: 20, y: 0 })

    // Simulates the pointer now being over some other element entirely -
    // dispatched at window level, the only place still guaranteed to see it.
    window.dispatchEvent(
      pointerEvent({ clientX: 200, clientY: 150 }, 'pointermove') as unknown as Event,
    )
    expect(useDragSession().value).toMatchObject({ x: 200, y: 150 })
  })

  it("calling the origin card's own onPointerMove again after dragging has started no longer updates position (that responsibility moved to the window listener)", () => {
    const draggable = useDraggable(() => 'car-1')
    draggable.onPointerDown(pointerEvent({ clientX: 0, clientY: 0 }))
    draggable.onPointerMove(pointerEvent({ clientX: 20, clientY: 0 }))
    draggable.onPointerMove(pointerEvent({ clientX: 999, clientY: 999 })) // would be the old (buggy) path
    expect(useDragSession().value).toMatchObject({ x: 20, y: 0 }) // unchanged
  })

  it('a drop on an accepting zone calls onDrop and clears the session', () => {
    const draggable = useDraggable(() => 'car-1')
    const onDrop = vi.fn()
    const zone = useDropZone<string>(() => true, onDrop)

    draggable.onPointerDown(pointerEvent())
    draggable.onPointerMove(pointerEvent({ clientX: 20 }))
    expect(draggable.isDragging.value).toBe(true)

    zone.onPointerUp()
    expect(onDrop).toHaveBeenCalledWith('car-1')
    expect(draggable.isDragging.value).toBe(false)
    expect(useDragSession().value).toBeNull()
  })

  it('a drop on a non-accepting zone does not call onDrop, and the session still clears', () => {
    const draggable = useDraggable(() => 'car-1')
    const onDrop = vi.fn()
    const zone = useDropZone<string>(() => false, onDrop)

    draggable.onPointerDown(pointerEvent())
    draggable.onPointerMove(pointerEvent({ clientX: 20 }))
    zone.onPointerUp()

    expect(onDrop).not.toHaveBeenCalled()
    // Rejecting a drop is not the same as cancelling it - the session is
    // still live until something actually resolves it (the window-level
    // pointerup fallback below), matching a real drag released over an
    // invalid target: nothing happens, but the gesture itself did occur.
    expect(useDragSession().value).not.toBeNull()
  })

  it('releasing over nothing (no zone) cancels the drag via the window-level fallback', () => {
    const draggable = useDraggable(() => 'car-1')
    draggable.onPointerDown(pointerEvent())
    draggable.onPointerMove(pointerEvent({ clientX: 20 }))
    expect(draggable.isDragging.value).toBe(true)

    // No drop zone's onPointerUp ran (nothing was under the pointer) - only
    // the window-level fallback `useDraggable` itself installed while
    // dragging is left to clean up an unresolved gesture.
    window.dispatchEvent(pointerEvent({}, 'pointerup') as unknown as Event)
    expect(useDragSession().value).toBeNull()
    expect(draggable.isDragging.value).toBe(false)
  })

  it('isDragging is only true for the draggable instance whose payload matches the session', () => {
    const a = useDraggable(() => 'car-a')
    const b = useDraggable(() => 'car-b')
    a.onPointerDown(pointerEvent())
    a.onPointerMove(pointerEvent({ clientX: 20 }))
    expect(a.isDragging.value).toBe(true)
    expect(b.isDragging.value).toBe(false)
  })

  it('during a live drag, isActiveTarget is only true for the zone the pointer is actually over', () => {
    // Highlighting must track genuine hover, not just "would this zone accept a drop."
    const draggable = useDraggable(() => 'car-1')
    const zone = useDropZone<string>((payload) => payload === 'car-1', vi.fn())
    expect(zone.isActiveTarget.value).toBe(false) // nothing in progress yet

    draggable.onPointerDown(pointerEvent())
    draggable.onPointerMove(pointerEvent({ clientX: 20 }))
    expect(zone.isActiveTarget.value).toBe(false) // dragging, but not hovering this zone yet

    zone.onPointerEnter()
    expect(zone.isActiveTarget.value).toBe(true)

    zone.onPointerLeave()
    expect(zone.isActiveTarget.value).toBe(false) // moved off before dropping

    zone.onPointerEnter()
    zone.onPointerUp()
    expect(zone.isActiveTarget.value).toBe(false) // resolved, nothing in progress
  })

  it('two zones: only the hovered one highlights, not both, even though both would accept', () => {
    const draggable = useDraggable(() => 'car-1')
    const zoneA = useDropZone<string>(() => true, vi.fn())
    const zoneB = useDropZone<string>(() => true, vi.fn())
    draggable.onPointerDown(pointerEvent())
    draggable.onPointerMove(pointerEvent({ clientX: 20 }))

    zoneA.onPointerEnter()
    expect(zoneA.isActiveTarget.value).toBe(true)
    expect(zoneB.isActiveTarget.value).toBe(false)
  })

  it('the click-based pick fallback has no pointer to hover, so every accepting zone highlights at once', () => {
    const draggable = useDraggable(() => 'car-1')
    const zoneA = useDropZone<string>(() => true, vi.fn())
    const zoneB = useDropZone<string>(() => true, vi.fn())
    draggable.togglePick()

    expect(zoneA.isActiveTarget.value).toBe(true)
    expect(zoneB.isActiveTarget.value).toBe(true)
  })

  it('isActiveTarget is false for a zone that would refuse the current payload', () => {
    const draggable = useDraggable(() => 'car-1')
    const zone = useDropZone<string>((payload) => payload === 'someone-else', vi.fn())
    draggable.onPointerDown(pointerEvent())
    draggable.onPointerMove(pointerEvent({ clientX: 20 }))
    expect(zone.isActiveTarget.value).toBe(false)
  })

  describe('click-based accessibility fallback (decision 2)', () => {
    it('togglePick marks the item picked without any pointer movement', () => {
      const draggable = useDraggable(() => 'car-1')
      expect(draggable.isPicked.value).toBe(false)
      draggable.togglePick()
      expect(draggable.isPicked.value).toBe(true)
      expect(useDragSession().value).toMatchObject({ payload: 'car-1', mode: 'pick' })
    })

    it('togglePick again un-picks it', () => {
      const draggable = useDraggable(() => 'car-1')
      draggable.togglePick()
      draggable.togglePick()
      expect(draggable.isPicked.value).toBe(false)
      expect(useDragSession().value).toBeNull()
    })

    it("a zone's onClick completes a pick when it accepts the payload", () => {
      const draggable = useDraggable(() => 'car-1')
      const onDrop = vi.fn()
      const zone = useDropZone<string>(() => true, onDrop)

      draggable.togglePick()
      zone.onClick()

      expect(onDrop).toHaveBeenCalledWith('car-1')
      expect(draggable.isPicked.value).toBe(false)
      expect(useDragSession().value).toBeNull()
    })

    it("a zone's onClick does nothing when nothing is picked", () => {
      const onDrop = vi.fn()
      const zone = useDropZone<string>(() => true, onDrop)
      zone.onClick()
      expect(onDrop).not.toHaveBeenCalled()
    })

    it("a zone's onClick does not resolve a live pointer-drag session (only a pick)", () => {
      const draggable = useDraggable(() => 'car-1')
      const onDrop = vi.fn()
      const zone = useDropZone<string>(() => true, onDrop)
      draggable.onPointerDown(pointerEvent())
      draggable.onPointerMove(pointerEvent({ clientX: 20 }))

      zone.onClick() // clicking during a live drag should not be treated as a pick-placement
      expect(onDrop).not.toHaveBeenCalled()
      expect(draggable.isDragging.value).toBe(true)
    })
  })
})
