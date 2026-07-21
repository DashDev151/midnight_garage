import { mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import { DEMO_LOT_ID, isRoutedSymptom } from './inspectionDemo'
import InspectionDemoScreen from './InspectionDemoScreen.vue'

const mountedWrappers: VueWrapper[] = []

function mountScreen() {
  const wrapper = mount(InspectionDemoScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

async function pick(wrapper: VueWrapper, symptomId: string): Promise<void> {
  await wrapper.find(`[data-test="symptom-pick-${symptomId}"]`).trigger('click')
}

describe('InspectionDemoScreen', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  })

  it('mounts with the demo banner and lists every symptom in content, routed trees first', () => {
    const wrapper = mountScreen()
    const game = useGameStore()

    expect(wrapper.find('[data-test="demo-banner"]').text()).toBe(
      'Dev demo: nothing here is saved.',
    )

    const buttons = wrapper.findAll('[data-test^="symptom-pick-"]')
    expect(buttons.length).toBe(game.context.symptoms.length)

    // Once a non-routed symptom shows up, no routed symptom follows it - the
    // picker's whole point is putting the forked trees first.
    let sawNonRouted = false
    for (const symptom of game.context.symptoms.map((s) => s.id)) {
      const button = wrapper.find(`[data-test="symptom-pick-${symptom}"]`)
      expect(button.exists()).toBe(true)
    }
    const orderedIds = buttons.map((b) => b.attributes('data-test')!.replace('symptom-pick-', ''))
    for (const id of orderedIds) {
      const routed = isRoutedSymptom(game.context.symptomsById[id]!)
      if (!routed) sawNonRouted = true
      else expect(sawNonRouted).toBe(false)
    }

    // Each button's own label is the real cardLine, not a fabricated one.
    const first = game.context.symptoms[0]!
    expect(wrapper.find(`[data-test="symptom-pick-${first.id}"]`).text()).toBe(first.cardLine)

    // Nothing is picked yet.
    expect(wrapper.find('[data-test="prompt"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="est-value"]').exists()).toBe(false)
  })

  it('picking a symptom starts a visit at the full real minutes and shows the checklist', async () => {
    const wrapper = mountScreen()
    const game = useGameStore()
    const visitMinutes = game.context.economy.diagnosis.visitMinutes

    await pick(wrapper, 'smokes-on-startup')

    expect(wrapper.find('[data-test="prompt"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="minutes-left"]').text()).toContain(`${visitMinutes}m left`)
    expect(wrapper.find('[data-test="seed"]').text()).toBe('Seed #1')
    expect(wrapper.find(`[data-test="symptom-${DEMO_LOT_ID}"]`).exists()).toBe(true)
    expect(wrapper.find('[data-test="est-value"]').text()).toContain('Estimated market value:')
  })

  it('running a real test appends a breadcrumb whose text is the real result copy from content, and spends its real minutes', async () => {
    const wrapper = mountScreen()
    const game = useGameStore()
    const visitMinutes = game.context.economy.diagnosis.visitMinutes
    const testApplication = game.context.symptomsById['smokes-on-startup']!.tests.find(
      (t) => t.testId === 'cold-start-watch',
    )!
    const testMinutes = game.context.diagnosticTestsById['cold-start-watch']!.minutes

    await pick(wrapper, 'smokes-on-startup')
    await wrapper.find('[data-test$="-cold-start-watch"]').trigger('click')

    const breadcrumb = wrapper.find('[data-test="breadcrumb-cold-start-watch"]')
    expect(breadcrumb.exists()).toBe(true)
    const resultText = breadcrumb.find('.trail-result').text()
    expect(testApplication.resultCopy).toContain(resultText)

    expect(wrapper.find('[data-test="minutes-left"]').text()).toContain(
      `${visitMinutes - testMinutes}m left`,
    )
  })

  it('Reset (same roll) reproduces the identical true cause and clears the trail', async () => {
    const wrapper = mountScreen()

    await pick(wrapper, 'smokes-on-startup')
    await wrapper.find('[data-test="reveal-toggle"]').setValue(true)
    const before = wrapper.find('[data-test="reveal-answer"]').text()

    await wrapper.find('[data-test$="-cold-start-watch"]').trigger('click')
    expect(wrapper.find('[data-test="breadcrumb-cold-start-watch"]').exists()).toBe(true)

    await wrapper.find('[data-test="reset-roll"]').trigger('click')

    expect(wrapper.find('[data-test="breadcrumb-cold-start-watch"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="reveal-answer"]').text()).toBe(before)
  })

  it('Reroll eventually rolls a different true cause off a different seed', async () => {
    const wrapper = mountScreen()

    await pick(wrapper, 'smokes-on-startup')
    await wrapper.find('[data-test="reveal-toggle"]').setValue(true)
    const first = wrapper.find('[data-test="reveal-answer"]').text()

    let changed = false
    for (let i = 0; i < 30 && !changed; i++) {
      await wrapper.find('[data-test="reroll"]').trigger('click')
      if (wrapper.find('[data-test="reveal-answer"]').text() !== first) changed = true
    }

    expect(changed).toBe(true)
  })
})
