import { describe, expect, it } from 'vitest'
import { TutorialStepSchema } from '../src'

const baseStep = {
  id: 'test-step',
  anchorScreen: 'garage',
  anchorTestId: 'day-value',
  lines: [{ speaker: 'instruction', text: 'Placeholder line.' }],
  completion: { kind: 'never' },
}

describe('TutorialStepSchema panelPosition', () => {
  it('accepts a step with no panelPosition', () => {
    expect(TutorialStepSchema.safeParse(baseStep).success).toBe(true)
  })

  it.each(['default', 'right', 'bottom-right'] as const)(
    'accepts panelPosition "%s"',
    (panelPosition) => {
      expect(TutorialStepSchema.safeParse({ ...baseStep, panelPosition }).success).toBe(true)
    },
  )

  it('rejects an unrecognised panelPosition value', () => {
    expect(TutorialStepSchema.safeParse({ ...baseStep, panelPosition: 'top-left' }).success).toBe(
      false,
    )
  })
})

describe('TutorialStepSchema anchorTestId (item 1 hotfix: an anchorless step)', () => {
  it('accepts a step with anchorTestId omitted entirely', () => {
    const anchorless: Record<string, unknown> = { ...baseStep }
    delete anchorless.anchorTestId
    expect(TutorialStepSchema.safeParse(anchorless).success).toBe(true)
  })

  it('accepts a step with anchorTestId explicitly null', () => {
    expect(TutorialStepSchema.safeParse({ ...baseStep, anchorTestId: null }).success).toBe(true)
  })

  it('still rejects an empty-string anchorTestId', () => {
    expect(TutorialStepSchema.safeParse({ ...baseStep, anchorTestId: '' }).success).toBe(false)
  })
})
