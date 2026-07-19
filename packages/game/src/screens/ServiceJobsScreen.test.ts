import { ALL_CAR_PART_IDS, CARS } from '@midnight-garage/content'
import { mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import ServiceJobsScreen from './ServiceJobsScreen.vue'

// Sprint 82 decision 7 (Pinia multi-mount isolation): track every mounted
// wrapper and unmount it after each test, so a component left mounted from a
// prior test cannot leak its store's pinia into the next (see App/CarDetailScreen).
const mountedWrappers: VueWrapper[] = []

function mountScreen() {
  const wrapper = mount(ServiceJobsScreen, { global: { stubs: { RouterLink: RouterLinkStub } } })
  mountedWrappers.push(wrapper)
  return wrapper
}

/** Sprint 95 (the radial-offer gate): a fresh career's board is Yuki-only
 * while the tutorial runs, so every test exercising the radial board skips
 * the walkthrough first - the gate lifts at the next generation point, hence
 * the bounded End Day loop. Yuki's mission itself survives a skip, so the
 * mission tests below are unaffected. */
function warpToOffers(game: ReturnType<typeof useGameStore>) {
  game.skipTutorial()
  for (let i = 0; i < 20 && game.serviceJobOffers.length === 0; i++) game.endDay()
}

/** Clears the first day-1 gate and accepts `four-wheels` (`gateReputationPoints: 0`, the
 * campaign's own opening mission) - the standing fixture every deliver-flow test below builds
 * on. */
function acceptFirstMission(game: ReturnType<typeof useGameStore>): string {
  game.endDay()
  const offer = game.storyMissionOfferView
  if (!offer) throw new Error('expected a story mission offered after the first End Day')
  game.acceptMission(offer.id)
  return offer.id
}

/** Grants a real, schema-valid car (`devGrantCar` - the same dev-grant path
 * every other game-package test uses to get an owned `CarInstance`) then
 * bumps every one of its 29 slots to `mint` band, keeping whatever real
 * catalog part id `devGrantCar` rolled (synthesising a fresh stock instance
 * for any slot it happened to roll missing) - trivially clears `four-wheels`'s
 * `roadworthy` requirement regardless of the RNG draw. */
function grantRoadworthyCar(game: ReturnType<typeof useGameStore>): string {
  game.devGrantCar(CARS[0]!.id)
  const car = game.gameState.ownedCars[game.gameState.ownedCars.length - 1]!
  const mintParts = Object.fromEntries(
    ALL_CAR_PART_IDS.map((partId) => {
      const installed = car.parts[partId].installed
      return [
        partId,
        {
          installed: installed
            ? { ...installed, band: 'mint' as const }
            : {
                id: `test-mint-${partId}`,
                partId: `stock-${partId}`,
                band: 'mint' as const,
                genuinePeriod: false,
                origin: { kind: 'market' as const, day: 1 },
              },
        },
      ]
    }),
  ) as typeof car.parts
  game.gameState = {
    ...game.gameState,
    ownedCars: game.gameState.ownedCars.map((c) =>
      c.id === car.id ? { ...c, parts: mintParts } : c,
    ),
  }
  return car.id
}

describe('ServiceJobsScreen', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  })

  /**
   * Sprint 95 (directive 17 case (a)): this used to pin day-1 offers (Sprint
   * 10's "no empty first day"). A fresh tutorial career now deliberately
   * opens Yuki-only, so the correct behaviour is offers rendering once the
   * gate lifts - the offers themselves are obtained legitimately post-skip.
   */
  it('shows the job board with offers on it once the tutorial gate lifts (Sprint 95)', () => {
    const game = useGameStore()
    game.newGame(1)
    warpToOffers(game)
    expect(game.serviceJobOffers.length).toBeGreaterThan(0)
    const wrapper = mountScreen()
    expect(wrapper.text()).not.toContain('No jobs on the board')
    expect(wrapper.findAll('.offer').length).toBe(game.serviceJobOffers.length)
  })

  it('accepting a job brings the car into the shop instantly (Sprint 11)', async () => {
    const game = useGameStore()
    game.newGame(1)
    // Sprint 36: nothing gates acceptance at tier 1 - every shipped template
    // defaults to minToolTier 1.
    warpToOffers(game)
    const offer = game.serviceJobOffers[0]
    if (!offer) throw new Error('expected an offer on the board')
    const wrapper = mountScreen()
    await wrapper.find(`[data-test="accept-${offer.id}"]`).trigger('click')
    expect(game.activeServiceJobs.some((j) => j.id === offer.id)).toBe(true)
    expect(game.serviceJobOffers.some((o) => o.id === offer.id)).toBe(false)
  })

  /**
   * Sprint 67 decision 7 (playtest item 12): an in-transit job STILL shows
   * what the customer asked for. The list used to be hidden behind
   * `v-if="!job.inTransit"` here and skipped entirely on the car page, so the
   * one thing a player needs in order to go and buy parts before the car lands
   * was unreadable on both screens at once.
   */
  it('shows an in-transit job\'s task list, not just "car arriving tomorrow"', () => {
    const game = useGameStore()
    game.newGame(1)
    warpToOffers(game)
    const offer = game.serviceJobOffers[0]
    if (!offer) throw new Error('expected an offer on the board')
    const taskLabels = game.serviceJobOfferViews
      .find((o) => o.id === offer.id)!
      .tasks.map((t) => t.label)
    expect(taskLabels.length).toBeGreaterThan(0)
    game.acceptServiceJob(offer.id)
    expect(game.activeServiceJobs.find((j) => j.id === offer.id)!.arrivesOnDay).not.toBeNull()

    const wrapper = mountScreen()
    const inShop = wrapper.find('.active')
    expect(inShop.text()).toContain('car arriving tomorrow')
    for (const label of taskLabels) expect(inShop.text()).toContain(label)
  })

  /**
   * Sprint 40 item 2: the board must never read "work done - hand back" (or
   * even "work outstanding") while the customer's car is still in transit -
   * only "car arriving tomorrow." Board gating keys off `inTransit`, not
   * `workDone` alone (the pre-fix bug: a rolled car could vacuously satisfy
   * a task before it ever arrived).
   */
  it('shows "car arriving tomorrow" for an in-transit job; the normal work-state line only appears once it arrives', async () => {
    const game = useGameStore()
    game.newGame(1)
    warpToOffers(game)
    const offer = game.serviceJobOffers[0]
    if (!offer) throw new Error('expected an offer on the board')
    game.acceptServiceJob(offer.id)
    const job = game.activeServiceJobs.find((j) => j.id === offer.id)!
    expect(job.arrivesOnDay).not.toBeNull() // still in transit

    const wrapper = mountScreen()
    expect(wrapper.text()).toContain('car arriving tomorrow')
    expect(wrapper.text()).not.toContain('work done - hand back')
    expect(wrapper.text()).not.toContain('work outstanding')

    // Once it arrives, the normal work-state line takes over.
    game.endDay()
    const wrapperAfterArrival = mountScreen()
    expect(wrapperAfterArrival.text()).not.toContain('car arriving tomorrow')
    const hasWorkStateLine =
      wrapperAfterArrival.text().includes('work done - hand back') ||
      wrapperAfterArrival.text().includes('work outstanding')
    expect(hasWorkStateLine).toBe(true)
  })

  it('an offer one tool tier short disables Accept, with the upgrade hint as its tooltip (Sprint 36)', () => {
    const game = useGameStore()
    game.newGame(1)
    warpToOffers(game)
    const offer = game.gameState.serviceJobOffers[0]
    if (!offer) throw new Error('expected an offer on the board')
    // Raise every task's tier ceiling one above the shop's all-tier-1 start -
    // the shipped content is all-default-1, so a deficit has to be injected.
    game.gameState = {
      ...game.gameState,
      serviceJobOffers: game.gameState.serviceJobOffers.map((o) =>
        o.id === offer.id
          ? { ...o, tasks: o.tasks.map((t) => ({ ...t, minToolTier: 2 as const })) }
          : o,
      ),
    }
    const wrapper = mountScreen()
    const button = wrapper.get(`[data-test="accept-${offer.id}"]`)
    expect((button.element as HTMLButtonElement).disabled).toBe(true)
    expect(button.attributes('title')).toContain('needs')
  })

  /**
   * Sprint 57 decision 1: completion moves to this screen - one place to
   * accept, one and the same place to complete. Clicking the button here
   * (not the car page, which no longer offers it) resolves the job.
   */
  it('completes (or gives up) a job right from this screen, once the car has arrived', async () => {
    const game = useGameStore()
    game.newGame(1)
    warpToOffers(game)
    const offer = game.serviceJobOffers[0]
    if (!offer) throw new Error('expected an offer on the board')
    game.acceptServiceJob(offer.id)
    game.endDay() // the customer's car actually arrives

    const wrapper = mountScreen()
    expect(wrapper.find('[data-test="complete-service-job"]').exists()).toBe(true)
    await wrapper.find('[data-test="complete-service-job"]').trigger('click')
    // No real work was done, so this reads as "Give Up Job" - the job
    // resolves (fails) and leaves the active list either way.
    expect(game.activeServiceJobs.some((j) => j.id === offer.id)).toBe(false)
    expect(game.lastJobResult?.outcome).toBe('failed')
  })

  it('the rep figure links to the Standing screen (Sprint 62 item 17)', () => {
    const game = useGameStore()
    game.newGame(1)
    const wrapper = mountScreen()
    const link = wrapper
      .findAllComponents(RouterLinkStub)
      .find((c) => c.attributes('data-test') === 'standing-link')
    expect(link).toBeDefined()
    expect(link!.props('to')).toEqual({ name: 'standing' })
  })

  it('shows a fitment-class chip on each offer card (Sprint 61 item 15)', () => {
    const game = useGameStore()
    game.newGame(1)
    // Sprint 95 (directive 17 case (a)): day-1 offers are gated on a tutorial
    // career now, so the offer is obtained post-skip instead.
    warpToOffers(game)
    const offer = game.serviceJobOfferViews[0]
    if (!offer) throw new Error('expected an offer on the board')
    expect(offer.fitmentClass).not.toBeNull()
    const wrapper = mountScreen()
    const chip = wrapper.find(`[data-test="class-${offer.id}"]`)
    expect(chip.exists()).toBe(true)
    // Renders the class display name (e.g. "Kei & Compact"), not the raw enum.
    expect(chip.text()).toBe(game.fitmentClassLabel(offer.fitmentClass!))
    expect(chip.text()).not.toBe(offer.fitmentClass)
  })

  /**
   * Sprint 89 (Yuki teaches you the game): a fresh career now pins Yuki's
   * `four-wheels` mission on day 1 - `newGame` runs `installTutorial`, which
   * offers the gate-0 mission through the ordinary story-mission machine so the
   * guided tutorial's very first beat has a card to point at. (A raw
   * `createInitialGameState`, used by bots/probes, still seeds no mission; only
   * the player-career path installs the tutorial.)
   */
  it('pins Yuki’s mission on day 1 for a fresh tutorial career', () => {
    const game = useGameStore()
    game.newGame(1)
    expect(game.storyMissionOfferView).not.toBeNull()
    expect(game.storyMissionOfferView!.id).toBe('four-wheels')
    const wrapper = mountScreen()
    expect(wrapper.find('[data-test="mission-accept"]').exists()).toBe(true)
  })

  it('shows the pinned story-mission card once the first mission clears its gate', () => {
    const game = useGameStore()
    game.newGame(1)
    game.endDay()
    const offer = game.storyMissionOfferView
    if (!offer) throw new Error('expected a story mission offered after the first End Day')
    const wrapper = mountScreen()
    expect(wrapper.text()).toContain('STORY')
    expect(wrapper.text()).toContain(offer.personaName)
    expect(wrapper.text()).toContain(offer.title)
    expect(wrapper.find('[data-test="mission-accept"]').exists()).toBe(true)
  })

  it('accepting the pinned mission moves it from the offer card to the active summary row', async () => {
    const game = useGameStore()
    game.newGame(1)
    game.endDay()
    const offer = game.storyMissionOfferView
    if (!offer) throw new Error('expected a story mission offered after the first End Day')
    const wrapper = mountScreen()
    await wrapper.find('[data-test="mission-accept"]').trigger('click')
    expect(game.storyMissionOfferView).toBeNull()
    const active = game.activeStoryMissionView
    if (!active) throw new Error('expected the mission to be active after accepting')
    expect(active.id).toBe(offer.id)
    const wrapperAfter = mountScreen()
    expect(wrapperAfter.find('[data-test="mission-accept"]').exists()).toBe(false)
    expect(wrapperAfter.text()).toContain(active.title)
  })

  describe('the deliver flow (Sprint 77 decision 5)', () => {
    it('shows the requirement checklist as labels only, with no pass/fail marks, before any car is graded', () => {
      const game = useGameStore()
      game.newGame(1)
      acceptFirstMission(game)
      const wrapper = mountScreen()
      const checklist = wrapper.find('[data-test="mission-requirements"]')
      expect(checklist.exists()).toBe(true)
      // No pass/fail marks yet - every line reads as an empty box, and no
      // "actual" value (only the label + what's required) appears.
      expect(checklist.text()).not.toContain('[x]')
      expect(checklist.text()).not.toContain(' (need ')
      expect(game.activeStoryMissionView!.requirementLines.length).toBeGreaterThan(0)
      for (const line of game.activeStoryMissionView!.requirementLines) {
        expect(checklist.text()).toContain(line.label)
      }
    })

    it('"Show them the car" reveals the full [ ]/[x] checklist with actual-vs-required, and passes for a roadworthy car', async () => {
      const game = useGameStore()
      game.newGame(1)
      acceptFirstMission(game)
      const carId = grantRoadworthyCar(game)

      const wrapper = mountScreen()
      await wrapper.find('[data-test="mission-pick-car"]').setValue(carId)
      await wrapper.find('[data-test="mission-grade"]').trigger('click')

      const checklist = wrapper.find('[data-test="mission-requirements"]')
      expect(checklist.text()).toContain('[x]')
      expect(checklist.text()).toContain('need')
      expect(wrapper.find('[data-test="mission-deliver"]').exists()).toBe(true)
    })

    it('changing the picked car resets the checklist back to labels-only (grading is never live)', async () => {
      const game = useGameStore()
      game.newGame(1)
      acceptFirstMission(game)
      const carId = grantRoadworthyCar(game)

      const wrapper = mountScreen()
      await wrapper.find('[data-test="mission-pick-car"]').setValue(carId)
      await wrapper.find('[data-test="mission-grade"]').trigger('click')
      expect(wrapper.find('[data-test="mission-requirements"]').text()).toContain('[x]')

      const secondCarId = grantRoadworthyCar(game)
      await wrapper.find('[data-test="mission-pick-car"]').setValue(secondCarId)
      expect(wrapper.find('[data-test="mission-requirements"]').text()).not.toContain('[x]')
      expect(wrapper.find('[data-test="mission-deliver"]').exists()).toBe(false)
    })

    it('"Hand it over" is absent until every line passes, and never appears for an ungraded car', async () => {
      const game = useGameStore()
      game.newGame(1)
      acceptFirstMission(game)
      // Freshly dev-granted (not bumped to mint) - real content only ever
      // rolls 'worn'-or-better bands for a mint-adjacent generation, so
      // force a genuinely failing slot to prove the gate holds either way.
      game.devGrantCar(CARS[0]!.id)
      const car = game.gameState.ownedCars[game.gameState.ownedCars.length - 1]!
      game.gameState = {
        ...game.gameState,
        ownedCars: game.gameState.ownedCars.map((c) =>
          c.id === car.id ? { ...c, parts: { ...c.parts, block: { installed: null } } } : c,
        ),
      }

      const wrapper = mountScreen()
      expect(wrapper.find('[data-test="mission-deliver"]').exists()).toBe(false)
      await wrapper.find('[data-test="mission-pick-car"]').setValue(car.id)
      expect(wrapper.find('[data-test="mission-deliver"]').exists()).toBe(false)
      await wrapper.find('[data-test="mission-grade"]').trigger('click')
      expect(game.gradeMission(car.id).pass).toBe(false)
      expect(wrapper.find('[data-test="mission-deliver"]').exists()).toBe(false)
    })

    it('"Hand it over" requires two clicks (the two-step confirm), and delivering removes the car and pays out', async () => {
      const game = useGameStore()
      game.newGame(1)
      const missionId = acceptFirstMission(game)
      const carId = grantRoadworthyCar(game)
      const cashBefore = game.cashYen

      const wrapper = mountScreen()
      await wrapper.find('[data-test="mission-pick-car"]').setValue(carId)
      await wrapper.find('[data-test="mission-grade"]').trigger('click')

      const deliverButton = wrapper.find('[data-test="mission-deliver"]')
      expect(deliverButton.text()).toBe('Hand it over')
      await deliverButton.trigger('click')
      // Still owned - the first click only arms the confirm.
      expect(game.gameState.ownedCars.some((c) => c.id === carId)).toBe(true)
      expect(wrapper.find('[data-test="mission-deliver"]').text()).toContain('Confirm')

      await wrapper.find('[data-test="mission-deliver"]').trigger('click')
      expect(game.gameState.ownedCars.some((c) => c.id === carId)).toBe(false)
      expect(game.activeStoryMissionView).toBeNull()
      expect(game.gameState.storyMissions.find((r) => r.missionId === missionId)?.status).toBe(
        'delivered',
      )
      expect(game.cashYen).toBeGreaterThan(cashBefore)
      expect(game.lastMissionResult).not.toBeNull()
    })

    /**
     * Sprint 77 decision 4: neither Sprint 76 placeholder mission carries a
     * `lapTimeCeiling` requirement (real lap-time missions are Sprint 78
     * content), so this proves the board's `v-if` gate correctly hides it
     * rather than rendering an empty/broken table. Full reference-board
     * rendering (correct straddling rows, anchor grouping, and the
     * candidate's own time never appearing) is proven at the sim level in
     * `packages/sim/tests/lapModel.test.ts`; true end-to-end coverage
     * arrives once a real lap-time mission ships.
     */
    it('shows no reference-lap board for a mission with no lapTimeCeiling requirement', async () => {
      const game = useGameStore()
      game.newGame(1)
      acceptFirstMission(game)
      const carId = grantRoadworthyCar(game)
      expect(game.activeStoryMissionView!.lapTimeCeiling).toBeNull()

      const wrapper = mountScreen()
      await wrapper.find('[data-test="mission-pick-car"]').setValue(carId)
      await wrapper.find('[data-test="mission-grade"]').trigger('click')
      expect(wrapper.find('[data-test="mission-lap-board"]').exists()).toBe(false)
    })
  })

  describe('the real campaign (Sprint 78)', () => {
    it("delivering four-wheels shows Yuki's own deliveredCopy in the completion receipt", async () => {
      const game = useGameStore()
      game.newGame(1)
      acceptFirstMission(game)
      const carId = grantRoadworthyCar(game)

      const wrapper = mountScreen()
      await wrapper.find('[data-test="mission-pick-car"]').setValue(carId)
      await wrapper.find('[data-test="mission-grade"]').trigger('click')
      await wrapper.find('[data-test="mission-deliver"]').trigger('click')
      await wrapper.find('[data-test="mission-deliver"]').trigger('click')

      expect(game.lastMissionResult?.personaName).toBe('Yuki')
      expect(game.lastMissionResult?.copy).toBe(
        'It starts. You have no idea what that means to me.',
      )
    })

    /**
     * Sprint 85 decision 2 (playtest 18, directive 17 case (a)): story missions
     * are unfailable now, so the old "lapses then reoffers after reofferDays"
     * flow is gone. An accepted mission stays active however many days pass,
     * with no reputation penalty. Skips straight to `the-column-clock` (mission
     * 5, gate 200) by marking the four earlier missions delivered directly,
     * the same setup the removed lapse test used.
     */
    it('an accepted mission (the-column-clock) never lapses, however many days pass', () => {
      const game = useGameStore()
      game.newGame(1)
      const earlierMissionIds = [
        'four-wheels',
        'wont-strand-her',
        'first-proper-car',
        'make-it-pull',
      ]
      game.gameState = {
        ...game.gameState,
        reputationPoints: 200,
        storyMissions: earlierMissionIds.map((missionId) => ({
          missionId,
          status: 'delivered' as const,
          acceptedOnDay: 1,
        })),
      }
      game.endDay()
      const offer = game.storyMissionOfferView
      if (!offer || offer.id !== 'the-column-clock') {
        throw new Error(`expected the-column-clock offered, got ${offer?.id ?? 'nothing'}`)
      }
      game.acceptMission(offer.id)

      // Warp far past any old deadline window - the mission stays active and
      // reputation is never penalised.
      for (let i = 0; i < 40; i++) game.endDay()
      const record = game.gameState.storyMissions.find((r) => r.missionId === 'the-column-clock')!
      expect(record.status).toBe('active')
      expect(game.reputationPoints).toBeGreaterThanOrEqual(200)
    })
  })
})
