import { PARTS, STORY_MISSIONS, TUTORIAL_LOT, type GameState } from '@midnight-garage/content'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'
import TutorialOverlay from './TutorialOverlay.vue'

// The overlay reads `route.name` only to re-run the spotlight effect when the
// screen changes (anchoring itself is DOM-presence based now); a plain stub is
// enough and keeps the test off a full router install.
vi.mock('vue-router', () => ({ useRoute: () => ({ name: 'jobs' }) }))

const LOT = TUTORIAL_LOT
const FOUR_WHEELS = STORY_MISSIONS.find((m) => m.id === LOT.missionId)!

function ownScriptedCarWithBands(
  state: GameState,
  bands: Partial<Record<string, string>>,
): GameState {
  const lot = state.activeAuctionLots.find((l) => l.id === LOT.lotId)
  const car = lot?.car ?? state.ownedCars.find((c) => c.id === LOT.carId)
  if (!car) throw new Error('scripted car not found in test state')
  const parts = { ...car.parts }
  for (const [partId, band] of Object.entries(bands)) {
    const installed = parts[partId as keyof typeof parts].installed
    if (installed)
      parts[partId as keyof typeof parts] = { installed: { ...installed, band } as never }
  }
  return {
    ...state,
    ownedCars: [...state.ownedCars.filter((c) => c.id !== LOT.carId), { ...car, parts }],
    activeAuctionLots: state.activeAuctionLots.filter((l) => l.id !== LOT.lotId),
  }
}

/** Puts the scripted (already-owned) car into the first service bay slot. */
function scriptedCarIntoBay(state: GameState): GameState {
  const serviceBayCarIds = [...state.serviceBayCarIds]
  serviceBayCarIds[0] = LOT.carId
  return {
    ...state,
    serviceBayCarIds,
    parkingCarIds: state.parkingCarIds.map((id) => (id === LOT.carId ? null : id)),
  }
}

/** Marks the scripted lot's first symptom as having had `testId` run - the
 * fixture for the `testRun` condition kind. */
function runTestOnScriptedLot(state: GameState, testId: string): GameState {
  return {
    ...state,
    activeAuctionLots: state.activeAuctionLots.map((l) =>
      l.id === LOT.lotId
        ? {
            ...l,
            car: {
              ...l.car,
              symptoms: l.car.symptoms.map((s, i) =>
                i === 0 ? { ...s, runTestIds: [...s.runTestIds, testId] } : s,
              ),
            },
          }
        : l,
    ),
  }
}

/** Narrows the scripted lot's first symptom to a single remaining cause - the
 * fixture for the `lotInspected` condition kind (a completed yard visit). */
function inspectScriptedLot(state: GameState): GameState {
  return {
    ...state,
    activeAuctionLots: state.activeAuctionLots.map((l) =>
      l.id === LOT.lotId
        ? {
            ...l,
            car: {
              ...l.car,
              symptoms: l.car.symptoms.map((s, i) =>
                i === 0 ? { ...s, remainingCauseIds: s.remainingCauseIds.slice(0, 1) } : s,
              ),
            },
          }
        : l,
    ),
  }
}

describe('TutorialOverlay', () => {
  const wrappers: ReturnType<typeof mount>[] = []
  function render() {
    const wrapper = mount(TutorialOverlay)
    wrappers.push(wrapper)
    return wrapper
  }

  // Real DOM elements the spotlight effect can find via document.querySelector.
  const anchors: HTMLElement[] = []
  function addAnchor(testId: string): HTMLElement {
    const el = document.createElement('button')
    el.setAttribute('data-test', testId)
    document.body.appendChild(el)
    anchors.push(el)
    return el
  }

  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    for (const w of wrappers.splice(0)) w.unmount()
    for (const el of anchors.splice(0)) el.remove()
  })

  it('stays hidden for a non-tutorial career', () => {
    // The eager store init is a plain `createInitialGameState` (no tutorial).
    const wrapper = render()
    expect(wrapper.find('[data-test="tutorial-overlay"]').exists()).toBe(false)
  })

  it('opens on step 1 of 10 (welcome) with the Got it button for a fresh tutorial career', async () => {
    const game = useGameStore()
    game.newGame(1)
    const wrapper = render()
    await nextTick()

    expect(wrapper.find('[data-test="tutorial-overlay"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="tutorial-progress"]').text()).toContain('Step 1 of 10')
    expect(wrapper.text()).toContain('your own garage')
    expect(wrapper.find('[data-test="tutorial-got-it"]').exists()).toBe(true)
    // A freshly opened step is all new text: nothing dims (item 20, corrected).
    expect(wrapper.findAll('.tutorial-line.is-dim')).toHaveLength(0)
  })

  it('Got it advances to accept, persists the acknowledgement, and interpolates the payout', async () => {
    const game = useGameStore()
    game.newGame(2)
    const wrapper = render()
    await nextTick()

    await wrapper.find('[data-test="tutorial-got-it"]').trigger('click')
    await nextTick()

    expect(game.gameState.tutorialAcknowledgedSteps).toContain('welcome')
    expect(wrapper.find('[data-test="tutorial-progress"]').text()).toContain('Step 2 of 10')
    const text = wrapper.text()
    expect(text).toContain(formatYen(FOUR_WHEELS.payoutYen))
    expect(text).toContain('Accept the job when you are ready')
    // The Got it button belongs to acknowledged steps only.
    expect(wrapper.find('[data-test="tutorial-got-it"]').exists()).toBe(false)
  })

  it('accept completes on mission accept; ears-first reveals during the yard visit, then stethoscope after revs-and-listen runs', async () => {
    const game = useGameStore()
    game.newGame(3)
    game.acknowledgeTutorialStep('welcome')
    game.acceptMission(LOT.missionId)
    const wrapper = render()
    await nextTick()

    expect(wrapper.find('[data-test="tutorial-progress"]').text()).toContain('Step 3 of 10')
    expect(wrapper.text()).toContain('Local Yard')
    expect(wrapper.text()).not.toContain('Ears first, tools second')

    game.gameState = { ...game.gameState, inspectionVisit: { tier: LOT.tier, minutesLeft: 60 } }
    await nextTick()
    expect(wrapper.text()).toContain('Ears first, tools second')
    expect(wrapper.text()).not.toContain('A tidy tick, up top')

    // The stethoscope line only takes over once revs-and-listen is in
    // runTestIds; the ears-first line retires the moment it does.
    game.gameState = runTestOnScriptedLot(game.gameState, 'revs-and-listen')
    await nextTick()
    expect(wrapper.text()).toContain('A tidy tick, up top')
    expect(wrapper.text()).not.toContain('Ears first, tools second')
  })

  it('spotlights the stethoscope test button once revs-and-listen has run, not the auctions tab fallback', async () => {
    const game = useGameStore()
    game.newGame(4)
    game.acknowledgeTutorialStep('welcome')
    game.acceptMission(LOT.missionId)
    game.gameState = { ...game.gameState, inspectionVisit: { tier: LOT.tier, minutesLeft: 60 } }

    const revsAnchor = addAnchor('run-test-tutorial-lot-0-revs-and-listen')
    const navAuctions = addAnchor('nav-auctions')

    // Stands in for SymptomChecklist's real stethoscope button: absent from
    // the DOM until revs-and-listen is actually in runTestIds, so it mounts
    // in the very same reactive flush that retires the ears-first line -
    // unlike `addAnchor`'s statically pre-existing elements, this exercises
    // the DOM-mutation timing the real button goes through.
    const StethoscopeStub = defineComponent({
      name: 'StethoscopeStub',
      setup() {
        const store = useGameStore()
        const visible = computed(() => {
          const lot = store.gameState.activeAuctionLots.find((l) => l.id === LOT.lotId)
          return !!lot?.car.symptoms[0]?.runTestIds.includes('revs-and-listen')
        })
        return () =>
          visible.value ? h('button', { 'data-test': 'run-test-tutorial-lot-0-stethoscope' }) : null
      },
    })

    // Mounted after the overlay, same as the real screen content mounting
    // later in the tree than this app-level overlay.
    render()
    await nextTick()
    expect(revsAnchor.classList.contains('tutorial-spotlight')).toBe(true)

    const stubWrapper = mount(StethoscopeStub, { attachTo: document.body })
    wrappers.push(stubWrapper)
    await nextTick()

    game.gameState = runTestOnScriptedLot(game.gameState, 'revs-and-listen')
    await nextTick()

    const stethoscopeEl = document.querySelector(
      '[data-test="run-test-tutorial-lot-0-stethoscope"]',
    )
    expect(stethoscopeEl).not.toBeNull()
    expect(stethoscopeEl!.classList.contains('tutorial-spotlight')).toBe(true)
    expect(navAuctions.classList.contains('tutorial-spotlight')).toBe(false)
  })

  it('bid completes once the car is owned; bay completes once it reaches a service slot', async () => {
    const game = useGameStore()
    game.newGame(5)
    game.acknowledgeTutorialStep('welcome')
    game.acceptMission(LOT.missionId)
    game.gameState = ownScriptedCarWithBands(game.gameState, {})
    const wrapper = render()
    await nextTick()

    expect(wrapper.find('[data-test="tutorial-progress"]').text()).toContain('Step 5 of 10')
    expect(wrapper.find('[data-test="tutorial-yuki"]').text()).toContain('under all that dirt')
    expect(wrapper.text()).toContain('drag her across')

    game.gameState = scriptedCarIntoBay(game.gameState)
    await nextTick()
    expect(wrapper.find('[data-test="tutorial-progress"]').text()).toContain('Step 6 of 10')
  })

  it('walks wheel then engine then deliver as the work lands, revealing bench sub-state lines', async () => {
    const game = useGameStore()
    game.newGame(6)
    game.acknowledgeTutorialStep('welcome')
    game.acceptMission(LOT.missionId)
    game.gameState = scriptedCarIntoBay(ownScriptedCarWithBands(game.gameState, {}))
    const wrapper = render()
    await nextTick()

    // Wheel beat: base lines only until the wheels are on the bench, and a
    // freshly opened step dims nothing (item 20, corrected).
    expect(wrapper.text()).toContain('Her tyres are scrap')
    expect(wrapper.text()).not.toContain('Add to cart')
    expect(wrapper.text()).not.toContain('Tyres ordered')
    expect(wrapper.text()).not.toContain('four fresh tyres')
    expect(wrapper.findAll('.tutorial-line.is-dim')).toHaveLength(0)

    game.gameState = {
      ...game.gameState,
      assemblyInventory: [
        { id: 'bench-1', assemblyId: 'wheelAssembly', members: {}, sourceCarId: LOT.carId },
      ],
    }
    await nextTick()
    expect(wrapper.text()).toContain('Add to cart')
    // The newly revealed shop line is full strength; only the already-read
    // opener dims (item 20, corrected: dimming needs newer text below).
    const dimmed = wrapper.findAll('.tutorial-line.is-dim')
    expect(dimmed).toHaveLength(1)
    expect(dimmed[0]!.text()).toContain('Open her from the bay')
    expect(dimmed[0]!.text()).not.toContain('Add to cart')

    // A pending standard-delivery order addressed to tyres reveals the
    // "press End Day" waiting line.
    const tyrePart = PARTS.find((p) => p.carPartId === 'tyres' && p.fitmentClass === 'shitbox')!
    game.gameState = {
      ...game.gameState,
      pendingPartOrders: [
        {
          id: 'order-1',
          partId: tyrePart.id,
          priceYen: tyrePart.priceYen,
          purchasedOnDay: 1,
          arrivesOnDay: 2,
        },
      ],
    }
    await nextTick()
    expect(wrapper.text()).toContain('Tyres ordered')
    // The shop-trip line retires the moment the order exists (hideWhen) - the
    // box never ends on an errand already run.
    expect(wrapper.text()).not.toContain('Add to cart')

    // Delivery: the order clears, a non-scrap inventory part addressed to
    // tyres reveals the fit line and retires the waiting line.
    game.gameState = {
      ...game.gameState,
      pendingPartOrders: [],
      partInventory: [
        {
          id: 'test-tyres-1',
          partId: tyrePart.id,
          band: 'fine',
          genuinePeriod: false,
          origin: { kind: 'market', day: 1 },
        },
      ],
    }
    await nextTick()
    expect(wrapper.text()).not.toContain('Tyres ordered')
    expect(wrapper.text()).toContain('four fresh tyres')

    // Fitted into the benched assembly: the fit line retires with the emptied
    // shelf, and the refit beat takes over - this exact state previously read
    // "go shopping".
    game.gameState = {
      ...game.gameState,
      partInventory: [],
      assemblyInventory: [
        {
          id: 'bench-1',
          assemblyId: 'wheelAssembly',
          members: {
            tyres: {
              id: 'fitted-tyres',
              partId: tyrePart.id,
              band: 'mint',
              genuinePeriod: false,
              origin: { kind: 'market', day: 1 },
            },
          },
          sourceCarId: LOT.carId,
        },
      ],
    }
    await nextTick()
    expect(wrapper.text()).toContain('Fresh rubber on')
    expect(wrapper.text()).not.toContain('four fresh tyres')
    expect(wrapper.text()).not.toContain('Add to cart')

    // Fresh tyres fitted -> engine beat, with {part} resolved.
    game.gameState = ownScriptedCarWithBands(game.gameState, { tyres: 'mint' })
    await nextTick()
    const engineText = wrapper.text()
    expect(engineText).toContain('Now for that tick')
    expect(engineText).toContain('Head')
    expect(engineText).not.toContain('{part}')

    // Head/valvetrain repaired on a whole car -> reassemble auto-completes,
    // so the machine lands on the deliver beat.
    game.gameState = ownScriptedCarWithBands(game.gameState, {
      tyres: 'mint',
      headValvetrain: 'worn',
    })
    await nextTick()
    expect(wrapper.find('[data-test="tutorial-progress"]').text()).toContain('Step 9 of 10')
    expect(wrapper.text()).toContain('press Show them the car')
  })

  it('holds on the reassemble step while a part is missing, and releases once the car is whole', async () => {
    const game = useGameStore()
    game.newGame(12)
    game.acknowledgeTutorialStep('welcome')
    game.acceptMission(LOT.missionId)
    const whole = scriptedCarIntoBay(
      ownScriptedCarWithBands(game.gameState, { tyres: 'mint', headValvetrain: 'worn' }),
    )
    // The engine blockers are off the car (in inventory) - the head reads fine
    // but the car is not whole, so delivery must NOT be offered yet.
    game.gameState = {
      ...whole,
      ownedCars: whole.ownedCars.map((c) =>
        c.id === LOT.carId ? { ...c, parts: { ...c.parts, cooling: { installed: null } } } : c,
      ),
    }
    const wrapper = render()
    await nextTick()

    expect(wrapper.find('[data-test="tutorial-progress"]').text()).toContain('Step 8 of 10')
    expect(wrapper.text()).toContain('still on your shelf')
    expect(wrapper.text()).not.toContain('press Show them the car')

    game.gameState = whole
    await nextTick()
    expect(wrapper.find('[data-test="tutorial-progress"]').text()).toContain('Step 9 of 10')
  })

  it('spotlights the last visible anchored line, following the wheel beat onto the bench', async () => {
    const game = useGameStore()
    game.newGame(7)
    game.acknowledgeTutorialStep('welcome')
    game.acceptMission(LOT.missionId)
    game.gameState = scriptedCarIntoBay(ownScriptedCarWithBands(game.gameState, {}))
    const stepAnchor = addAnchor('remove-assembly-wheelAssembly')
    const heroWheels = addAnchor('hero-wheels')
    const navParts = addAnchor('nav-parts')
    const endDayAnchor = addAnchor('end-day')
    render()
    await nextTick()

    // No bench sub-state yet: the step's own anchor holds the spotlight.
    expect(stepAnchor.classList.contains('tutorial-spotlight')).toBe(true)
    expect(heroWheels.classList.contains('tutorial-spotlight')).toBe(false)

    // Benching the wheels reveals the shop-trip line, whose anchor is a CHAIN
    // (slot card, department card, nav tab) - the deepest present wins: the
    // slot card is absent here, so the department card takes the spotlight
    // over the also-present nav tab.
    game.gameState = {
      ...game.gameState,
      assemblyInventory: [
        { id: 'bench-1', assemblyId: 'wheelAssembly', members: {}, sourceCarId: LOT.carId },
      ],
    }
    await nextTick()
    expect(heroWheels.classList.contains('tutorial-spotlight')).toBe(true)
    expect(navParts.classList.contains('tutorial-spotlight')).toBe(false)
    expect(stepAnchor.classList.contains('tutorial-spotlight')).toBe(false)

    // A pending tyre order reveals the "press End Day" line, whose anchor
    // (being the last visible anchored line) takes the spotlight over.
    const tyrePart = PARTS.find((p) => p.carPartId === 'tyres' && p.fitmentClass === 'shitbox')!
    game.gameState = {
      ...game.gameState,
      pendingPartOrders: [
        {
          id: 'order-1',
          partId: tyrePart.id,
          priceYen: tyrePart.priceYen,
          purchasedOnDay: 1,
          arrivesOnDay: 2,
        },
      ],
    }
    await nextTick()
    expect(endDayAnchor.classList.contains('tutorial-spotlight')).toBe(true)
    expect(heroWheels.classList.contains('tutorial-spotlight')).toBe(false)
  })

  it('falls back to the nav tab when the step control is absent from the DOM', async () => {
    const game = useGameStore()
    game.newGame(8)
    // Welcome step anchors `day-value` (garage) - not in the DOM here, so the
    // spotlight lands on the garage tab instead.
    const navGarage = addAnchor('nav-garage')
    render()
    await nextTick()

    expect(navGarage.classList.contains('tutorial-spotlight')).toBe(true)
  })

  it('shows the terminal sign-off after delivery and finishes cleanly', async () => {
    const game = useGameStore()
    game.newGame(9)
    game.acceptMission(LOT.missionId)
    // Mark the mission delivered and clear the (now-handed-over) car.
    const s = game.gameState
    game.gameState = {
      ...s,
      ownedCars: s.ownedCars.filter((c) => c.id !== LOT.carId),
      activeAuctionLots: s.activeAuctionLots.filter((l) => l.id !== LOT.lotId),
      storyMissions: s.storyMissions.map((r) =>
        r.missionId === LOT.missionId ? { ...r, status: 'delivered' as const } : r,
      ),
    }
    const wrapper = render()
    await nextTick()

    expect(wrapper.text()).toContain('That is the walkthrough done')
    expect(wrapper.find('[data-test="tutorial-progress"]').exists()).toBe(false)

    await wrapper.find('[data-test="tutorial-finish"]').trigger('click')
    await nextTick()
    expect(game.gameState.tutorialStatus).toBe('done')
    expect(wrapper.find('[data-test="tutorial-overlay"]').exists()).toBe(false)
  })

  it('skips permanently on confirm, leaving the mission in place', async () => {
    const game = useGameStore()
    game.newGame(10)
    const wrapper = render()
    await nextTick()

    await wrapper.find('[data-test="tutorial-skip"]').trigger('click')
    await nextTick()
    await wrapper.find('[data-test="tutorial-skip-confirm-yes"]').trigger('click')
    await nextTick()

    expect(game.gameState.tutorialStatus).toBe('skipped')
    expect(wrapper.find('[data-test="tutorial-overlay"]').exists()).toBe(false)
    // The mission is untouched by the skip - it demotes to a normal mission.
    expect(game.gameState.storyMissions.some((r) => r.missionId === LOT.missionId)).toBe(true)
  })

  it('drags by the header and pins the box at the dragged viewport position', async () => {
    const game = useGameStore()
    game.newGame(11)
    const wrapper = render()
    await nextTick()

    await wrapper.find('.tutorial-head').trigger('pointerdown', { clientX: 40, clientY: 30 })
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 140, clientY: 90 }))
    await nextTick()

    const overlay = wrapper.find('[data-test="tutorial-overlay"]').element as HTMLElement
    expect(overlay.style.left).toBe('100px')
    expect(overlay.style.top).toBe('60px')

    // After pointerup the box stays put; further moves change nothing.
    window.dispatchEvent(new MouseEvent('pointerup'))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 500, clientY: 400 }))
    await nextTick()
    expect(overlay.style.left).toBe('100px')
    expect(overlay.style.top).toBe('60px')
  })

  it('applies the find step panelPosition hint, and reverts once the next step has none', async () => {
    const game = useGameStore()
    game.newGame(13)
    game.acknowledgeTutorialStep('welcome')
    game.acceptMission(LOT.missionId)
    const wrapper = render()
    await nextTick()

    expect(wrapper.find('[data-test="tutorial-progress"]').text()).toContain('Step 3 of 10')
    expect(wrapper.find('[data-test="tutorial-overlay"]').classes()).toContain(
      'tutorial-pos-bottom-right',
    )

    game.gameState = inspectScriptedLot(game.gameState)
    await nextTick()

    expect(wrapper.find('[data-test="tutorial-progress"]').text()).toContain('Step 4 of 10')
    expect(wrapper.find('[data-test="tutorial-overlay"]').classes()).not.toContain(
      'tutorial-pos-bottom-right',
    )
    expect(wrapper.find('[data-test="tutorial-overlay"]').classes()).not.toContain(
      'tutorial-pos-right',
    )
  })
})
