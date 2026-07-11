import { describe, expect, it } from 'vitest'
import { clearDragSession, useDragSession, useDraggable } from '../composables/useDragAndDrop'
import { router } from './index'

describe('router (Sprint 24 fix 1)', () => {
  it('a navigation always clears any in-flight drag/pick session', async () => {
    useDraggable(() => 'some-part-id').togglePick()
    expect(useDragSession().value).not.toBeNull()

    await router.push({ name: 'garage' })
    expect(useDragSession().value).toBeNull()

    clearDragSession()
  })
})
