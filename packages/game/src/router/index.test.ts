import { describe, expect, it } from 'vitest'
import { clearDragSession, useDragSession, useDraggable } from '../composables/useDragAndDrop'
import { router } from './index'

describe('router (Sprint 24 fix 1)', () => {
  // Generous timeout: the push awaits GarageScreen's lazy chunk, and under
  // coverage instrumentation that import alone can blow through the 5s
  // default.
  it(
    'a navigation always clears any in-flight drag/pick session',
    { timeout: 30_000 },
    async () => {
      useDraggable(() => 'some-part-id').togglePick()
      expect(useDragSession().value).not.toBeNull()

      await router.push({ name: 'garage' })
      expect(useDragSession().value).toBeNull()

      clearDragSession()
    },
  )
})
