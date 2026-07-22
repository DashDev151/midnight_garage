import { describe, expect, it } from 'vitest'
import { clearDragSession, useDragSession, useDraggable } from '../composables/useDragAndDrop'
import { router } from './index'

describe('router (Sprint 24 fix 1)', () => {
  it('a navigation always clears any in-flight drag/pick session', async () => {
    // The initial navigation lands on '/' (garage), so settle it and move
    // elsewhere first: the assertion needs the later push to be a REAL
    // navigation, and a push to the current route fires no guard.
    await router.isReady()
    await router.push({ name: 'auctions' })

    useDraggable(() => 'some-part-id').togglePick()
    expect(useDragSession().value).not.toBeNull()

    await router.push({ name: 'garage' })
    expect(useDragSession().value).toBeNull()

    clearDragSession()
  })
})
